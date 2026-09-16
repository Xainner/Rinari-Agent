import { memo } from 'react'
import {
  ArrowLeftRight,
  CheckCheck,
  CircleHelp,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  MessageSquareShare,
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { projectDisplayName } from '../projects/workspaceModel'
import { cn } from '../../lib/utils'
import type { PaneSession } from './usePaneSession'
import type { PaneStatusKind } from '../engine/sessionSelectors'
import type { I18nKey } from '../../i18n/es'

const MODES = ['plan', 'build', 'review'] as const

export const STATUS_LABEL_KEY = {
  working: 'board.status.working',
  needs_you: 'board.status.needsYou',
  done: 'board.status.done',
  failed: 'board.status.failed',
  idle: 'board.status.idle',
  cancelling: 'board.status.cancelling',
  cancelled: 'board.status.cancelled',
  stopped: 'board.status.stopped',
  loading: 'board.status.loading',
  unavailable: 'board.status.unavailable',
} satisfies Record<PaneStatusKind, I18nKey>

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
  /** Mensajería entre paneles; `undefined` cuando el Engine no la anuncia. */
  peers?: {
    boardEnabled: boolean
    receive: boolean
    send: boolean
    onReceiveChange: (value: boolean) => void
    onSendChange: (value: boolean) => void
    onForward: () => void
    canForward: boolean
  }
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
  peers,
}: PaneHeaderProps) {
  const { t } = useI18n()
  const { record, project, projectRoot, gitStatus, gitError, busy, approvals, pendingQuestions, activeModel, status } = session
  const statusLabel = t(STATUS_LABEL_KEY[status.kind])
  const title = record?.title || t('sidebar.newChat')
  const projectName = project?.name ?? projectRoot
  const git = gitStatus?.status.available ? gitStatus.status : null
  const interventions = approvals.length + pendingQuestions
  const mode = (record?.mode ?? 'build').toLowerCase()
  const peerState = !peers ? null
    : !peers.boardEnabled ? 'off'
      : peers.receive && peers.send ? 'on'
        : peers.receive ? 'receiveOnly'
          : peers.send ? 'sendOnly' : 'off'
  const peerLabel = peerState === 'on' ? t('board.peers.enabled')
    : peerState === 'receiveOnly' ? t('board.peers.receiveOnly')
      : peerState === 'sendOnly' ? t('board.peers.sendOnly')
        : peers && !peers.boardEnabled ? t('board.peers.disabledBoard') : t('board.peers.off')

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
        <span
          role="status"
          data-testid="pane-status"
          data-kind={status.kind}
          className="pane-header-status"
          title={status.error ?? status.stopReason?.message ?? statusLabel}
        >
          <span className="pane-header-status-dot" aria-hidden="true" />
          {statusLabel}
        </span>
        {status.unreadResultCount > 0 && (
          <span
            className="pane-header-new"
            data-testid="pane-unread"
            aria-label={t('board.status.unreadCount', { n: status.unreadResultCount })}
            title={t('board.status.unreadCount', { n: status.unreadResultCount })}
          >
            {t('board.status.new')}{status.unreadResultCount > 1 ? ` · ${status.unreadResultCount}` : ''}
          </span>
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
        {peers && (
          <span
            role="status"
            data-testid="pane-peer-state"
            data-state={peerState ?? 'off'}
            aria-label={peerLabel}
            title={peerLabel}
            className={cn('pane-header-peer', peerState === 'on' && 'is-on', peerState === 'off' && 'is-off')}
          >
            <MessageSquareShare size={13} aria-hidden="true" />
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
            <DropdownMenuItem disabled={status.unreadResultCount === 0} onSelect={session.markAllSeen}><CheckCheck size={13} /> {t('board.pane.markRead')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleWorkspace}><PanelRight size={13} /> {t('board.pane.toggleWorkspace')}</DropdownMenuItem>
            {peers && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-normal text-[var(--text-subtle)]">{t('board.peers.menu')}</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={peers.receive}
                  disabled={!peers.boardEnabled}
                  onCheckedChange={(value) => peers.onReceiveChange(value === true)}
                >
                  {t('board.peers.receive')}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={peers.send}
                  disabled={!peers.boardEnabled}
                  onCheckedChange={(value) => peers.onSendChange(value === true)}
                >
                  {t('board.peers.send')}
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem disabled={!peers.canForward} onSelect={peers.onForward}>
                  <MessageSquareShare size={13} /> {t('board.peers.sendTo')}
                </DropdownMenuItem>
              </>
            )}
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
