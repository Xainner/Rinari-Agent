import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Archive, ArrowRight, FolderGit2, GitBranch, MessageSquare, RefreshCw, Workflow } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { FlowStage } from '../../services/engine'
import { useBoardStore } from '../../stores/board'
import { useUIStore, type FlowScope } from '../../stores/ui'
import { useEngineCommands, useEngineData } from '../engine/EngineContext'
import { requestTurnReveal, revealBoardAttention } from '../board/boardCommands'
import { projectDisplayName } from '../projects/workspaceModel'
import { cn } from '../../lib/utils'
import { clockLabel, groupByCycle, percent, useFlowReducedMotion } from './flowModel'
import FlowStageCard from './FlowStageCard'
import FlowStageDetail from './FlowStageDetail'
import { useFlow } from './useFlow'

/**
 * Vista Flujos: cómo avanzó la conversación activa y cómo intervino la IA,
 * como etapas ordenadas en el tiempo. El canvas es horizontal con columnas en
 * píxeles, como Boards. Los datos son del Engine (`flow.get`):
 * la vista no estima nada y rotula lo que falta.
 */
export default function FlowView() {
  const { t } = useI18n()
  const reduced = useFlowReducedMotion()
  const data = useEngineData()
  const commands = useEngineCommands()
  const goBoard = useUIStore((s) => s.goBoard)
  const goNormal = useUIStore((s) => s.goNormal)
  const boardPanes = useBoardStore((s) => s.panes)
  const boardSessionIds = useMemo(() => new Set(boardPanes.map((pane) => pane.sessionId)), [boardPanes])
  const isOnBoard = useCallback((sessionId: string) => boardSessionIds.has(sessionId), [boardSessionIds])
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)

  const projects = useMemo(() => data.projects.filter((project) => !project.archived), [data.projects])
  // El flujo es el de la conversación en la que estás; se actualiza solo con
  // los eventos del Engine (useFlow), sin selector ni recarga manual.
  const activeSession = data.sessionsById[data.activeSession] ? data.activeSession : ''
  const scope = useMemo<FlowScope | null>(() => (activeSession ? { kind: 'session', id: activeSession } : null), [activeSession])

  // Tres estados, no dos: mientras el Engine no está `ready` no se sabe si
  // ofrece flujos. Darlo por soportado era adivinar, y adivinar bien la mayoría
  // de las veces sigue siendo adivinar; se dice «comprobando».
  const support: 'checking' | 'supported' | 'unsupported' =
    data.status?.state !== 'ready'
      ? 'checking'
      : data.status.capabilities?.project_flow_v1 === true
        ? 'supported'
        : 'unsupported'
  const flow = useFlow(scope, { enabled: support === 'supported' })
  const stages = flow.data?.stages ?? []
  const selected = stages.find((stage) => stage.id === selectedStageId) ?? null
  useEffect(() => {
    if (selectedStageId && !selected) setSelectedStageId(null)
  }, [selectedStageId, selected])

  /**
   * Navegar a una sesión del flujo. El Engine incluye a propósito sesiones
   * cerradas y archivadas, así que la que se ve en una tarjeta puede no ser
   * abrible: se resuelve **antes** de cambiar de vista.
   *
   * Se usa `prepareSession` y no `selectSession` porque el primero dice por
   * qué falla sin tocar la sesión activa. Cambiar a Normal y pedir el reveal
   * sin esperar dejaba la petición sin consumidor cuando la sesión no abría,
   * y el usuario en una vista que no era la suya.
   */
  const [restorePrompt, setRestorePrompt] = useState<
    { sessionId: string; turnId: string | null; state: 'closed' | 'archived'; title: string } | null
  >(null)
  const [navError, setNavError] = useState<string | null>(null)
  const [navigating, setNavigating] = useState(false)

  const enterSession = useCallback(async (sessionId: string, turnId: string | null): Promise<void> => {
    setNavError(null)
    setRestorePrompt(null)
    if (revealBoardAttention(turnId ? { sessionId, turnId } : { sessionId }, { goBoard })) return
    setNavigating(true)
    try {
      const prepared = await commands.prepareSession(sessionId)
      if (!prepared.ok) {
        if (prepared.reason === 'closed' || prepared.reason === 'archived') {
          setRestorePrompt({ sessionId, turnId, state: prepared.reason, title: prepared.message })
        } else {
          setNavError(prepared.message)
        }
        return
      }
      commands.setActiveSession(sessionId)
      goNormal()
      // ChatView consume la petición al montar la sesión y la conserva hasta que la fila exista.
      if (turnId) requestTurnReveal({ sessionId, turnId })
    } finally {
      setNavigating(false)
    }
  }, [commands, goBoard, goNormal])

  /** Restaurar es una decisión del usuario, no un efecto colateral de pulsar «ir al turno». */
  const confirmRestore = useCallback(async (): Promise<void> => {
    const target = restorePrompt
    if (!target) return
    setNavigating(true)
    setNavError(null)
    try {
      await commands.restoreSession(target.sessionId)
      // `restoreSession` avisa por toast si falla; el estado real se vuelve a
      // preguntar en vez de suponer que salió bien.
      const prepared = await commands.prepareSession(target.sessionId)
      if (!prepared.ok) {
        setNavError(prepared.message)
        return
      }
      setRestorePrompt(null)
      commands.setActiveSession(target.sessionId)
      goNormal()
      if (target.turnId) requestTurnReveal({ sessionId: target.sessionId, turnId: target.turnId })
      void flow.refresh()
    } finally {
      setNavigating(false)
    }
  }, [commands, flow, goNormal, restorePrompt])

  const goToStage = useCallback((stage: FlowStage) => {
    void enterSession(stage.anchor.session_id, stage.anchor.turn_id)
  }, [enterSession])

  const openSession = useCallback((sessionId: string) => {
    void enterSession(sessionId, null)
  }, [enterSession])

  const summary = flow.data?.summary ?? null
  const overall = percent(summary?.progress ?? null)
  const scopeTitle = flow.data?.scope.title ?? (scope?.kind === 'project'
    ? projects.find((project) => project.id === scope.id)?.name ?? ''
    : data.sessionsById[scope?.id ?? '']?.title ?? '')

  return (
    <div className="flow-view" data-testid="flow-view">
      <header className="flow-header">
        {scope && (
          <div className="flow-summary" aria-live="polite">
            <div className="flow-summary-title">
              {scope.kind === 'project' ? <FolderGit2 size={15} aria-hidden="true" /> : <MessageSquare size={15} aria-hidden="true" />}
              <h1>{scopeTitle || t('flow.title')}</h1>
              {flow.data?.scope.root && <span className="flow-summary-root" title={flow.data.scope.root}><GitBranch size={11} aria-hidden="true" />{projectDisplayName(flow.data.scope.root)}</span>}
            </div>
            <div className="flow-summary-progress" role="group" aria-label={t('flow.overallProgress')}>
              <div className="flow-summary-progress-track" aria-hidden="true">
                <div className="flow-summary-progress-fill" data-known={overall !== null || undefined} style={{ width: `${overall ?? 0}%` }} />
              </div>
              <span className="flow-summary-progress-value" data-testid="flow-overall">
                {overall === null ? t('flow.progressUnknown') : t('flow.progressDone', { n: overall })}
              </span>
            </div>
            {summary && (
              <dl className="flow-summary-facts">
                <div><dt>{t('flow.facts.stages')}</dt><dd>{summary.stages_done}/{summary.stages_total}</dd></div>
                <div><dt>{t('flow.facts.turns')}</dt><dd>{summary.turns_total}{summary.turns_failed > 0 ? ` · ${t('flow.facts.failed', { n: summary.turns_failed })}` : ''}</dd></div>
                <div><dt>{t('flow.facts.files')}</dt><dd>{summary.files_changed}</dd></div>
                <div><dt>{t('flow.facts.tasks')}</dt><dd>{summary.tasks && summary.tasks.total > 0 ? `${summary.tasks.done}/${summary.tasks.total}` : t('flow.facts.tasksNone')}</dd></div>
              </dl>
            )}
          </div>
        )}
        {scope && flow.stale && (
          <div className="flow-notice is-stale" role="status" data-testid="flow-stale">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{t('flow.stale', { when: clockLabel(flow.updatedAt), reason: flow.error ?? '' })}</span>
            <div className="flow-notice-actions">
              <button type="button" className="flow-stage-action" onClick={() => void flow.refresh()} disabled={flow.loading}>
                {t('flow.retry')}
              </button>
            </div>
          </div>
        )}
        {restorePrompt && (
          <div className="flow-notice" role="alert" data-testid="flow-restore">
            <Archive size={14} aria-hidden="true" />
            <span>
              {t(restorePrompt.state === 'archived' ? 'flow.restore.archived' : 'flow.restore.closed', {
                title: restorePrompt.title,
              })}
            </span>
            <div className="flow-notice-actions">
              <button type="button" className="flow-stage-action" onClick={() => void confirmRestore()} disabled={navigating}>
                {t('flow.restore.confirm')}
              </button>
              <button type="button" className="flow-stage-action" onClick={() => setRestorePrompt(null)} disabled={navigating}>
                {t('flow.restore.cancel')}
              </button>
            </div>
          </div>
        )}
        {navError && (
          <div className="flow-notice is-error" role="alert" data-testid="flow-nav-error">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{t('flow.navError', { reason: navError })}</span>
          </div>
        )}
      </header>
      <div className={cn('flow-body', selected && 'has-detail')}>
        <div className="flow-canvas" role="list" aria-label={t('flow.stages')} aria-busy={flow.loading || undefined}>
          {support === 'checking' && (
            <div className="flow-empty" role="status" data-testid="flow-checking">
              <RefreshCw size={22} className="motion-safe:animate-spin" aria-hidden="true" />
              <p>{t('flow.checking')}</p>
            </div>
          )}
          {support === 'unsupported' && (
            <div className="flow-empty" data-testid="flow-unsupported">
              <Workflow size={28} aria-hidden="true" />
              <p>{t('flow.unsupported')}</p>
            </div>
          )}
          {support === 'supported' && !scope && (
            <div className="flow-empty">
              <Workflow size={28} aria-hidden="true" />
              <p>{t('flow.emptyScope')}</p>
            </div>
          )}
          {/* El error sustituye a los datos solo cuando no hay datos. Con datos
              en pantalla el aviso es el de desactualizado, arriba. */}
          {scope && flow.error && !flow.data && (
            <div role="alert" className="flow-empty is-error">
              <p>{flow.error}</p>
              <button type="button" className="flow-stage-action" onClick={() => void flow.refresh()}>{t('flow.retry')}</button>
            </div>
          )}
          {scope && flow.data && stages.length === 0 && (
            <div className="flow-empty" data-testid="flow-empty">
              <Workflow size={28} aria-hidden="true" />
              <p>{scope.kind === 'project' ? t('flow.emptyProject') : t('flow.emptySession')}</p>
            </div>
          )}
          {scope && !flow.error && !flow.data && flow.loading && (
            <div className="flow-empty" role="status">
              <RefreshCw size={22} className="motion-safe:animate-spin" aria-hidden="true" />
              <p>{t('flow.loading')}</p>
            </div>
          )}
          {groupByCycle(stages).map((group, groupIndex) => (
            <Fragment key={group.cycle}>
              {groupIndex > 0 && (
                <motion.div
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flow-cycle-break"
                  role="separator"
                  aria-label={t('flow.cycle', { n: group.cycle })}
                >
                  <span>{t('flow.cycle', { n: group.cycle })}</span>
                </motion.div>
              )}
              {group.stages.map((stage, index) => {
                const order = group.offset + index
                return (
                  <Fragment key={stage.id}>
                    {index > 0 && (
                      <div className="flow-connector" aria-hidden="true">
                        <ArrowRight size={16} />
                      </div>
                    )}
                    <div role="listitem" className="flow-stage-slot">
                      <FlowStageCard
                        stage={stage}
                        order={order}
                        selected={stage.id === selectedStageId}
                        models={data.models}
                        providers={data.providers}
                        onOpen={(item) => setSelectedStageId((current) => (current === item.id ? null : item.id))}
                        onGoToTurn={goToStage}
                        onBoard={boardSessionIds.has(stage.anchor.session_id)}
                      />
                    </div>
                  </Fragment>
                )
              })}
            </Fragment>
          ))}
        </div>
        {selected && (
          <FlowStageDetail
            stage={selected}
            models={data.models}
            onClose={() => setSelectedStageId(null)}
            onGoToTurn={goToStage}
            onOpenSession={openSession}
            // La acción principal de la etapa es la del anchor; cada fila de
            // sesión responde por la suya. Una etapa con varias sesiones
            // mostraba el icono y el destino de la primera para todas.
            onBoard={boardSessionIds.has(selected.anchor.session_id)}
            isOnBoard={isOnBoard}
          />
        )}
      </div>
    </div>
  )
}
