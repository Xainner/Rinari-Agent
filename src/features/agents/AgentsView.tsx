import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type AgentView,
  type ModelSummary,
  type SessionEvent,
} from '../../services/engine'
import { RotateCcw } from 'lucide-react'
import { useI18n } from '../../i18n'
import { Section } from '../../components/settings/parts'
import { Select } from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Ajustes > Agentes: registry built-in con asignación de modelo por agente
 * (modelo, fallback, enabled) + subagentes vivos de la sesión activa
 * (derivados de session.events: SubagentStart sin Stop).
 */
export default function AgentsView({
  models,
  activeSessionId,
  onChanged,
}: {
  models: ModelSummary[]
  activeSessionId: string | null
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [agents, setAgents] = useState<AgentView[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState<SessionEvent[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.agentList()
      setAgents(result.agents)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadLive = useCallback(async () => {
    if (!activeSessionId) {
      setLive([])
      return
    }
    try {
      const result = await engineApi.sessionEvents(activeSessionId, undefined, 100)
      setLive(
        result.events.filter(
          (e) => e.type === 'SubagentStart' || e.type === 'SubagentStop',
        ),
      )
    } catch {
      /* la vista de config no depende de los eventos vivos */
    }
  }, [activeSessionId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    void reloadLive()
    const timer = setInterval(() => void reloadLive(), 4000)
    return () => clearInterval(timer)
  }, [reloadLive])

  async function assign(name: string, patch: { model?: string; fallback?: string; enabled?: boolean }) {
    setBusy(name)
    try {
      await engineApi.agentConfigSet({ agent: name, ...patch })
      await reload()
      onChanged()
      toast.success(t('adv.saved'))
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function reset(name: string) {
    setBusy(name)
    try {
      await engineApi.agentConfigSet({ agent: name, clear: true })
      await reload()
      onChanged()
      toast.success(t('adv.saved'))
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  // Último estado por agent_id: Start sin Stop posterior = corriendo.
  const running = new Map<string, string>()
  for (const event of live) {
    const payload = event.payload as Record<string, unknown>
    const id = str(payload['agent_id'])
    if (id === '') continue
    if (event.type === 'SubagentStop') running.delete(id)
    else running.set(id, str(payload['agent']))
  }

  const modelOptions = [
    { value: '', label: t('agents.inherit') },
    ...models.filter((m) => m.saved !== false).map((m) => ({ value: m.alias, label: m.alias, detail: m.provider ?? undefined })),
  ]

  return (
    <div className="space-y-4" data-testid="agents-view">
      <div>
        <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('agents.title')}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('agents.intro')}</p>
      </div>
      {running.size > 0 && (
        <Section title={t('agents.live')}>
          <ul className="space-y-1">
            {[...running.entries()].map(([id, name]) => (
              <li key={id} className="flex items-center gap-2 font-mono text-[12px] text-[var(--text-muted)]">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--accent-2)] motion-safe:animate-pulse" />
                <span className="truncate">{name} · {id}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {loading && [0, 1].map((i) => <div key={i} className="settings-card h-28 motion-safe:animate-pulse" aria-busy="true" />)}
      {!loading && agents.length === 0 && <p className="text-sm text-[var(--text-subtle)]">{t('agents.empty')}</p>}

      {agents.map((agent) => {
        const customised = agent.assignment.model !== null || agent.assignment.fallback !== null || !agent.assignment.enabled
        return (
          <Section key={agent.name} title={agent.name}>
            <p className="text-sm text-[var(--text-muted)]">{agent.description}</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="r-chip">{agent.profile === 'inherit' ? t('agents.profileInherit') : agent.profile}</span>
              <span className="r-chip">{agent.provenance === 'project' ? t('agents.fromProject') : t('agents.builtin')}</span>
              <span className="r-chip">{t('agents.budget', { n: agent.budget.max_tool_calls })}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t('agents.model')}</span>
                <Select value={agent.assignment.model ?? ''} options={modelOptions} disabled={busy !== null} label={t('agents.model')} onChange={(value) => void assign(agent.name, { model: value || undefined })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t('agents.fallback')}</span>
                <Select value={agent.assignment.fallback ?? ''} options={modelOptions} disabled={busy !== null} label={t('agents.fallback')} onChange={(value) => void assign(agent.name, { fallback: value || undefined })} />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={agent.assignment.enabled} disabled={busy !== null} onCheckedChange={(enabled) => void assign(agent.name, { enabled })} aria-label={t('agents.enabled')} />
              <span className="text-xs text-[var(--text-muted)]">{t('agents.enabled')}</span>
              <span className="flex-1" />
              {customised && (
                <button type="button" onClick={() => void reset(agent.name)} disabled={busy !== null} className="btn btn-ghost btn-sm">
                  <RotateCcw size={12} aria-hidden="true" /> {t('agents.reset')}
                </button>
              )}
            </div>
          </Section>
        )
      })}
    </div>
  )
}
