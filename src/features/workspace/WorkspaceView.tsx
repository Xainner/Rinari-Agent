import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
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
            className={`mb-2 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1 ${embedded ? 'workspace-tabs-compact overflow-x-auto' : 'mb-3'}`}
          >
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`${embedded ? 'shrink-0 px-2.5' : 'flex-1 px-2'} rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  tab === id
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {t(`workspace.tab.${id}`)}
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
