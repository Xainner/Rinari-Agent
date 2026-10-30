import { ListTree, PanelRightOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { useSessionDockStore } from '../../stores/sessionDock'
import { useReadTracking } from '../board/useResultVisibility'
import { parsePlan, sessionPlans } from './planModel'
import PlanAdjust from './PlanAdjust'
import { useOptionalRuntimeStore } from '../engine/EngineContext'
import { selectSessionTimelines } from '../engine/sessionSelectors'
import { useStore } from 'zustand'
import type { RuntimeStore } from '../engine/runtimeStore'

const PREVIEW_STEPS = 4

/**
 * El plan en el chat, como tarjeta compacta (plan 0.4.0 #55): su título,
 * cuántos pasos tiene con los primeros a la vista y un resumen corto. «Ver
 * plan» lo abre entero en el panel lateral; las acciones de implementar van
 * debajo. Un plan largo ya no llena el chat.
 */
export default function PlanCard({ content, turnId, actions, children }: { content: string; turnId?: string; actions?: ReactNode; children?: ReactNode }) {
  const { t } = useI18n()
  const sessionId = useReadTracking()?.sessionId ?? null
  const runtime = useOptionalRuntimeStore()
  const openView = useSessionDockStore((state) => state.openView)
  const plan = parsePlan(content)
  const more = plan.steps.length - PREVIEW_STEPS
  return (
    <section aria-label={t('plan.card.label')} className="plan-card" data-testid="plan-card">
      <header className="plan-card-head">
        <span className="plan-card-icon" aria-hidden="true"><ListTree size={14} /></span>
        <span className="plan-card-kicker">{t('plan.card.label')}</span>
        {runtime && sessionId && turnId && <PlanVersion store={runtime} sessionId={sessionId} turnId={turnId} />}
        {plan.steps.length > 0 && <span className="r-chip plan-card-count" data-tone="accent">{t('plan.view.steps', { n: plan.steps.length })}</span>}
      </header>
      {plan.title && <h3 className="plan-card-title">{plan.title}</h3>}
      {plan.summary && plan.summary !== plan.title && <p className="plan-card-summary">{plan.summary}</p>}
      {plan.steps.length > 0 && (
        <ol className="plan-card-steps">
          {plan.steps.slice(0, PREVIEW_STEPS).map((step, index) => <li key={index}>{step}</li>)}
          {more > 0 && <li className="plan-card-more">{t('plan.card.more', { n: more })}</li>}
        </ol>
      )}
      {children}
      <div className="plan-card-actions">
        {sessionId && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openView(sessionId, 'plan')}>
            <PanelRightOpen size={13} aria-hidden="true" /> {t('plan.card.open')}
          </button>
        )}
        {actions && sessionId && turnId && <PlanAdjust sessionId={sessionId} planTurnId={turnId} />}
        {actions}
      </div>
    </section>
  )
}

/** «v2» cuando el plan es un ajuste de otro (#55). */
function PlanVersion({ store, sessionId, turnId }: { store: RuntimeStore; sessionId: string; turnId: string }) {
  const { t } = useI18n()
  const version = useStore(store, (state) => sessionPlans(selectSessionTimelines(state, sessionId)).find((plan) => plan.turnId === turnId)?.version ?? 1)
  return version > 1 ? <span className="r-chip plan-card-version" data-tone="accent">{t('plan.view.version', { n: version })}</span> : null
}
