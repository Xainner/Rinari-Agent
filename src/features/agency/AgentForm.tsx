import { useEffect, useMemo, useState } from 'react'
import { Archive, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import { Select, type SelectOption } from '../../components/ui/select'
import { commandMessage, engineApi, onEngineEvent, type McpServer, type ModelSummary } from '../../services/engine'
import agencyIcon from '../../assets/agency/agency-icon.webp'
import type { AgencyAgent, AgencyAgentInput, AgentPermissionProfile } from './types'

const PROFILES: AgentPermissionProfile[] = ['read-only', 'workspace', 'full-access']
const DEFAULT_MODEL = '__default__'

interface AgentFormProps {
  /** Sin agente: «Nuevo agente». Con agente: su ficha. */
  agent?: AgencyAgent | null
  onSaved: (agent: AgencyAgent, created: boolean) => void
  onCancel: () => void
  onArchived?: (agent: AgencyAgent) => void
  /** «Créalo con Rinari» (`agency_draft_v1`): sin la capacidad no se ofrece. */
  draftEnabled?: boolean
}

function numberOrUndefined(text: string): number | undefined {
  const value = Number(text.replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * La ficha de un agente (sección 5 y D-16): en la vista principal, no en un
 * diálogo. La valida el Engine; aquí solo se arma lo que el dueño escribe.
 * «Créalo con Rinari» pide un borrador (`agency.agent.draft`) que llena el
 * formulario; el dueño lo revisa y nada se crea hasta «Crear agente».
 */
export default function AgentForm({ agent, onSaved, onCancel, onArchived, draftEnabled = false }: AgentFormProps) {
  const { t } = useI18n()
  const editing = Boolean(agent)
  const [name, setName] = useState(agent?.name ?? '')
  const [role, setRole] = useState(agent?.role ?? '')
  const [instructions, setInstructions] = useState(agent?.instructions ?? '')
  const [model, setModel] = useState<string>(agent?.model ?? DEFAULT_MODEL)
  const [profile, setProfile] = useState<AgentPermissionProfile>(agent?.permission_profile ?? 'workspace')
  // D-6: null sigue a Rinari (y pregunta en una regla que lee un conector).
  const [newDestinations, setNewDestinations] = useState<boolean | null>(agent?.ask_new_destinations ?? null)
  const [connectors, setConnectors] = useState<string[]>(agent?.connectors ?? [])
  const [usd, setUsd] = useState(agent?.budget.daily_usd ? String(agent.budget.daily_usd) : '')
  const [tokens, setTokens] = useState(agent?.budget.daily_tokens ? String(agent.budget.daily_tokens) : '')
  const [models, setModels] = useState<ModelSummary[]>([])
  const [servers, setServers] = useState<McpServer[]>([])
  const [saving, setSaving] = useState(false)
  const [description, setDescription] = useState('')
  const [draftJob, setDraftJob] = useState<string | null>(null)

  // El borrador llega como evento del Engine, con el job que se pidió.
  useEffect(() => {
    if (!draftJob) return
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      const payload = event.payload as { job_id?: string; draft?: Record<string, unknown>; message?: string }
      if (payload?.job_id !== draftJob) return
      if (event.event === 'agency.draft.ready' && payload.draft) {
        const draft = payload.draft
        if (typeof draft.name === 'string') setName(draft.name)
        if (typeof draft.role === 'string') setRole(draft.role)
        if (typeof draft.instructions === 'string') setInstructions(draft.instructions)
        if (draft.permission_profile === 'read-only' || draft.permission_profile === 'workspace' || draft.permission_profile === 'full-access') {
          setProfile(draft.permission_profile)
        }
        setDraftJob(null)
      } else if (event.event === 'agency.draft.failed') {
        toast.error(payload.message ?? '')
        setDraftJob(null)
      }
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [draftJob])

  const requestDraft = async () => {
    if (!description.trim()) return
    try {
      const started = await engineApi.agencyDraft(description.trim())
      setDraftJob(started.job_id)
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  useEffect(() => {
    engineApi.modelList().then((result) => setModels(result.models.filter((item) => item.saved !== false))).catch(() => {})
    engineApi.mcpList().then((result) => setServers(result.servers)).catch(() => {})
  }, [])

  // Los conectores de todos (globales, sin dueño) y las cuentas de este agente.
  const available = useMemo(() => {
    const own = agent ? `agent:${agent.id}` : null
    return servers.filter((server) => {
      const owner = server.owner ?? null
      return (server.scope ?? 'global') === 'global' && (owner === null || owner === own)
    })
  }, [servers, agent])

  const modelOptions: SelectOption[] = useMemo(
    () => [
      { value: DEFAULT_MODEL, label: t('agency.form.modelDefault') },
      ...models.map((item) => ({ value: item.id, label: item.alias, detail: item.provider ?? undefined })),
    ],
    [models, t],
  )

  const toggleConnector = (serverName: string) =>
    setConnectors((current) => (current.includes(serverName) ? current.filter((value) => value !== serverName) : [...current, serverName]))

  const submit = async () => {
    const input: AgencyAgentInput = {
      name: name.trim(),
      role: role.trim(),
      instructions: instructions.trim(),
      model: model === DEFAULT_MODEL ? null : model,
      permission_profile: profile,
      ask_new_destinations: newDestinations,
      connectors,
      budget: {
        ...(numberOrUndefined(usd) !== undefined ? { daily_usd: numberOrUndefined(usd) } : {}),
        ...(numberOrUndefined(tokens) !== undefined ? { daily_tokens: Math.round(numberOrUndefined(tokens)!) } : {}),
      },
    }
    setSaving(true)
    try {
      const result = agent ? await engineApi.agencyUpdateAgent(agent.id, input) : await engineApi.agencyCreateAgent(input)
      if (!agent) toast.success(t('agency.form.created', { name: result.agent.name }))
      onSaved(result.agent, !agent)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!agent) return
    try {
      const result = await engineApi.agencyArchiveAgent(agent.id)
      toast.success(t('agency.form.archived', { name: result.agent.name }))
      onArchived?.(result.agent)
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  return (
    <div className="agency-form-page" data-testid="agency-agent-form">
      <form
        className="agency-form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <header className="agency-form-head">
          <img src={agencyIcon} alt="" className="agency-form-icon" draggable={false} />
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-semibold text-[var(--text)]">
              {editing ? t('agency.form.editTitle', { name: agent!.name }) : t('agency.form.title')}
            </h1>
            <p className="field-hint">{t('agency.form.icon')}</p>
          </div>
        </header>

        {draftEnabled && !editing && (
          <div className="agency-draft" data-testid="agency-draft">
            <label className="grid min-w-0 flex-1 gap-1.5">
              <span className="field-label"><Sparkles size={13} aria-hidden="true" className="inline align-[-2px] text-[var(--accent-2)]" /> {t('agency.form.draftLabel')}</span>
              <input
                className="field-input"
                value={description}
                maxLength={1000}
                placeholder={t('agency.form.draftPlaceholder')}
                onChange={(event) => setDescription(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void requestDraft()
                  }
                }}
                data-testid="agency-draft-input"
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm self-end"
              disabled={!description.trim() || draftJob !== null}
              onClick={() => void requestDraft()}
              data-testid="agency-draft-fill"
            >
              {t('agency.form.draftFill')}
            </button>
            <p className="field-hint basis-full" role="status" aria-live="polite">
              {draftJob ? t('agency.form.draftWorking') : t('agency.form.draftHint')}
            </p>
          </div>
        )}

        <div className="agency-form-grid">
          <label className="grid gap-1.5">
            <span className="field-label">{t('agency.form.name')}</span>
            <input
              className="field-input"
              value={name}
              maxLength={60}
              required
              autoFocus={!editing}
              placeholder={t('agency.form.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
              data-testid="agency-form-name"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="field-label">{t('agency.form.role')}</span>
            <input
              className="field-input"
              value={role}
              maxLength={120}
              placeholder={t('agency.form.rolePlaceholder')}
              onChange={(event) => setRole(event.target.value)}
            />
          </label>
        </div>

        <label className="grid gap-1.5">
          <span className="field-label">{t('agency.form.instructions')}</span>
          <textarea
            className="field-input min-h-[120px] resize-y leading-relaxed"
            value={instructions}
            maxLength={8000}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <span className="field-hint">{t('agency.form.instructionsHint')}</span>
        </label>

        <div className="grid gap-1.5">
          <span className="field-label" id="agency-form-model">{t('agency.form.model')}</span>
          <Select value={model} options={modelOptions} onChange={setModel} label={t('agency.form.model')} testId="agency-form-model" />
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1.5">{t('agency.form.autonomy')}</legend>
          <div className="agency-choice" role="group" aria-label={t('agency.form.autonomy')}>
            {PROFILES.map((value) => (
              <button
                key={value}
                type="button"
                className={cn('agency-choice-option', value === profile && 'is-active')}
                aria-pressed={value === profile}
                onClick={() => setProfile(value)}
              >
                {t(`agency.form.autonomy.${value}` as I18nKey)}
              </button>
            ))}
          </div>
          <span className="field-hint">{t(`agency.form.autonomyHint.${profile}` as I18nKey)}</span>
        </fieldset>

        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1.5">{t('agency.form.newDestinations')}</legend>
          <div className="agency-choice" role="group" aria-label={t('agency.form.newDestinations')}>
            {([['default', null], ['ask', true], ['allow', false]] as const).map(([key, value]) => (
              <button
                key={key}
                type="button"
                className={cn('agency-choice-option', newDestinations === value && 'is-active')}
                aria-pressed={newDestinations === value}
                onClick={() => setNewDestinations(value)}
              >
                {t(`agency.form.newDestinations.${key}` as I18nKey)}
              </button>
            ))}
          </div>
          <span className="field-hint">{t('agency.form.newDestinationsHint')}</span>
        </fieldset>

        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1.5">{t('agency.form.connectors')}</legend>
          {available.length === 0 ? (
            <span className="field-hint">{t('agency.form.noConnectors')}</span>
          ) : (
            <div className="agency-connectors">
              {available.map((server) => (
                <label key={server.name} className="agency-connector">
                  <input
                    type="checkbox"
                    className="r-checkbox"
                    checked={connectors.includes(server.name)}
                    onChange={() => toggleConnector(server.name)}
                  />
                  <span className="truncate">{server.name}</span>
                </label>
              ))}
            </div>
          )}
          <span className="field-hint">{t('agency.form.connectorsHint')}</span>
        </fieldset>

        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1.5">{t('agency.form.budget')}</legend>
          <div className="agency-form-grid">
            <label className="grid gap-1">
              <span className="field-hint">{t('agency.form.budgetUsd')}</span>
              <input className="field-input" inputMode="decimal" value={usd} onChange={(event) => setUsd(event.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="field-hint">{t('agency.form.budgetTokens')}</span>
              <input className="field-input" inputMode="numeric" value={tokens} onChange={(event) => setTokens(event.target.value)} />
            </label>
          </div>
          <span className="field-hint">{t('agency.form.budgetHint')}</span>
        </fieldset>

        <footer className="agency-form-actions">
          {editing && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void archive()}>
              <Archive size={13} aria-hidden="true" /> {t('agency.form.archive')}
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t('agency.form.cancel')}</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim()} data-testid="agency-form-submit">
            {editing ? t('agency.form.save') : t('agency.form.create')}
          </button>
        </footer>
      </form>
    </div>
  )
}
