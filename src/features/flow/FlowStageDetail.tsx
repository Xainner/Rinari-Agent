import { useEffect, useRef } from 'react'
import { Bot, Columns3, ExternalLink, FileText, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { FlowStage, ModelSummary } from '../../services/engine'
import { STAGE_KIND_KEY, STAGE_STATUS_KEY, STAGE_STATUS_KIND, durationLabel, percent } from './flowModel'
import { resolveExecutor } from './FlowStageCard'

export interface FlowStageDetailProps {
  stage: FlowStage
  models: readonly ModelSummary[]
  onClose: () => void
  onGoToTurn: (stage: FlowStage) => void
  onOpenSession: (sessionId: string) => void
  /** La etapa como tal: su acción principal va a la sesión del anchor. */
  onBoard: boolean
  /** Cada fila responde por su propia sesión, no por la del anchor. */
  isOnBoard: (sessionId: string) => boolean
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * Detalle de una etapa dentro de la vista (drawer lateral, no overlay
 * global): tiempos, progreso, sesiones, ejecutores, agentes, archivos,
 * verificaciones y checkpoints tal como los reporta el Engine. Foco al abrir,
 * Escape para cerrar, foco devuelto al cerrar.
 */
export default function FlowStageDetail({ stage, models, onClose, onGoToTurn, onOpenSession, onBoard, isOnBoard }: FlowStageDetailProps) {
  const { t } = useI18n()
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    root.current?.querySelector<HTMLElement>('button')?.focus()
    return () => previous?.focus?.()
  }, [stage.id])
  const progress = percent(stage.progress)
  const title = stage.title || stage.excerpt || t('flow.stage.untitled')
  return (
    <aside
      ref={root}
      role="complementary"
      aria-label={t('flow.detail.label', { title })}
      data-testid="flow-stage-detail"
      className="flow-detail"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header className="flow-detail-head">
        <div className="min-w-0">
          <span className="flow-stage-step">{t('flow.stage.step', { n: stage.index })} · {t(STAGE_KIND_KEY[stage.kind])} · {t('flow.cycle', { n: stage.cycle_index })}</span>
          <h2 className="flow-detail-title">{title}</h2>
        </div>
        <button type="button" aria-label={t('flow.detail.close')} title={t('flow.detail.close')} onClick={onClose} className="pane-header-icon">
          <X size={14} />
        </button>
      </header>
      <span role="status" className="pane-header-status flow-stage-status" data-kind={STAGE_STATUS_KIND[stage.status]}>
        <span className="pane-header-status-dot" aria-hidden="true" />
        {t(STAGE_STATUS_KEY[stage.status])}
      </span>
      {stage.excerpt && <p className="flow-detail-excerpt">{stage.excerpt}</p>}
      <dl className="flow-detail-grid">
        <dt>{t('flow.detail.started')}</dt>
        <dd>{formatWhen(stage.started_at)}</dd>
        <dt>{t('flow.detail.completed')}</dt>
        <dd>{stage.completed_at ? formatWhen(stage.completed_at) : t('flow.detail.inProgress')}</dd>
        <dt>{t('flow.detail.duration')}</dt>
        <dd>{durationLabel(stage.duration_ms) ?? t('flow.stage.durationUnknown')}</dd>
        <dt>{t('flow.stage.progress')}</dt>
        <dd>{progress === null ? t('flow.stage.progressUnknown') : `${progress}%`}</dd>
        <dt>{t('flow.detail.turns')}</dt>
        <dd>{stage.turns}{stage.origin_peer_turns > 0 ? ` · ${t('flow.stage.peerTurns', { n: stage.origin_peer_turns })}` : ''}</dd>
        <dt>{t('flow.detail.verification')}</dt>
        <dd>{stage.verification ? t('flow.stage.verification', { passed: stage.verification.passed, failed: stage.verification.failed }) : t('flow.detail.none')}</dd>
        <dt>{t('flow.detail.checkpoints')}</dt>
        <dd>{stage.checkpoints}</dd>
      </dl>
      <section aria-label={t('flow.detail.sessions')} className="flow-detail-section">
        <h3>{t('flow.detail.sessions')}</h3>
        <ul>
          {stage.sessions.map((row) => {
            const rowOnBoard = isOnBoard(row.session_id)
            return (
              <li key={row.session_id}>
                <button
                  type="button"
                  className="flow-detail-link"
                  title={t(rowOnBoard ? 'flow.detail.sessionOnBoard' : 'flow.detail.sessionOpen')}
                  onClick={() => onOpenSession(row.session_id)}
                >
                  {rowOnBoard ? <Columns3 size={12} aria-hidden="true" /> : <ExternalLink size={12} aria-hidden="true" />}
                  <span className="truncate">{row.title}</span>
                  <span className="flow-detail-count">{t('flow.stage.turns', { n: row.turns })}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
      {(stage.executors.length > 0 || stage.agents.length > 0) && (
        <section aria-label={t('flow.stage.executors')} className="flow-detail-section">
          <h3>{t('flow.stage.executors')}</h3>
          <ul>
            {stage.executors.map((executor) => (
              <li key={`model:${executor.model}`} className="flow-detail-row">
                <span className="truncate">{resolveExecutor(executor.model, models)?.alias ?? executor.model}</span>
                <span className="flow-detail-count">{t('flow.stage.executorCalls', { n: executor.calls })}</span>
              </li>
            ))}
            {stage.agents.map((agent) => (
              <li key={`agent:${agent.agent}`} className="flow-detail-row">
                <span className="inline-flex items-center gap-1 truncate"><Bot size={12} aria-hidden="true" />{agent.agent}</span>
                <span className="flow-detail-count">{t('flow.stage.agentRuns', { n: agent.runs })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label={t('flow.stage.files', { n: stage.files.length + stage.files_more })} className="flow-detail-section">
        <h3>{t('flow.stage.files', { n: stage.files.length + stage.files_more })}</h3>
        {stage.files.length === 0 ? (
          <p className="flow-stage-nofiles">{t('flow.stage.noFiles')}</p>
        ) : (
          <ul>
            {stage.files.map((file) => (
              <li key={file.path} className="flow-detail-row" title={file.path}>
                <span className="inline-flex min-w-0 items-center gap-1"><FileText size={12} aria-hidden="true" /><span className="truncate">{file.path}</span></span>
                <span className="flow-detail-count">{file.kind}</span>
              </li>
            ))}
            {stage.files_more > 0 && (
              <li className="flow-detail-row is-more">
                {t('flow.detail.filesMore', { n: stage.files_more })}
              </li>
            )}
          </ul>
        )}
        {/* El Engine acota la lista por etapa y no existe consulta paginada del
            resto: se declara que la muestra es parcial, conservando el total
            exacto, en vez de dejar creer que están todos. */}
        {stage.files_more > 0 && (
          <p className="flow-stage-nofiles" data-testid="flow-files-partial">
            {t('flow.detail.filesPartial', {
              shown: stage.files.length,
              total: stage.files.length + stage.files_more,
            })}
          </p>
        )}
      </section>
      <footer className="flow-detail-actions">
        <button type="button" className="flow-stage-action" onClick={() => onGoToTurn(stage)}>
          {onBoard ? <Columns3 size={12} aria-hidden="true" /> : <ExternalLink size={12} aria-hidden="true" />}
          {stage.status === 'needs_you' ? t('flow.stage.attend') : t('flow.stage.goToTurn')}
        </button>
      </footer>
    </aside>
  )
}
