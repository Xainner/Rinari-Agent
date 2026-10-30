import { memo, useMemo } from 'react'
import {
  ArrowLeftRight,
  ChevronsLeft,
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
import type { PaneStatusKind } from '../engine/sessionSelectors'
import type { I18nKey } from '../../i18n/es'
import { RinariAvatar, type RinariState } from '../rinari/RinariAvatar'
import { rinariStateForTurn } from '../rinari/turnState'
import { activityState, turnIsActive } from '../activity/activityPresentation'
import type { TurnTimeline } from '../activity/types'
import { TitleSwap } from '../../components/TitleSwap'
import { pendingLabel } from './paneDigest'

/** Expresión de Rinari en la cabecera del panel, según su estado real. */
const STATUS_FACE: Record<PaneStatusKind, RinariState> = {
  working: 'working',
  needs_you: 'waiting',
  done: 'done',
  failed: 'error',
  idle: 'idle',
  cancelling: 'thinking',
  cancelled: 'idle',
  stopped: 'idle',
  loading: 'thinking',
  unavailable: 'offline',
}

/**
 * Cara de Rinari en la cabecera del panel. Mientras trabaja sigue el turno en
 * curso (pensando, usando herramientas, escribiendo, esperando una decisión),
 * igual que la conversación normal; en Boards es el único lugar donde aparece.
 */
export function paneFace(kind: PaneStatusKind, timelines: Record<string, TurnTimeline>): RinariState {
  if (kind !== 'working') return STATUS_FACE[kind]
  let live: TurnTimeline | null = null
  for (const turn of Object.values(timelines)) {
    if (turnIsActive(turn.status) && (!live || turn.startedAt >= live.startedAt)) live = turn
  }
  if (!live) return STATUS_FACE.working
  const face = rinariStateForTurn(activityState(live).kind)
  return face === 'idle' ? STATUS_FACE.working : face
}

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
  canMoveLeft: boolean
  canMoveRight: boolean
  onToggleWorkspace: () => void
  onOpenSingle: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
  onRemove: () => void
  onCollapse: () => void
}

/**
 * Header local de un panel: la cara de Rinari (su estado), identidad del
 * proyecto/chat, rama, no leídos, plegar, panel lateral y un menú corto
 * (vista única, mover, quitar del board). No edita modelo, modo,
 * razonamiento ni permisos: eso pertenece al Composer de la sesión. Es más
 * compacto que la barra superior y nunca la sustituye.
 */
function PaneHeader({
  session,
  focused,
  sharedRoot,
  workspaceVisible,
  canMoveLeft,
  canMoveRight,
  onToggleWorkspace,
  onOpenSingle,
  onMoveLeft,
  onMoveRight,
  onRemove,
  onCollapse,
}: PaneHeaderProps) {
  const { t } = useI18n()
  const { record, project, projectRoot, gitError, busy, approvals, pendingQuestions, status } = session
  const statusLabel = t(STATUS_LABEL_KEY[status.kind])
  const face = useMemo(() => paneFace(status.kind, session.timelines), [status.kind, session.timelines])
  const title = record?.title || t('sidebar.newChat')
  const projectName = project?.name ?? projectRoot
  const interventions = approvals.length + pendingQuestions

  return (
    <header className={cn('pane-header', focused && 'is-focused')} data-testid="pane-header">
      <RinariAvatar state={face} size={28} className="pane-header-face" />
      <div className="pane-header-identity">
        <TitleSwap className="pane-header-title" sessionId={record?.id ?? null} text={title} />
        {projectName && (
          <span
            className="pane-header-project"
            title={projectRoot ?? projectName}
          >
            <GitBranch size={11} aria-hidden="true" />
            <span className="truncate">{projectDisplayName(projectName)}</span>
            {gitError && <span className="text-[var(--warning)]">· {t('project.gitMissing')}</span>}
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
          title={status.error ?? (status.stopReason?.message || statusLabel)}
        >
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
        {busy && (
          <span role="status" aria-label={t('sidebar.sessionWorking')} title={t('sidebar.sessionWorking')} className="pane-header-busy">
            <LoaderCircle size={14} aria-hidden="true" className="motion-safe:animate-spin" />
          </span>
        )}
        {interventions > 0 && (
          <span className="pane-header-badge" role="status" aria-label={pendingLabel(t, interventions)} title={pendingLabel(t, interventions)}>
            {approvals.length > 0 ? <ShieldAlert size={12} aria-hidden="true" /> : <CircleHelp size={12} aria-hidden="true" />}
            {interventions}
          </span>
        )}
        <button
          type="button"
          aria-label={t('board.pane.collapse')}
          title={t('board.pane.collapse')}
          onClick={onCollapse}
          className="pane-header-icon"
        >
          <ChevronsLeft size={15} />
        </button>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canMoveLeft} onSelect={onMoveLeft}><ArrowLeftRight size={13} /> {t('board.pane.moveLeft')}</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveRight} onSelect={onMoveRight}><ArrowLeftRight size={13} /> {t('board.pane.moveRight')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRemove}><X size={13} /> {t('board.pane.remove')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export default memo(PaneHeader)
