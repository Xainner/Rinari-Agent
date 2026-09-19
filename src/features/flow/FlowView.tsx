import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, FolderGit2, GitBranch, MessageSquare, RefreshCw, Workflow } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { FlowStage } from '../../services/engine'
import { useBoardStore } from '../../stores/board'
import { useUIStore, type FlowScope } from '../../stores/ui'
import { useEngineCommands, useEngineData } from '../engine/EngineContext'
import { requestTurnReveal, revealBoardAttention } from '../board/boardCommands'
import { projectDisplayName } from '../projects/workspaceModel'
import { cn } from '../../lib/utils'
import { groupByCycle, percent } from './flowModel'
import FlowStageCard from './FlowStageCard'
import FlowStageDetail from './FlowStageDetail'
import { useFlow } from './useFlow'

/**
 * Vista Flujos: cómo avanzó un proyecto (o un chat) y cómo intervino la IA,
 * como etapas ordenadas en el tiempo. El alcance se elige arriba (proyectos
 * registrados y conversaciones recientes); el canvas es horizontal con
 * columnas en píxeles, como Boards. Los datos son del Engine (`flow.get`):
 * la vista no estima nada y rotula lo que falta.
 */
export default function FlowView() {
  const { t } = useI18n()
  const reduced = useReducedMotion()
  const data = useEngineData()
  const commands = useEngineCommands()
  const scope = useUIStore((s) => s.flowScope)
  const setFlowScope = useUIStore((s) => s.setFlowScope)
  const goBoard = useUIStore((s) => s.goBoard)
  const goNormal = useUIStore((s) => s.goNormal)
  const boardPanes = useBoardStore((s) => s.panes)
  const boardSessionIds = useMemo(() => new Set(boardPanes.map((pane) => pane.sessionId)), [boardPanes])
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)

  const projects = useMemo(() => data.projects.filter((project) => !project.archived), [data.projects])
  const chats = useMemo(() => data.sessions.filter((row) => row.kind === 'CHAT'), [data.sessions])
  // Una sesión de proyecto llega por «Ver flujo» del sidebar: se ofrece como
  // opción propia para que el selector refleje el alcance real.
  const scopedSession = scope?.kind === 'session' && !chats.some((row) => row.id === scope.id)
    ? data.sessionsById[scope.id] ?? null
    : null

  // Alcance por defecto: el proyecto de la sesión activa, si lo hay; si no, el
  // primer proyecto; si no, la sesión activa. Nunca se inventa uno.
  useEffect(() => {
    if (scope) {
      const exists = scope.kind === 'project'
        ? data.projects.some((project) => project.id === scope.id)
        : data.sessionsById[scope.id] !== undefined || !data.sessionsLoaded
      if (exists) return
    }
    const active = data.sessionsById[data.activeSession]
    const activeProject = active?.project_id
      ? projects.find((project) => project.id === active.project_id) ?? null
      : projects.find((project) => project.root === active?.project_root) ?? null
    const next: FlowScope | null = activeProject
      ? { kind: 'project', id: activeProject.id }
      : projects[0]
        ? { kind: 'project', id: projects[0].id }
        : active
          ? { kind: 'session', id: active.id }
          : null
    if (next && (!scope || scope.id !== next.id)) setFlowScope(next)
  }, [scope, data.projects, data.sessionsById, data.sessionsLoaded, data.activeSession, projects, setFlowScope])

  // Sin la capability no se llama a `flow.get`: se dice, no se adivina.
  const supported = data.status?.state !== 'ready' || data.status.capabilities.project_flow_v1 === true
  const flow = useFlow(scope, { enabled: data.ready && supported })
  const stages = flow.data?.stages ?? []
  const selected = stages.find((stage) => stage.id === selectedStageId) ?? null
  useEffect(() => {
    if (selectedStageId && !selected) setSelectedStageId(null)
  }, [selectedStageId, selected])

  /** Ir al turno que abrió la etapa: al panel si está en el board, si no a Normal. */
  const goToStage = useCallback((stage: FlowStage) => {
    const { session_id: sessionId, turn_id: turnId } = stage.anchor
    if (revealBoardAttention({ sessionId, turnId }, { goBoard })) return
    void commands.selectSession(sessionId)
    goNormal()
    // ChatView consume la petición al montar la sesión y la conserva hasta que la fila exista.
    requestTurnReveal({ sessionId, turnId })
  }, [commands, goBoard, goNormal])

  const openSession = useCallback((sessionId: string) => {
    if (revealBoardAttention({ sessionId }, { goBoard })) return
    void commands.selectSession(sessionId)
    goNormal()
  }, [commands, goBoard, goNormal])

  const summary = flow.data?.summary ?? null
  const overall = percent(summary?.progress ?? null)
  const scopeTitle = flow.data?.scope.title ?? (scope?.kind === 'project'
    ? projects.find((project) => project.id === scope.id)?.name ?? ''
    : data.sessionsById[scope?.id ?? '']?.title ?? '')

  return (
    <div className="flow-view" data-testid="flow-view">
      <header className="flow-header">
        <div className="flow-scope">
          <label className="flow-scope-label" htmlFor="flow-scope-select">
            <Workflow size={14} aria-hidden="true" />
            {t('flow.scope')}
          </label>
          <select
            id="flow-scope-select"
            className="flow-scope-select"
            value={scope ? `${scope.kind}:${scope.id}` : ''}
            onChange={(event) => {
              const [kind, ...rest] = event.target.value.split(':')
              const id = rest.join(':')
              if ((kind === 'project' || kind === 'session') && id) {
                setSelectedStageId(null)
                setFlowScope({ kind, id })
              }
            }}
            disabled={projects.length === 0 && chats.length === 0}
          >
            {!scope && <option value="">{t('flow.scopeNone')}</option>}
            {projects.length > 0 && (
              <optgroup label={t('flow.scopeProjects')}>
                {projects.map((project) => (
                  <option key={project.id} value={`project:${project.id}`}>{project.name || projectDisplayName(project.root)}</option>
                ))}
              </optgroup>
            )}
            {scopedSession && (
              <optgroup label={t('flow.scopeProjectSessions')}>
                <option value={`session:${scopedSession.id}`}>{scopedSession.title || t('sidebar.newChat')}</option>
              </optgroup>
            )}
            {chats.length > 0 && (
              <optgroup label={t('flow.scopeChats')}>
                {chats.map((row) => (
                  <option key={row.id} value={`session:${row.id}`}>{row.title || t('sidebar.newChat')}</option>
                ))}
              </optgroup>
            )}
          </select>
          <button type="button" className="pane-header-icon" aria-label={t('flow.refresh')} title={t('flow.refresh')} onClick={() => void flow.refresh()} disabled={!scope || flow.loading}>
            <RefreshCw size={14} className={cn(flow.loading && 'motion-safe:animate-spin')} />
          </button>
        </div>
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
      </header>
      <div className={cn('flow-body', selected && 'has-detail')}>
        <div className="flow-canvas" role="list" aria-label={t('flow.stages')} aria-busy={flow.loading || undefined}>
          {!supported && (
            <div className="flow-empty" data-testid="flow-unsupported">
              <Workflow size={28} aria-hidden="true" />
              <p>{t('flow.unsupported')}</p>
            </div>
          )}
          {supported && !scope && (
            <div className="flow-empty">
              <Workflow size={28} aria-hidden="true" />
              <p>{t('flow.emptyScope')}</p>
            </div>
          )}
          {scope && flow.error && (
            <div role="alert" className="flow-empty is-error">
              <p>{flow.error}</p>
              <button type="button" className="flow-stage-action" onClick={() => void flow.refresh()}>{t('flow.retry')}</button>
            </div>
          )}
          {scope && !flow.error && flow.data && stages.length === 0 && (
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
                const order = stages.indexOf(stage)
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
            onBoard={boardSessionIds.has(selected.anchor.session_id)}
          />
        )}
      </div>
    </div>
  )
}
