import { useEffect, useMemo, useState } from 'react'
import { Archive, Cpu, Eye, FolderOpen, Plug, RotateCcw, ScrollText, ShieldAlert, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi, type McpServer, type ModelSummary, type ProviderSummary } from '../../services/engine'
import ModelPicker from '../../components/composer/ModelPicker'
import { useUIStore } from '../../stores/ui'
import { SegChoice } from '../connectors/SegChoice'
import AgentAvatar from './AgentAvatar'
import { BudgetFields, ConnectorTiles, EditorHero, EditorPage, EditorSection, OptionCards } from './AgencyEditor'
import { useConnectorDirectory } from './useConnectorDirectory'
import { JobCancelledError, JobTimeoutError, runJob, useJobSignal } from './jobEvents'
import type { AgencyAgent, AgencyAgentInput, AgentPermissionProfile } from './types'

const PROFILES: AgentPermissionProfile[] = ['read-only', 'workspace', 'full-access']
const DEFAULT_MODEL = '__default__'
/** «Créalo con Rinari» llama a un modelo: si en 3 minutos no hay borrador, se dice. */
const DRAFT_TIMEOUT_MS = 180_000

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
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [servers, setServers] = useState<McpServer[]>([])
  const [saving, setSaving] = useState(false)
  const [description, setDescription] = useState('')
  const [drafting, setDrafting] = useState(false)
  const jobSignal = useJobSignal()

  // El borrador llega como evento del Engine, con el job que se pidió; la
  // suscripción va antes de pedirlo (un fallo rápido no deja el botón colgado).
  const requestDraft = async () => {
    if (!description.trim() || drafting) return
    setDrafting(true)
    try {
      const outcome = await runJob(
        () => engineApi.agencyDraft(description.trim()),
        (event) => {
          if (event.event === 'agency.draft.ready' && event.payload.draft) return { draft: event.payload.draft as Record<string, unknown> }
          if (event.event === 'agency.draft.failed') return { message: String(event.payload.message ?? '') }
          return null
        },
        DRAFT_TIMEOUT_MS,
        jobSignal(),
      )
      if ('message' in outcome) {
        toast.error(outcome.message)
        return
      }
      const draft = outcome.draft
      if (typeof draft.name === 'string') setName(draft.name)
      if (typeof draft.role === 'string') setRole(draft.role)
      if (typeof draft.instructions === 'string') setInstructions(draft.instructions)
      if (draft.permission_profile === 'read-only' || draft.permission_profile === 'workspace' || draft.permission_profile === 'full-access') {
        setProfile(draft.permission_profile)
      }
    } catch (error) {
      if (error instanceof JobCancelledError) return // the form closed meanwhile
      toast.error(error instanceof JobTimeoutError ? t('agency.jobTimeout') : commandMessage(error))
    } finally {
      setDrafting(false)
    }
  }

  useEffect(() => {
    engineApi.modelList().then((result) => setModels(result.models.filter((item) => item.saved !== false))).catch(() => {})
    engineApi.providerList().then((result) => setProviders(result.providers)).catch(() => {})
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

  const chosenModel = model === DEFAULT_MODEL ? null : models.find((item) => item.id === model) ?? null
  const { marks } = useConnectorDirectory()
  // Las marcas (logo y nombre del catálogo) de los conectores que este agente puede usar.
  const availableMarks = useMemo(() => {
    const names = new Set(available.map((server) => server.name))
    return marks.filter((mark) => names.has(mark.name))
  }, [marks, available])

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

  const autonomyIcon = { 'read-only': Eye, workspace: FolderOpen, 'full-access': ShieldAlert } as const
  const preview = { id: agent?.id ?? 'new-agent', name: name || t('agency.form.title') }

  return (
    <EditorPage
      testId="agency-agent-form"
      onSubmit={() => void submit()}
      footer={(
        <>
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
        </>
      )}
    >
      <EditorHero
        media={<AgentAvatar agent={preview} size={72} />}
        kicker={editing ? t('agency.form.editKicker') : t('agency.form.title')}
      >
        <input
          className="agency-title-input"
          value={name}
          maxLength={60}
          required
          autoFocus={!editing}
          aria-label={t('agency.form.name')}
          placeholder={t('agency.form.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
          data-testid="agency-form-name"
        />
        <input
          className="agency-subtitle-input"
          value={role}
          maxLength={120}
          aria-label={t('agency.form.role')}
          placeholder={t('agency.form.rolePlaceholder')}
          onChange={(event) => setRole(event.target.value)}
        />
      </EditorHero>

      {draftEnabled && !editing && (
        <div className="agency-draft-card" data-testid="agency-draft">
          <span className="agency-draft-spark" aria-hidden="true"><Sparkles size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="agency-draft-title">{t('agency.form.draftLabel')}</p>
            <div className="agency-draft-row">
              <input
                className="field-input"
                value={description}
                maxLength={1000}
                aria-label={t('agency.form.draftLabel')}
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
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!description.trim() || drafting}
                onClick={() => void requestDraft()}
                data-testid="agency-draft-fill"
              >
                <Sparkles size={13} aria-hidden="true" /> {t('agency.form.draftFill')}
              </button>
            </div>
            <p className="field-hint" role="status" aria-live="polite">
              {drafting ? t('agency.form.draftWorking') : t('agency.form.draftHint')}
            </p>
          </div>
        </div>
      )}

      <EditorSection icon={ScrollText} title={t('agency.form.instructions')} hint={t('agency.form.instructionsHint')}>
        <textarea
          className="field-input agency-instructions"
          value={instructions}
          maxLength={8000}
          aria-label={t('agency.form.instructions')}
          placeholder={t('agency.form.instructionsPlaceholder')}
          onChange={(event) => setInstructions(event.target.value)}
        />
        <p className="agency-count">{t('agency.form.count', { n: instructions.length, max: 8000 })}</p>
      </EditorSection>

      <EditorSection icon={Cpu} title={t('agency.form.model')} hint={t('agency.form.modelHint')} testId="agency-form-model">
        <div className="agency-model-row">
          <div className="agency-model-field">
            <ModelPicker
              models={models}
              providers={providers}
              activeAlias={chosenModel?.alias ?? null}
              activeModel={chosenModel}
              missingLabel={model === DEFAULT_MODEL ? t('agency.form.modelDefault') : t('agency.form.modelMissing')}
              onUseModel={(item) => setModel(item.id)}
              onDiscoverModels={() => {}}
              onOpenProviders={() => useUIStore.getState().goSettings('providers')}
            />
          </div>
          {model !== DEFAULT_MODEL && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setModel(DEFAULT_MODEL)}>
              <RotateCcw size={13} aria-hidden="true" /> {t('agency.form.modelUseDefault')}
            </button>
          )}
        </div>
      </EditorSection>

      <EditorSection icon={ShieldCheck} title={t('agency.form.autonomy')} hint={t('agency.form.autonomySection')}>
        <OptionCards
          value={profile}
          label={t('agency.form.autonomy')}
          testId="agency-form-autonomy"
          onChange={setProfile}
          options={PROFILES.map((value) => ({
            value,
            icon: autonomyIcon[value],
            title: t(`agency.form.autonomy.${value}` as I18nKey),
            hint: t(`agency.form.autonomyHint.${value}` as I18nKey),
            tone: value === 'full-access' ? 'warning' as const : undefined,
          }))}
        />
        <div className="agency-inline-field">
          <div className="min-w-0">
            <p className="agency-inline-title" id="agency-new-destinations">{t('agency.form.newDestinations')}</p>
            <p className="field-hint mt-0">{t('agency.form.newDestinationsHint')}</p>
          </div>
          <SegChoice<'default' | 'ask' | 'allow'>
            small
            value={newDestinations === null ? 'default' : newDestinations ? 'ask' : 'allow'}
            labelledBy="agency-new-destinations"
            options={(['default', 'ask', 'allow'] as const).map((key) => ({ value: key, label: t(`agency.form.newDestinations.${key}` as I18nKey) }))}
            onChange={(key) => setNewDestinations(key === 'default' ? null : key === 'ask')}
          />
        </div>
      </EditorSection>

      <EditorSection icon={Plug} title={t('agency.form.connectors')} hint={t('agency.form.connectorsHint')}>
        <ConnectorTiles marks={availableMarks} selected={connectors} onToggle={toggleConnector} empty={t('agency.form.noConnectors')} />
      </EditorSection>

      <EditorSection icon={Wallet} title={t('agency.form.budget')} hint={t('agency.form.budgetHint')}>
        <BudgetFields usd={usd} tokens={tokens} onUsd={setUsd} onTokens={setTokens} />
      </EditorSection>
    </EditorPage>
  )
}
