import { memo } from 'react'
import {
  ArrowLeftRight,
  CircleHelp,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  MoreHorizontal,
  PanelRight,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import type { ModelSummary, ProviderSummary } from '../../services/engine'
import ModelPicker from '../../components/composer/ModelPicker'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { projectDisplayName } from '../projects/workspaceModel'
import { cn } from '../../lib/utils'
import type { PaneSession } from './usePaneSession'

const MODES = ['plan', 'build', 'review'] as const

export interface PaneHeaderProps {
  session: PaneSession
  focused: boolean
  sharedRoot: boolean
  workspaceVisible: boolean
  models: ModelSummary[]
  providers: ProviderSummary[]
  canMoveLeft: boolean
  canMoveRight: boolean
  onOpenProviders: () => void
  onDiscoverModels: () => void
  onToggleWorkspace: () => void
  onOpenSingle: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
  onRemove: () => void
  onRemoveAndClose: () => void
}

/**
 * Header local de un panel: identidad del proyecto/chat, proveedor › modelo,
 * badges de ejecución/intervención y menú de ciclo de vida. Es más compacto
 * que la barra superior y nunca la sustituye.
 */
function PaneHeader({
  session,
  focused,
  sharedRoot,
  workspaceVisible,
  models,
  providers,
  canMoveLeft,
  canMoveRight,
  onOpenProviders,
  onDiscoverModels,
  onToggleWorkspace,
  onOpenSingle,
  onMoveLeft,
  onMoveRight,
  onRemove,
  onRemoveAndClose,
}: PaneHeaderProps) {
  const { t } = useI18n()
  const { record, project, projectRoot, gitStatus, gitError, busy, approvals, pendingQuestions, activeModel } = session
  const title = record?.title || t('sidebar.newChat')
  const projectName = project?.name ?? projectRoot
  const git = gitStatus?.status.available ? gitStatus.status : null
  const interventions = approvals.length + pendingQuestions
  const mode = (record?.mode ?? 'build').toLowerCase()

  return (
    <header className={cn('pane-header', focused && 'is-focused')} data-testid="pane-header">
      <div className="pane-header-identity">
        <span className="pane-header-title" title={title}>{title}</span>
        {projectName && (
          <span
            className="pane-header-project"
            title={projectRoot ?? projectName}
          >
            <GitBranch size={11} aria-hidden="true" />
            <span className="truncate">{projectDisplayName(projectName)}</span>
            {gitError ? (
              <span className="text-[var(--warning)]">· {t('project.gitMissing')}</span>
            ) : git?.branch ? (
              <span className="font-mono text-[var(--text-subtle)]">· {git.branch}{git.dirty ? ` · ${git.files.length}` : ''}</span>
            ) : null}
          </span>
        )}
        {sharedRoot && (
          <span className="pane-header-shared" title={t('board.pane.projectSharedHint')}>{t('board.pane.projectShared')}</span>
        )}
      </div>
      <div className="pane-header-controls">
        <div role="group" aria-label={t('mode.change')} className="pane-header-modes">
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              disabled={!record || busy}
              onClick={() => session.setMode(item)}
              className={cn('pane-header-mode', mode === item && 'is-active')}
            >
              {t(`mode.${item}` as 'mode.plan')}
            </button>
          ))}
        </div>
        <ModelPicker
          models={models}
          providers={providers}
          activeAlias={activeModel?.alias ?? null}
          activeModel={activeModel}
          missingLabel={record?.model_id ? t('board.pane.modelMissing') : undefined}
          onUseModel={session.useModel}
          onDiscoverModels={onDiscoverModels}
          onOpenProviders={onOpenProviders}
          disabled={!record}
          compact
        />
        {busy && (
          <span role="status" aria-label={t('sidebar.sessionWorking')} title={t('sidebar.sessionWorking')} className="pane-header-busy">
            <LoaderCircle size={14} aria-hidden="true" className="motion-safe:animate-spin" />
          </span>
        )}
        {interventions > 0 && (
          <span className="pane-header-badge" role="status" aria-label={t('board.pane.pending', { n: interventions })} title={t('board.pane.pending', { n: interventions })}>
            {approvals.length > 0 ? <ShieldAlert size={12} aria-hidden="true" /> : <CircleHelp size={12} aria-hidden="true" />}
            {interventions}
          </span>
        )}
        <button
          type="button"
          aria-pressed={workspaceVisible}
          aria-label={t('board.pane.toggleWorkspace')}
          title={t('board.pane.toggleWorkspace')}
          onClick={onToggleWorkspace}
          className={cn('pane-header-icon', workspaceVisible && 'is-active')}
        >
          <PanelRight size={15} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={t('board.pane.menu')} title={t('board.pane.menu')} className="pane-header-icon">
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onOpenSingle}><ExternalLink size={13} /> {t('board.pane.openSingle')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleWorkspace}><PanelRight size={13} /> {t('board.pane.toggleWorkspace')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canMoveLeft} onSelect={onMoveLeft}><ArrowLeftRight size={13} /> {t('board.pane.moveLeft')}</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveRight} onSelect={onMoveRight}><ArrowLeftRight size={13} /> {t('board.pane.moveRight')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRemove}><X size={13} /> {t('board.pane.remove')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onRemoveAndClose} className="text-red-500 focus:text-red-500">
              {t('board.pane.removeAndClose')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export default memo(PaneHeader)
