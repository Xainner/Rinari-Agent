import { Hammer, ListOrdered, NotebookText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from '../../components/Markdown'
import { useI18n } from '../../i18n'
import { useOptionalEngineCommands, useOptionalEngineData, useOptionalRuntimeStore } from '../engine/EngineContext'
import type { RuntimeStore } from '../engine/runtimeStore'
import { useSessionTimelines } from '../engine/sessionSelectors'
import type { TurnTimeline } from '../activity/types'
import { sessionPlans, type PlanEntry } from './planModel'

/**
 * La vista «Plan» del panel lateral (plan 0.4.0 #55): el plan completo bien
 * presentado, con sus pasos como lista y sus secciones plegables, y las
 * acciones arriba, fijas. Con varios planes en la conversación enseña el
 * último y deja elegir los anteriores.
 */
export default function PlanView({ sessionId }: { sessionId: string }) {
  const runtime = useOptionalRuntimeStore()
  return runtime ? <WithTimelines store={runtime} sessionId={sessionId} /> : <Body sessionId={sessionId} timelines={EMPTY} />
}
const EMPTY: Record<string, TurnTimeline> = {}

function WithTimelines({ store, sessionId }: { store: RuntimeStore; sessionId: string }) {
  const timelines = useSessionTimelines(store, sessionId)
  return <Body sessionId={sessionId} timelines={timelines} />
}

function Body({ sessionId, timelines }: { sessionId: string; timelines: Record<string, TurnTimeline> }) {
  const { t, lang } = useI18n()
  const commands = useOptionalEngineCommands()
  const busy = useOptionalEngineData()?.busySessionIds?.has?.(sessionId) ?? false
  const plans = useMemo(() => sessionPlans(timelines), [timelines])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  // Un plan nuevo pasa a ser el que se ve.
  const latestId = plans[0]?.turnId ?? null
  const seenLatest = useRef(latestId)
  useEffect(() => {
    if (latestId === seenLatest.current) return
    seenLatest.current = latestId
    setSelectedId(null)
  }, [latestId])
  const plan: PlanEntry | null = plans.find((entry) => entry.turnId === selectedId) ?? plans[0] ?? null
  const clock = (at: number) => new Date(at).toLocaleTimeString(lang === 'es' ? 'es' : 'en', { hour: '2-digit', minute: '2-digit' })

  if (!plan) return <p className="plan-view-empty"><NotebookText size={16} aria-hidden="true" /> {t('plan.view.none')}</p>
  const latest = plan.turnId === latestId
  return (
    <div className="plan-view" data-testid="plan-view" data-turn-id={plan.turnId}>
      <div className="plan-view-bar">
        {plans.length > 1 ? (
          <select className="changes-turn-select" aria-label={t('plan.view.pick')} value={plan.turnId} onChange={(event) => setSelectedId(event.target.value)}>
            {plans.map((entry, index) => (
              <option key={entry.turnId} value={entry.turnId}>
                {index === 0 ? t('plan.view.latest', { time: clock(entry.startedAt) }) : t('plan.view.at', { time: clock(entry.startedAt) })}
              </option>
            ))}
          </select>
        ) : <span className="plan-view-when">{t('plan.view.at', { time: clock(plan.startedAt) })}</span>}
        <span className="flex-1" />
        {latest && commands && (
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={busy || starting}
            onClick={async () => {
              setStarting(true)
              try { await commands.implementPlanFor(sessionId) } finally { setStarting(false) }
            }}
          >
            <Hammer size={12} aria-hidden="true" /> {starting ? t('plan.starting') : t('plan.implement')}
          </button>
        )}
      </div>
      <div className="plan-view-body">
        <h2 className="plan-view-title">{plan.title || t('plan.view.untitled')}</h2>
        {plan.steps.length > 0 && (
          <section className="plan-view-steps" aria-label={t('plan.view.steps', { n: plan.steps.length })}>
            <p className="plan-view-label"><ListOrdered size={12} aria-hidden="true" /> {t('plan.view.steps', { n: plan.steps.length })}</p>
            <ol>{plan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          </section>
        )}
        {plan.sections.map((section, index) => section.title ? (
          // La sección de pasos repite la lista de arriba: empieza plegada.
          <details key={index} className="plan-view-section" open={!(plan.steps.length > 0 && /^(pasos|steps)/i.test(section.title))}>
            <summary>{section.title}</summary>
            <div className="plan-view-md"><Markdown>{section.body}</Markdown></div>
          </details>
        ) : (
          <div key={index} className="plan-view-md"><Markdown>{section.body}</Markdown></div>
        ))}
      </div>
    </div>
  )
}
