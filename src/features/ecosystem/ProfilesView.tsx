import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type AgentView,
  type ModelSummary,
  type ProfileBundle,
  type SoulSummary,
} from '../../services/engine'
import { useI18n } from '../../i18n'
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

/** El alma de un perfil nuevo es la de Rinari (#86). */
const DEFAULT_SOUL = 'rinari-default'
/** «Como el general»: el agente sigue la asignación global. */
const INHERIT = ''

interface FormState {
  /** Editando uno existente; vacío al crear o duplicar (el id lo pone el Engine). */
  id: string | null
  name: string
  description: string
  soul_id: string
  agents: Record<string, string>
}

const emptyForm = (): FormState => ({ id: null, name: '', description: '', soul_id: DEFAULT_SOUL, agents: {} })

/**
 * Ajustes → Perfiles (plan 0.4.0 #86): cada tarjeta cuenta lo que es el
 * perfil —su alma, el modelo de cada agente (o «como el general») y cuánto
 * trabajo agrupa— con «Usar este perfil», «Editar», «Duplicar» y «Eliminar».
 * Crear y editar es un formulario con selectores; el id lo genera el Engine
 * a partir del nombre y el modo ya no es parte de un perfil.
 */
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

  async function use(profile: ProfileBundle) {
    try {
      await useProfileStore.getState().activate(profile.id)
      toast.success(t('rbundles.using', { name: profile.name }))
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
      name: duplicate ? t('rbundles.copyName', { name: profile.name }) : profile.name,
      description: profile.description,
      soul_id: profile.soul_id || DEFAULT_SOUL,
      agents: Object.fromEntries(Object.entries(profile.agents ?? {}).map(([agent, value]) => [agent, value.model ?? INHERIT])),
    })
  }

  async function save() {
    if (!form || form.name.trim() === '') return
    setSaving(true)
    const agentsMap = Object.fromEntries(
      Object.entries(form.agents).filter(([, model]) => model !== INHERIT).map(([agent, model]) => [agent, { model }]),
    )
    try {
      if (form.id) {
        await engineApi.bundleUpdate(form.id, { name: form.name.trim(), description: form.description.trim(), soul_id: form.soul_id, agents: agentsMap })
      } else {
        await engineApi.bundleCreate({ name: form.name.trim(), description: form.description.trim(), soul_id: form.soul_id, agents: agentsMap })
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

  const modelOptions = [{ value: INHERIT, label: t('rbundles.inherit') }, ...models.map((model) => ({ value: model.alias, label: model.alias, detail: model.provider ?? undefined }))]

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
              <span className="profile-card-mark" aria-hidden="true">{profile.name.trim().charAt(0).toUpperCase() || '·'}</span>
              <span className="profile-card-name">{profile.name}</span>
              {profile.active && <span className="r-chip" data-tone="accent"><Check size={11} aria-hidden="true" /> {t('rbundles.inUse')}</span>}
            </header>
            {profile.description && <p className="profile-card-desc">{profile.description}</p>}
            <dl className="profile-card-facts">
              <div><dt>{t('rbundles.soul')}</dt><dd><Sparkles size={12} aria-hidden="true" /> {soulName(profile.soul_id)}</dd></div>
              {agents.map((agent) => {
                const own = profile.agents?.[agent.name]?.model
                return (
                  <div key={agent.name} data-agent={agent.name}>
                    <dt>{agent.name}</dt>
                    <dd data-own={own ? true : undefined}>{own ? modelName(own) : t('rbundles.asGeneral', { model: modelName(agent.assignment?.model) ?? '—' })}</dd>
                  </div>
                )
              })}
              <div><dt>{t('rbundles.work')}</dt><dd>{t('rbundles.workCounts', { projects: profile.counts?.projects ?? 0, sessions: profile.counts?.sessions ?? 0 })}</dd></div>
            </dl>
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
        <DialogContent className="max-w-lg" data-testid="profile-form">
          <DialogHeader>
            <DialogTitle>{form?.id ? t('rbundles.editTitle') : t('rbundles.create')}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
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
                  {agents.map((agent) => (
                    <div key={agent.name} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-xs text-[var(--text-muted)]">{agent.name}</span>
                      <Select<string>
                        className="flex-1"
                        value={form.agents[agent.name] ?? INHERIT}
                        label={agent.name}
                        options={modelOptions}
                        onChange={(model) => setForm({ ...form, agents: { ...form.agents, [agent.name]: model } })}
                      />
                    </div>
                  ))}
                  <p className="text-[11px] text-[var(--text-subtle)]">{t('rbundles.inheritHint')}</p>
                </div>
              )}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="btn btn-ghost btn-sm">{t('providers.cancel')}</button>
            <button type="button" onClick={() => void save()} disabled={saving || !form?.name.trim()} className="btn btn-primary btn-sm" data-testid="profile-save">{t('providers.save')}</button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rbundles.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{removing && t('rbundles.confirmDeleteV2', { name: removing.name })}</AlertDialogDescription>
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
