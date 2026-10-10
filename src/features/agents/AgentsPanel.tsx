import { useMemo } from 'react'
import { ArrowLeft, Bot, CircleAlert, LoaderCircle } from 'lucide-react'
import { useI18n } from '../../i18n'
import Markdown from '../../components/Markdown'
import { useOptionalRuntimeStore } from '../engine/EngineContext'
import type { RuntimeStore } from '../engine/runtimeStore'
import { useSessionTimelines } from '../engine/sessionSelectors'
import { formatTool } from '../activity/formatActivity'
import { turnIsActive } from '../activity/activityPresentation'
import type { AgentTimelineItem, TimelineItem, TurnTimeline } from '../activity/types'
import { useAgentFocusStore } from '../../stores/agentFocus'
import { art } from '../rinari/art'
import { cn } from '../../lib/utils'

interface AgentEntry {
  item: AgentTimelineItem
  turnId: string
  live: boolean
}

/** Subagentes de la sesión, el más reciente primero, con el turno que los lanzó. */
export function sessionAgents(timelines: Record<string, TurnTimeline>): AgentEntry[] {
  const entries: AgentEntry[] = []
  const visit = (items: TimelineItem[], turn: TurnTimeline) => {
    for (const item of items) {
      if (item.type !== 'agent') continue
      entries.push({ item, turnId: turn.turnId, live: turnIsActive(turn.status) && item.status === 'running' })
      if (item.items) visit(item.items, turn)
    }
  }
  for (const turn of Object.values(timelines)) visit(turn.items, turn)
  return entries.sort((a, b) => (b.item.occurredAt ?? 0) - (a.item.occurredAt ?? 0))
}

function statusOf(entry: AgentEntry): 'running' | 'done' | 'failed' | 'stopped' {
  if (entry.live) return 'running'
  if (entry.item.status === 'completed') return 'done'
  if (entry.item.status === 'failed') return 'failed'
  return 'stopped'
}

/**
 * Panel «Agentes»: la lista de subagentes de la conversación con su estado, y
 * el detalle de uno con lo que está haciendo. La conversación solo muestra
 * una línea por subagente; aquí está todo, sin llenar el chat.
 */
export default function AgentsPanel({ sessionId }: { sessionId: string }) {
  const store = useOptionalRuntimeStore()
  return store ? <AgentsPanelBody store={store} sessionId={sessionId} /> : <AgentsEmpty />
}

function AgentsEmpty() {
  const { t } = useI18n()
  return (
    <div className="dock-empty">
      <img src={art.chibi('telescope')} alt="" draggable={false} />
      <p className="font-display text-[15px] font-bold text-[var(--text)]">{t('agents.panelEmpty')}</p>
      <p>{t('agents.panelEmptyHint')}</p>
    </div>
  )
}

function AgentsPanelBody({ store, sessionId }: { store: RuntimeStore; sessionId: string }) {
  const { t, lang } = useI18n()
  const timelines = useSessionTimelines(store, sessionId)
  const agents = useMemo(() => sessionAgents(timelines), [timelines])
  const focused = useAgentFocusStore((state) => state.bySession[sessionId] ?? null)
  const focus = useAgentFocusStore((state) => state.focus)
  const selected = agents.find((entry) => entry.item.agentId === focused) ?? null
  const counts = agents.reduce((acc, entry) => { acc[statusOf(entry)]++; return acc }, { running: 0, done: 0, failed: 0, stopped: 0 })

  if (agents.length === 0) return <AgentsEmpty />

  if (selected) {
    const state = statusOf(selected)
    return (
      <div className="agents-panel">
        <button type="button" className="btn btn-quiet btn-sm self-start" onClick={() => focus(sessionId, null)}><ArrowLeft size={14} /> {t('agents.panelBack')}</button>
        <div className="agent-entry is-selected" data-state={state}>
          <AgentGlyph state={state} />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-[var(--text)]">{selected.item.agent}</div>
            {selected.item.objective && <div className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">{selected.item.objective}</div>}
            {(selected.item.profile || selected.item.cwd) && <div className="mt-1 break-all font-mono text-[10.5px] text-[var(--text-subtle)]">{[selected.item.profile, selected.item.cwd].filter(Boolean).join(' · ')}</div>}
          </div>
          <span className="agent-state">{t(`agents.state.${state}`)}</span>
        </div>
        <ol className="agent-steps">
          {(selected.item.items ?? []).map((child) => {
            if (child.type === 'model') return child.content ? <li key={child.id} className="agent-step is-text"><Markdown>{child.content}</Markdown></li> : null
            if (child.type === 'tool') {
              const running = selected.live && (child.status === 'running' || child.status === 'requested')
              const failed = child.status === 'failed' || child.status === 'cancelled'
              return <li key={child.id} className="agent-step" data-state={running ? 'running' : failed ? 'failed' : 'done'}>{formatTool(child, lang)}</li>
            }
            return null
          })}
          {selected.item.summary && <li className="agent-step is-text"><Markdown>{selected.item.summary}</Markdown></li>}
          {!selected.item.items?.length && !selected.item.summary && <li className="agent-step is-text text-[var(--text-subtle)]">{state === 'running' ? t('agents.panelWaiting') : t('activity.noDetails')}</li>}
        </ol>
        <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => window.dispatchEvent(new CustomEvent('rinari:reveal-turn', { detail: { sessionId, turnId: selected.turnId } }))}>{t('agents.panelGoToTurn')}</button>
      </div>
    )
  }

  return (
    <div className="agents-panel">
      <p className="text-[12px] text-[var(--text-muted)]">
        {[counts.running && t('agents.countRunning', { n: counts.running }), counts.done && t('agents.countDone', { n: counts.done }), (counts.failed + counts.stopped) && t('agents.countFailed', { n: counts.failed + counts.stopped })].filter(Boolean).join(' · ')}
      </p>
      <ul className="space-y-2">
        {agents.map((entry) => {
          const state = statusOf(entry)
          const steps = (entry.item.items ?? []).filter((child) => child.type === 'tool').length
          return (
            <li key={`${entry.turnId}:${entry.item.agentId}`}>
              <button type="button" className="agent-entry" data-state={state} onClick={() => focus(sessionId, entry.item.agentId)}>
                <AgentGlyph state={state} />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13.5px] font-semibold text-[var(--text)]">{entry.item.agent}</span>
                  {entry.item.objective && <span className="block truncate text-[12px] text-[var(--text-muted)]">{entry.item.objective}</span>}
                </span>
                <span className="text-right">
                  <span className="agent-state block">{t(`agents.state.${state}`)}</span>
                  {steps > 0 && <span className="block font-mono text-[10.5px] text-[var(--text-subtle)]">{t('agents.steps', { n: steps })}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function AgentGlyph({ state }: { state: string }) {
  return (
    <span className={cn('agent-glyph')} data-state={state} aria-hidden="true">
      {state === 'running' ? <LoaderCircle size={15} className="r-spin" /> : state === 'failed' || state === 'stopped' ? <CircleAlert size={15} /> : <Bot size={15} />}
    </span>
  )
}
