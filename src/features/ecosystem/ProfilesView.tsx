import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronRight, Copy, PanelLeft, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type AgentView,
  type ModelSummary,
  type ProfileBundle,
  type SoulSummary,
} from '../../services/engine'
import { useI18n, type I18nKey } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { art } from '../rinari/art'
import { inputClass, labelClass } from '../../components/settings/parts'
import { Select } from '../../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { useProfileStore } from '../profiles/profileStore'
import { useAgentType } from '../agents/agentLabel'

/** El alma de un perfil nuevo es la de Rinari (#86). */
const DEFAULT_SOUL = 'rinari-default'
/** «Como el general»: el agente sigue la asignación global. */
const INHERIT = ''
/** Los esfuerzos que el Engine acepta por agente (`agents/config.py` EFFORTS). */
const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const

interface AgentForm {
  model: string
  fallback: string
  effort: string
}

interface FormState {
  /** Editando uno existente; vacío al crear o duplicar (el id lo pone el Engine). */
  id: string | null
  name: string
  description: string
  soul_id: string
  agents: Record<string, AgentForm>
}

const emptyForm = (): FormState => ({ id: null, name: '', description: '', soul_id: DEFAULT_SOUL, agents: {} })

/**
 * Ajustes → Perfiles (plan 0.4.0 #86): cada tarjeta cuenta lo que es el
 * perfil —su alma, el modelo de cada agente (o «como el general») y cuánto
 * trabajo agrupa— con «Usar este perfil», «Editar», «Duplicar» y «Eliminar».
 * Crear y editar es un formulario con selectores; el id lo genera el Engine
 * a partir del nombre y el modo ya no es parte de un perfil.
 */
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export default function ProfilesView({ onChanged }: { activeSessionId?: string | null; onChanged: () => void }) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<ProfileBundle[]>([])
  const [souls, setSouls] = useState<SoulSummary[]>([])
  const [agents, setAgents] = useState<AgentView[]>([])
  const [models, setModels] = useState<ModelSummary[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<ProfileBundle | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.bundleList()
      setProfiles(result.profiles)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    engineApi.soulList().then((result) => setSouls(result.souls)).catch(() => setSouls([]))
    engineApi.agentList().then((result) => setAgents(result.agents)).catch(() => setAgents([]))
    engineApi.modelList().then((result) => setModels(result.models)).catch(() => setModels([]))
  }, [reload])

  const soulName = (id: string | null | undefined) => souls.find((soul) => soul.id === (id || DEFAULT_SOUL))?.name ?? (id || 'Rinari')
  const modelName = (alias: string | null | undefined) => {
    if (!alias) return null
    const model = models.find((item) => item.alias === alias || item.id === alias)
    return model ? `${model.alias}${model.provider ? ` · ${model.provider}` : ''}` : alias
  }

  // El perfil incluido se guarda como «Default»; se muestra en el idioma de la app, como en la barra lateral.
  const builtinDefault = (profile: Pick<ProfileBundle, 'name' | 'builtin'>) => Boolean(profile.builtin && profile.name === 'Default')
  const profileLabel = (profile: Pick<ProfileBundle, 'name' | 'builtin'>) => (builtinDefault(profile) ? t('profiles.defaultName') : profile.name)

  async function use(profile: ProfileBundle) {
    try {
      await useProfileStore.getState().activate(profile.id)
      toast.success(t('rbundles.using', { name: profileLabel(profile) }))
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const open = (profile: ProfileBundle | null, duplicate = false) => {
    if (!profile) return setForm(emptyForm())
    setForm({
      id: duplicate ? null : profile.id,
      name: duplicate ? t('rbundles.copyName', { name: profileLabel(profile) }) : profileLabel(profile),
      description: profile.description,
      soul_id: profile.soul_id || DEFAULT_SOUL,
      agents: Object.fromEntries(Object.entries(profile.agents ?? {}).map(([agent, value]) => [agent, { model: value.model ?? INHERIT, fallback: value.fallback ?? INHERIT, effort: value.effort ?? INHERIT }])),
    })
  }

  async function save() {
    if (!form || form.name.trim() === '') return
    setSaving(true)
    // Sin renombrarlo, el incluido sigue llamándose «Default» por dentro.
    const original = form.id ? profiles.find((profile) => profile.id === form.id) : undefined
    const name = original && builtinDefault(original) && form.name.trim() === profileLabel(original) ? original.name : form.name.trim()
    // Solo lo que el perfil cambia; lo vacío sigue la asignación general.
    const agentsMap = Object.fromEntries(
      Object.entries(form.agents)
        .map(([agent, value]) => [agent, Object.fromEntries(Object.entries(value).filter(([, item]) => item !== INHERIT))] as const)
        .filter(([, value]) => Object.keys(value).length > 0),
    )
    try {
      if (form.id) {
        await engineApi.bundleUpdate(form.id, { name, description: form.description.trim(), soul_id: form.soul_id, agents: agentsMap })
      } else {
        await engineApi.bundleCreate({ name, description: form.description.trim(), soul_id: form.soul_id, agents: agentsMap })
      }
      setForm(null)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!removing) return
    try {
      await engineApi.bundleRemove(removing.id)
      setRemoving(null)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  /** «Ver en la barra lateral»: la barra muestra el trabajo del perfil activo. */
  async function showInSidebar(profile: ProfileBundle) {
    if (!profile.active) await use(profile)
    const ui = useUIStore.getState()
    ui.setSidebarCollapsed(false)
    ui.goBackToWork()
  }

  const agentForm = (name: string): AgentForm => form?.agents[name] ?? { model: INHERIT, fallback: INHERIT, effort: INHERIT }
  const setAgent = (name: string, patch: Partial<AgentForm>) => form && setForm({ ...form, agents: { ...form.agents, [name]: { ...agentForm(name), ...patch } } })
  const effortOptions = [{ value: INHERIT, label: t('rbundles.inheritShort') }, ...EFFORTS.map((level) => ({ value: level, label: t(`thinking.${level}` as I18nKey) }))]
  const typeOf = useAgentType()
  /**
   * Las filas de agentes de una tarjeta: uno por fila si tiene algo propio
   * (resaltado); los que heredan, juntos en una fila por cada texto distinto,
   * para no repetir seis veces «como el general».
   */
  const agentRows = (profile: ProfileBundle) => {
    const rows: Array<{ key: string; names: string[]; label: string; text: string; extra: string; own: boolean }> = []
    const inherited = new Map<string, string[]>()
    for (const agent of agents) {
      const own = profile.agents?.[agent.name]
      const extra = [own?.fallback && t('rbundles.fallbackShort', { model: modelName(own.fallback) ?? own.fallback }), own?.effort && t(`thinking.${own.effort}` as I18nKey)].filter(Boolean).join(' · ')
      if (own?.model || extra) {
        const general = modelName(agent.assignment?.model)
        const text = own?.model ? modelName(own.model) ?? own.model : general ? t('rbundles.asGeneral', { model: general }) : t('rbundles.asGeneralChat')
        rows.push({ key: agent.name, names: [agent.name], label: capitalize(typeOf(agent.name)), text, extra, own: Boolean(own?.model) })
        continue
      }
      const general = modelName(agent.assignment?.model)
      const text = general ? t('rbundles.asGeneral', { model: general }) : t('rbundles.asGeneralChat')
      inherited.set(text, [...(inherited.get(text) ?? []), agent.name])
    }
    for (const [text, names] of inherited) {
      const label = names.length === 1 ? capitalize(typeOf(names[0])) : rows.length === 0 && inherited.size === 1 ? t('rbundles.allAgents') : inherited.size === 1 ? t('rbundles.otherAgents') : names.map(typeOf).join(', ')
      rows.push({ key: `inherit:${text}`, names, label, text, extra: '', own: false })
    }
    return rows
  }
  const modelOptions = [{ value: INHERIT, label: t('rbundles.inheritShort') }, ...models.map((model) => ({ value: model.alias, label: model.alias, detail: model.provider ?? undefined }))]

  return (
    <div className="space-y-4" data-testid="profiles-view">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('rbundles.title')}</h2>
        <button type="button" onClick={() => open(null)} className="btn btn-primary">{t('rbundles.create')}</button>
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">{t('rbundles.explainV2')}</p>
      {profiles.length === 0 && (
        <div className="mcp-empty rounded-[var(--r-lg)] border border-dashed border-[var(--line-2)]">
          <img src={art.chibi('typing')} alt="" draggable={false} />
          <p className="text-sm text-[var(--text)]">{t('rbundles.empty')}</p>
        </div>
      )}

      <div className="profiles-grid">
        {profiles.map((profile) => (
          <article key={profile.id} className="profile-card settings-card" data-testid="profile-card" data-active={profile.active || undefined}>
            <header className="profile-card-head">
              <span className="profile-card-mark" aria-hidden="true">{profileLabel(profile).trim().charAt(0).toUpperCase() || '·'}</span>
              <span className="profile-card-name">{profileLabel(profile)}</span>
              {profile.active && <span className="r-chip" data-tone="accent"><Check size={11} aria-hidden="true" /> {t('rbundles.inUse')}</span>}
            </header>
            {profile.description && <p className="profile-card-desc">{profile.description}</p>}
            <dl className="profile-card-facts">
              <div><dt>{t('rbundles.soul')}</dt><dd><Sparkles size={12} aria-hidden="true" /> {soulName(profile.soul_id)}</dd></div>
              {agentRows(profile).map((row) => (
                <div key={row.key} data-agent={row.names.length === 1 ? row.names[0] : undefined}>
                  <dt title={row.names.length > 1 ? row.names.map(typeOf).join(', ') : row.names[0]}>{row.label}</dt>
                  <dd data-own={row.own || undefined}>
                    <span className="min-w-0">{row.text}</span>
                    {row.extra && <span className="profile-card-extra">{row.extra}</span>}
                  </dd>
                </div>
              ))}
              <div>
                <dt>{t('rbundles.work')}</dt>
                <dd>
                  {t('rbundles.workCounts', { projects: profile.counts?.projects ?? 0, sessions: profile.counts?.sessions ?? 0 })}
                  {(profile.counts?.projects ?? 0) + (profile.counts?.sessions ?? 0) > 0 && (
                    <button type="button" className="profile-card-link" onClick={() => void showInSidebar(profile)} data-testid="profile-show-sidebar">
                      <PanelLeft size={12} aria-hidden="true" /> {t('rbundles.showInSidebar')}
                    </button>
                  )}
                </dd>
              </div>
            </dl>
            <details className="profile-card-details" data-testid="profile-details">
              <summary><ChevronRight size={12} className="profile-card-details-chevron" aria-hidden="true" />{t('rbundles.details')}</summary>
              <dl>
                <div><dt>{t('rbundles.internalId')}</dt><dd><code>{profile.id}</code></dd></div>
              </dl>
            </details>
            <div className="profile-card-actions">
              {!profile.active && <button type="button" onClick={() => void use(profile)} className="btn btn-primary btn-sm">{t('rbundles.use')}</button>}
              <button type="button" onClick={() => open(profile)} className="btn btn-secondary btn-sm"><Pencil size={12} aria-hidden="true" /> {t('rbundles.edit')}</button>
              <span className="flex-1" />
              <button type="button" onClick={() => open(profile, true)} className="btn btn-ghost btn-sm btn-icon" aria-label={t('rbundles.duplicate')} title={t('rbundles.duplicate')}><Copy size={13} aria-hidden="true" /></button>
              {!profile.builtin && (
                <button type="button" onClick={() => setRemoving(profile)} className="btn btn-ghost btn-sm btn-icon profile-card-remove" aria-label={t('rbundles.delete')} title={t('rbundles.delete')}>
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <Dialog open={form !== null} onOpenChange={(next) => !next && setForm(null)}>
        <DialogContent className="profile-form max-w-xl" data-testid="profile-form">
          <DialogHeader>
            <DialogTitle>{form?.id ? t('rbundles.editTitle') : t('rbundles.create')}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="profile-form-body space-y-4">
              <div>
                <label className={labelClass} htmlFor="profile-name">{t('rbundles.nameLabel')}</label>
                <input id="profile-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} autoComplete="off" />
              </div>
              <div>
                <label className={labelClass} htmlFor="profile-description">{t('rbundles.descriptionLabel')}</label>
                <textarea id="profile-description" value={form.description} maxLength={500} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder={t('rbundles.descriptionPlaceholder')} />
              </div>
              <div>
                <label className={labelClass} htmlFor="profile-soul">{t('rbundles.soul')}</label>
                <Select<string>
                  id="profile-soul"
                  value={form.soul_id}
                  options={(souls.length ? souls : [{ id: DEFAULT_SOUL, name: 'Rinari' } as SoulSummary]).map((soul) => ({ value: soul.id, label: soul.name }))}
                  onChange={(soul_id) => setForm({ ...form, soul_id })}
                  testId="profile-soul"
                />
              </div>
              {agents.length > 0 && (
                <div className="space-y-2">
                  <p className={labelClass}>{t('rbundles.agentModels')}</p>
                  <div className="profile-agent-row profile-agent-columns" aria-hidden="true">
                    <span />
                    <span>{t('rbundles.colModel')}</span>
                    <span>{t('rbundles.colFallback')}</span>
                    <span>{t('rbundles.colEffort')}</span>
                  </div>
                  {agents.map((agent) => {
                    const value = agentForm(agent.name)
                    return (
                      <div key={agent.name} className="profile-agent-row" role="group" aria-label={agent.name} data-agent={agent.name}>
                        <span className="profile-agent-name" title={agent.name}>{capitalize(typeOf(agent.name))}</span>
                        <Select<string> value={value.model} label={t('rbundles.model', { agent: agent.name })} options={modelOptions} onChange={(model) => setAgent(agent.name, { model })} testId={`profile-agent-model-${agent.name}`} />
                        <Select<string> value={value.fallback} label={t('rbundles.fallback', { agent: agent.name })} options={modelOptions} onChange={(fallback) => setAgent(agent.name, { fallback })} testId={`profile-agent-fallback-${agent.name}`} />
                        <Select<string> value={value.effort} label={t('rbundles.effort', { agent: agent.name })} options={effortOptions} onChange={(effort) => setAgent(agent.name, { effort })} testId={`profile-agent-effort-${agent.name}`} />
                      </div>
                    )
                  })}

                  <p className="text-[11px] text-[var(--text-subtle)]">{t('rbundles.inheritHint')}</p>
                </div>
              )}
            </div>
          )}
          <div className="profile-form-actions">
            <button type="button" onClick={() => setForm(null)} className="btn btn-ghost btn-sm">{t('providers.cancel')}</button>
            <button type="button" onClick={() => void save()} disabled={saving || !form?.name.trim()} className="btn btn-primary btn-sm" data-testid="profile-save">{t('providers.save')}</button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rbundles.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{removing && t('rbundles.confirmDeleteV2', { name: profileLabel(removing) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>{t('rbundles.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
