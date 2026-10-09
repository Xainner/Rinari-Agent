import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { motion } from 'framer-motion'
import { instant, spring, useCalmMotion } from '../../lib/motion'
import type { SessionSummary } from '../../services/engine'
import ChangesPanel from './ChangesPanel'
import TasksPanel from './TasksPanel'
import VerificationPanel from './VerificationPanel'
import CheckpointsPanel from './CheckpointsPanel'
import ArtifactsPanel from './ArtifactsPanel'
import InsightPanel from './InsightPanel'

export type WorkspaceTab = 'changes' | 'tasks' | 'verification' | 'checkpoints' | 'artifacts' | 'insight'

const TABS: WorkspaceTab[] = ['changes', 'tasks', 'verification', 'checkpoints', 'artifacts', 'insight']

/** Alcance real de cada superficie: por raíz de proyecto o por sesión. */
export const WORKSPACE_TAB_SCOPE: Record<WorkspaceTab, 'project' | 'session'> = {
  changes: 'project',
  tasks: 'project',
  verification: 'project',
  checkpoints: 'project',
  artifacts: 'session',
  insight: 'session',
}

interface WorkspaceViewProps {
  session: SessionSummary | null
  onBack?: () => void
  /**
   * Dentro de un panel del board: sin navegación de página ni ancho máximo,
   * tabs compactas desplazables y etiqueta de alcance visible.
   */
  embedded?: boolean
  /** Tab controlada (el board la persiste por panel). Sin ella, estado local. */
  tab?: WorkspaceTab
  onTabChange?: (tab: WorkspaceTab) => void
  /** Dos paneles comparten esta raíz: las acciones por proyecto afectan a ambos. */
  sharedRoot?: boolean
}

/**
 * Vista workspace: cambios, tareas, verificación y checkpoints del proyecto
 * de la sesión (project_root, o cwd en CHAT); artefactos y contexto de la
 * sesión. Solo lectura salvo restaurar checkpoint (con preview + confirmación).
 */
export default function WorkspaceView({
  session,
  onBack,
  embedded = false,
  tab: controlledTab,
  onTabChange,
  sharedRoot = false,
}: WorkspaceViewProps) {
  const calm = useCalmMotion()
  const { t } = useI18n()
  const [localTab, setLocalTab] = useState<WorkspaceTab>('changes')
  const tab = controlledTab ?? localTab
  const setTab = (next: WorkspaceTab) => {
    if (onTabChange) onTabChange(next)
    else setLocalTab(next)
  }
  const [changedFiles, setChangedFiles] = useState<string[]>([])

  const path = session?.project_root ?? session?.current_cwd ?? null
  const sessionId = session?.id ?? null

  // Los cambios listados pertenecen a una raíz: no reutilizarlos para otra.
  useEffect(() => {
    setChangedFiles([])
  }, [path, sessionId])

  const scope = WORKSPACE_TAB_SCOPE[tab]

  return (
    <div className={embedded ? 'flex h-full w-full min-w-0 flex-col px-3 py-2' : 'mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-4'}>
      {!embedded && (
        <div className="mb-3 flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)]"
            >
              ←
            </button>
          )}
          <h2 className="text-sm font-semibold text-[var(--text)]">{t('nav.workspace')}</h2>
          {path && (
            <span title={path} className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--text-subtle)]">
              {path}
            </span>
          )}
        </div>
      )}

      {path === null && (
        <p className="text-sm text-[var(--text-subtle)]">{t('workspace.noSession')}</p>
      )}

      {path !== null && (
        <>
          <div
            role="tablist"
            aria-label={t('nav.workspace')}
            className={`seg-tabs mb-2 ${embedded ? 'workspace-tabs-compact overflow-x-auto' : 'mb-3'}`}
            onKeyDown={(event) => {
              // Flechas, Inicio y Fin recorren las pestañas (patrón WAI-ARIA tabs).
              const index = TABS.indexOf(tab)
              const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
                : event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1
              if (next < 0) return
              event.preventDefault()
              setTab(TABS[next])
              ;(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next])?.focus()
            }}
          >
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                className={`seg-tab ${embedded ? 'shrink-0' : 'flex-1'}`}
              >
                {tab === id && <motion.span layoutId={`workspace-tab-${embedded ? 'dock' : 'page'}`} className="seg-tab-pill" transition={calm ? instant : spring} aria-hidden="true" />}
                <span className="relative">{t(`workspace.tab.${id}`)}</span>
              </button>
            ))}
          </div>
          <div className="mb-2 flex min-w-0 items-center gap-2 text-[11px] text-[var(--text-subtle)]">
            <span className="shrink-0 rounded-md border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px]">
              {t(scope === 'project' ? 'workspace.scope.project' : 'workspace.scope.session')}
            </span>
            {sharedRoot && scope === 'project' && (
              <span className="shrink-0 rounded-md border border-[var(--warning)]/40 px-1.5 py-0.5 text-[10px] text-[var(--warning)]" title={t('workspace.scope.sharedHint')}>
                {t('workspace.scope.shared')}
              </span>
            )}
            {embedded && <span title={path} className="min-w-0 flex-1 truncate font-mono">{path}</span>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-8">
            {tab === 'changes' && <ChangesPanel key={path} path={path} onFiles={setChangedFiles} />}
            {tab === 'tasks' && <TasksPanel key={path} path={path} />}
            {tab === 'verification' && (
              <VerificationPanel key={path} path={path} changedFiles={changedFiles} />
            )}
            {tab === 'checkpoints' && <CheckpointsPanel key={path} path={path} />}
            {tab === 'artifacts' && session && <ArtifactsPanel key={session.id} sessionId={session.id} />}
            {tab === 'insight' && session && <InsightPanel key={session.id} sessionId={session.id} />}
          </div>
        </>
      )}
    </div>
  )
}
