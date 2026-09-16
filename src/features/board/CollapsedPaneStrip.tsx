import { memo } from 'react'
import { CheckCheck, ChevronsRight, CircleHelp, LoaderCircle, MessageSquareShare, MoreHorizontal, ShieldAlert, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import ProviderLogo from '../../components/ProviderLogo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import type { ProviderSummary } from '../../services/engine'
import { cn } from '../../lib/utils'
import { STATUS_LABEL_KEY } from './PaneHeader'
import type { PaneSession } from './usePaneSession'

export const STRIP_WIDTH = 48

export interface CollapsedPaneStripProps {
  paneId: string
  session: PaneSession
  focused: boolean
  providers: ProviderSummary[]
  onExpand: () => void
  onOpenSingle: () => void
  onRemove: () => void
  /** El resizer exterior nunca actúa sobre una tira. */
}

/**
 * Tira vertical de 48 px para un panel colapsado. No monta chat, composer ni
 * workspace: solo estado confirmado, título, proveedor/modelo y badges
 * independientes (intervención, resultado sin leer, mensajes de pares). El
 * área principal es un **botón real** de expandir; el menú es un botón
 * hermano: nada se anida ni se propaga al click de expandir.
 */
function CollapsedPaneStrip({ paneId, session, focused, providers, onExpand, onOpenSingle, onRemove }: CollapsedPaneStripProps) {
  const { t } = useI18n()
  const { record, project, projectRoot, activeModel, status, approvals, pendingQuestions } = session
  const title = record?.title || t('sidebar.newChat')
  const projectName = project?.name ?? projectRoot ?? null
  const statusLabel = t(STATUS_LABEL_KEY[status.kind])
  const interventions = approvals.length + pendingQuestions
  const providerAlias = activeModel?.provider ?? null
  const providerEndpoint = providers.find((provider) => provider.alias === providerAlias)?.endpoint ?? null
  const modelLabel = activeModel ? `${activeModel.provider} › ${activeModel.alias}` : record?.model_id ?? t('board.pane.modelMissing')
  const summary = [title, projectName, modelLabel, statusLabel].filter(Boolean).join(' · ')
  const working = status.kind === 'working' || status.kind === 'cancelling'
  const peerUnread = status.unreadPeerCount ?? 0

  return (
    <section
      aria-label={title}
      data-pane-id={paneId}
      data-collapsed="true"
      data-status={status.kind}
      data-unread={status.unreadResultCount > 0 || undefined}
      data-focused={focused || undefined}
      className={cn('pane-strip', focused && 'is-focused', working && 'is-working')}
      style={{ width: STRIP_WIDTH }}
    >
      <button
        type="button"
        className="pane-strip-expand"
        aria-expanded={false}
        aria-label={t('board.strip.expand', { title })}
        title={summary}
        onClick={onExpand}
      >
        <span className="pane-strip-status" data-kind={status.kind} aria-hidden="true">
          {working ? <LoaderCircle size={12} className="motion-safe:animate-spin" /> : <span className="pane-strip-dot" />}
        </span>
        <span className="pane-strip-title" aria-hidden="true">{title}</span>
        <span className="pane-strip-model" aria-hidden="true">
          <ProviderLogo alias={providerAlias} endpoint={providerEndpoint} size={14} />
        </span>
      </button>
      <div className="pane-strip-badges" role="group" aria-label={statusLabel}>
        {interventions > 0 && (
          <span className="pane-strip-badge is-needs-you" role="status" aria-label={t('board.pane.pending', { n: interventions })} title={t('board.pane.pending', { n: interventions })}>
            {approvals.length > 0 ? <ShieldAlert size={11} aria-hidden="true" /> : <CircleHelp size={11} aria-hidden="true" />}
            {interventions}
          </span>
        )}
        {status.unreadResultCount > 0 && (
          <span className="pane-strip-badge is-unread" role="status" aria-label={t('board.status.unreadCount', { n: status.unreadResultCount })} title={t('board.status.unreadCount', { n: status.unreadResultCount })}>
            {status.unreadResultCount}
          </span>
        )}
        {peerUnread > 0 && (
          <span className="pane-strip-badge is-peer" role="status" aria-label={t('board.strip.peerUnread', { n: peerUnread })} title={t('board.strip.peerUnread', { n: peerUnread })}>
            <MessageSquareShare size={11} aria-hidden="true" />{peerUnread}
          </span>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('board.pane.menu')} title={t('board.pane.menu')} className="pane-strip-menu">
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-56">
          <DropdownMenuItem onSelect={onExpand}><ChevronsRight size={13} /> {t('board.pane.expand')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenSingle}>{t('board.pane.openSingle')}</DropdownMenuItem>
          <DropdownMenuItem disabled={status.unreadResultCount === 0} onSelect={session.markAllSeen}><CheckCheck size={13} /> {t('board.pane.markRead')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onRemove}><X size={13} /> {t('board.pane.remove')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  )
}

export default memo(CollapsedPaneStrip)
