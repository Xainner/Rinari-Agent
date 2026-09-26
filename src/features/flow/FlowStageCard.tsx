import { memo } from 'react'
import { motion } from 'framer-motion'
import { Bot, Columns3, ExternalLink, FileText, Layers, MessageSquareShare, ShieldAlert, Timer } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { FlowStage, ModelSummary, ProviderSummary } from '../../services/engine'
import ProviderLogo from '../../components/ProviderLogo'
import { cn } from '../../lib/utils'
import { STAGE_KIND_KEY, STAGE_STATUS_KEY, STAGE_STATUS_KIND, durationLabel, fileChipLabel, percent, useFlowReducedMotion } from './flowModel'

export interface FlowStageCardProps {
  stage: FlowStage
  /** Posición en la animación de entrada. */
  order: number
  selected: boolean
  models: readonly ModelSummary[]
  providers: readonly ProviderSummary[]
  onOpen: (stage: FlowStage) => void
  onGoToTurn: (stage: FlowStage) => void
  /** La sesión de la etapa está en el board (afecta al rótulo de la acción). */
  onBoard: boolean
}

/**
 * Resuelve un `model` de los eventos contra el catálogo.
 *
 * `model.started` lleva el `model_id` del registro, que es la identidad
 * canónica: se busca primero y en toda la lista. Probar id, alias y
 * `provider_model_id` a la vez, modelo a modelo, dejaba ganar a un registro
 * anterior cuyo alias coincidiera con el id de otro. Los dos criterios de
 * respaldo no son únicos —dos proveedores pueden servir el mismo
 * `provider_model_id`—, así que sólo valen cuando no hay ambigüedad: ante dos
 * candidatos se prefiere no resolver y mostrar la cadena cruda.
 */
export function resolveExecutor(model: string, models: readonly ModelSummary[]): ModelSummary | null {
  const canonical = models.find((item) => item.id === model)
  if (canonical) return canonical
  const byProviderModel = models.filter((item) => item.provider_model_id === model)
  if (byProviderModel.length === 1) return byProviderModel[0]
  const byAlias = models.filter((item) => item.alias === model)
  return byAlias.length === 1 ? byAlias[0] : null
}

/**
 * Tarjeta de una etapa: rótulo `PASO N · TIPO`, estado, título, extracto,
 * progreso (o «sin datos»), ejecutores, agentes, archivos y acciones. Todo
 * lo que muestra viene del Engine; lo que falta se omite o se rotula como
 * no disponible, nunca se rellena con el estado actual de la sesión.
 */
function FlowStageCard({ stage, order, selected, models, providers, onOpen, onGoToTurn, onBoard }: FlowStageCardProps) {
  const { t } = useI18n()
  const reduced = useFlowReducedMotion()
  const progress = percent(stage.progress)
  const duration = durationLabel(stage.duration_ms)
  const kindLabel = t(STAGE_KIND_KEY[stage.kind])
  const statusLabel = t(STAGE_STATUS_KEY[stage.status])
  const filesTotal = stage.files.length + stage.files_more
  const title = stage.title || stage.excerpt || t('flow.stage.untitled')
  return (
    <motion.article
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.22, delay: reduced ? 0 : Math.min(order, 8) * 0.04 }}
      aria-label={`${t('flow.stage.step', { n: stage.index })} · ${kindLabel} · ${title}`}
      data-testid="flow-stage"
      data-stage-id={stage.id}
      data-kind={stage.kind}
      data-status={stage.status}
      data-selected={selected || undefined}
      className={cn('flow-stage', `is-${stage.status}`, selected && 'is-selected')}
    >
      <header className="flow-stage-head">
        <span className="flow-stage-step">
          {t('flow.stage.step', { n: stage.index })} · {kindLabel}
        </span>
        <span role="status" className="pane-header-status flow-stage-status" data-kind={STAGE_STATUS_KIND[stage.status]}>
          <span className="pane-header-status-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </header>
      <button type="button" className="flow-stage-title" onClick={() => onOpen(stage)} title={t('flow.stage.openDetail')}>
        {title}
      </button>
      {stage.excerpt && stage.excerpt !== title && <p className="flow-stage-excerpt">{stage.excerpt}</p>}
      {progress === null && stage.status === 'done' ? (
        // Terminada sin nada que medir: un «sin datos» con la barra vacía
        // parecía roto. Se dice qué faltó para medir, sin inventar un 100 %.
        <p className="flow-stage-unmeasured" data-testid="flow-stage-unmeasured">
          {t(stage.kind === 'review' ? 'flow.stage.doneNoChecks' : 'flow.stage.doneNoTasks')}
        </p>
      ) : (
        <div className="flow-stage-progress" role="group" aria-label={t('flow.stage.progress')}>
          <div className="flow-stage-progress-row">
            <span>{t('flow.stage.progress')}</span>
            <span className="flow-stage-progress-value">{progress === null ? t('flow.stage.progressUnknown') : `${progress}%`}</span>
          </div>
          <div className="flow-stage-progress-track" aria-hidden="true">
            <div className="flow-stage-progress-fill" data-known={progress !== null || undefined} style={{ width: `${progress ?? 0}%` }} />
          </div>
        </div>
      )}
      <dl className="flow-stage-meta">
        <div>
          <Timer size={11} aria-hidden="true" />
          <span>{duration ?? t('flow.stage.durationUnknown')}</span>
        </div>
        <div>
          <Layers size={11} aria-hidden="true" />
          <span>{t('flow.stage.turns', { n: stage.turns })}</span>
        </div>
        {stage.verification && (
          <div>
            <ShieldAlert size={11} aria-hidden="true" />
            <span>{t('flow.stage.verification', { passed: stage.verification.passed, failed: stage.verification.failed })}</span>
          </div>
        )}
        {stage.origin_peer_turns > 0 && (
          <div title={t('flow.stage.peerHint')}>
            <MessageSquareShare size={11} aria-hidden="true" />
            <span>{t('flow.stage.peerTurns', { n: stage.origin_peer_turns })}</span>
          </div>
        )}
      </dl>
      {(stage.executors.length > 0 || stage.agents.length > 0) && (
        <ul className="flow-stage-chips" aria-label={t('flow.stage.executors')}>
          {stage.executors.map((executor) => {
            const resolved = resolveExecutor(executor.model, models)
            const provider = resolved?.provider ?? null
            const endpoint = providers.find((item) => item.alias === provider)?.endpoint ?? null
            return (
              <li key={`model:${executor.model}`} className="flow-chip" title={t('flow.stage.executorCalls', { n: executor.calls })}>
                <ProviderLogo alias={provider} endpoint={endpoint} size={12} />
                <span>{resolved?.alias ?? executor.model}</span>
              </li>
            )
          })}
          {stage.agents.map((agent) => (
            <li key={`agent:${agent.agent}`} className="flow-chip is-agent" title={t('flow.stage.agentRuns', { n: agent.runs })}>
              <Bot size={12} aria-hidden="true" />
              <span>{agent.agent}</span>
            </li>
          ))}
        </ul>
      )}
      {filesTotal > 0 ? (
        <ul className="flow-stage-files" aria-label={t('flow.stage.files', { n: filesTotal })}>
          {stage.files.slice(0, 4).map((file) => (
            <li key={file.path} className="flow-file" data-kind={file.kind} title={file.path}>
              <FileText size={11} aria-hidden="true" />
              <span>{fileChipLabel(file.path)}</span>
            </li>
          ))}
          {filesTotal > 4 && <li className="flow-file is-more">+{filesTotal - 4}</li>}
        </ul>
      ) : (
        <p className="flow-stage-nofiles">{t('flow.stage.noFiles')}</p>
      )}
      <footer className="flow-stage-actions">
        <span className="flow-stage-sessions" title={stage.sessions.map((row) => row.title).join(' · ')}>
          {stage.sessions.length === 1 ? stage.sessions[0]!.title : t('flow.stage.sessions', { n: stage.sessions.length })}
        </span>
        <button
          type="button"
          className={cn('flow-stage-action', stage.status === 'needs_you' && 'is-attend')}
          onClick={() => onGoToTurn(stage)}
        >
          {onBoard ? <Columns3 size={12} aria-hidden="true" /> : <ExternalLink size={12} aria-hidden="true" />}
          {stage.status === 'needs_you' ? t('flow.stage.attend') : t('flow.stage.goToTurn')}
        </button>
      </footer>
    </motion.article>
  )
}

export default memo(FlowStageCard)
