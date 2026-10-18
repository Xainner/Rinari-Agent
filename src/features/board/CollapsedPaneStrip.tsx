import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Check, CheckCheck, ChevronsRight, CircleHelp, GitBranch, LoaderCircle, MessageSquare, MoreHorizontal, ShieldAlert, X } from 'lucide-react'
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
import { STATUS_LABEL_KEY, paneFace } from './PaneHeader'
import type { PaneSession } from './usePaneSession'
import { TitleSwap } from '../../components/TitleSwap'
import { RinariAvatar } from '../rinari/RinariAvatar'
import { useChecklistStore } from '../checklist/checklistStore'
import { useChildrenStore } from '../children/childrenStore'
import { projectDisplayName } from '../projects/workspaceModel'
import { formatTokens } from '../activity/tokenUsage'
import { shortElapsed } from '../activity/TurnStatusCard'
import { firstLine, paneDigest } from './paneDigest'
import { NeedsYouActions, PanePeek, usePeek } from './PanePeek'
import { PANE_PEEK_EVENT } from './useBoardNavigation'

export const STRIP_WIDTH = 48
/** Columna plegada con su estado en vivo (plan-boards B.2). */
export const COLUMN_WIDTH = 200

export interface CollapsedPaneStripProps {
  paneId: string
  session: PaneSession
  focused: boolean
  providers: ProviderSummary[]
  /** `column`: ~200 px con el estado en vivo; `strip`: la tira de 48 px cuando no cabe. */
  variant?: 'column' | 'strip'
  onExpand: () => void
  onOpenSingle: () => void
  onRemove: () => void
  /** Ancho que tenía el panel si se acaba de plegar: se encoge desde ahí. */
  foldFrom?: number
  onFoldEnd?: () => void
}

/** Reloj de un segundo solo mientras trabaja: el tiempo del pie avanza. */
function useSecondClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

/** Anillo de la lista de pasos (hechos / total). */
function StepsRing({ done, total }: { done: number; total: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  const ratio = total > 0 ? done / total : 0
  // Completa, el anillo se pone verde y lleva un check: no se lee como un círculo vacío.
  const complete = total > 0 && done >= total
  return (
    <svg className="pane-column-ring" data-complete={complete || undefined} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} className="pane-column-ring-track" />
      <circle cx="12" cy="12" r={r} className="pane-column-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} />
      {complete && <path className="pane-column-ring-check" d="M8.2 12.4l2.6 2.6 5-5.4" />}
    </svg>
  )
}

/**
 * Panel plegado. Como columna (~200 px) sigue contando en vivo en qué va su
 * sesión: la cara de Rinari, el título, el proyecto y su rama, la lista de
 * pasos, la acción del momento, lo que te pide (resoluble ahí mismo), el
 * resultado y, al pie, tokens, tiempo y modelo. Si no cabe, cae a la tira de
 * 48 px de siempre. En las dos, pasar el ratón (o Espacio con el foco) abre el
 * vistazo. No monta chat, composer ni workspace: el runtime sigue vivo aparte.
 * El área principal es un botón real de expandir; el menú es un botón hermano.
 */
function CollapsedPaneStrip({ paneId, session, focused, providers, variant = 'strip', onExpand, onOpenSingle, onRemove, foldFrom, onFoldEnd }: CollapsedPaneStripProps) {
  const { t, lang } = useI18n()
  const { record, project, projectRoot, activeModel, status, approvals, pendingQuestions, gitStatus } = session
  const title = record?.title || t('sidebar.newChat')
  const projectName = project?.name ?? projectRoot ?? null
  const statusLabel = t(STATUS_LABEL_KEY[status.kind])
  const interventions = approvals.length + pendingQuestions
  const providerAlias = activeModel?.provider ?? null
  const providerRecord = providers.find((provider) => provider.id === activeModel?.provider_id) ?? providers.find((provider) => provider.alias === providerAlias)
  const modelLabel = activeModel ? `${activeModel.provider} › ${activeModel.alias}` : record?.model_id ?? t('board.pane.modelMissing')
  const summary = [title, projectName, modelLabel, statusLabel].filter(Boolean).join(' · ')
  const working = status.kind === 'working' || status.kind === 'cancelling'
  const checklist = useChecklistStore((state) => state.bySession[session.sessionId]?.checklist ?? null)
  const children = useChildrenStore((state) => state.byParent?.[session.sessionId])
  // Una hija en su worktree: el chip lo dice (la rama es la suya).
  const ownChild = useChildrenStore((state) => {
    for (const list of Object.values(state.byParent ?? {})) {
      const found = Array.isArray(list) ? list.find((child) => child.child_session_id === session.sessionId) : undefined
      if (found) return found
    }
    return null
  })
  const now = useSecondClock(working)
  const digest = useMemo(
    () => paneDigest({ sessionId: session.sessionId, timelines: session.timelines, checklist, children: children ?? [], now, t }),
    [session.sessionId, session.timelines, checklist, children, now, t],
  )
  const face = useMemo(() => paneFace(status.kind, session.timelines), [status.kind, session.timelines])
  const peek = usePeek()
  const expandRef = useRef<HTMLButtonElement>(null)
  // Ctrl+1…9 / Ctrl+J sobre un panel plegado: el foco y el vistazo, sin desplegarlo.
  useEffect(() => {
    const onPeek = (event: Event) => {
      if ((event as CustomEvent<{ paneId?: string }>).detail?.paneId !== paneId) return
      expandRef.current?.focus()
      peek.show()
    }
    window.addEventListener(PANE_PEEK_EVENT, onPeek)
    return () => window.removeEventListener(PANE_PEEK_EVENT, onPeek)
  }, [paneId, peek.show])
  const column = variant === 'column'
  const width = column ? COLUMN_WIDTH : STRIP_WIDTH
  const branch = ownChild?.branch ?? gitStatus?.status.branch ?? null
  const worktree = ownChild?.isolation === 'worktree'
  const resultLine = !digest.live && (status.kind === 'done' || status.kind === 'failed' || status.kind === 'stopped' || status.kind === 'cancelled') ? firstLine(digest.lastResponse) : null

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Espacio abre el vistazo; Enter despliega el panel (el clic del botón).
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault()
      if (peek.open) peek.hide()
      else peek.show()
    }
  }

  const style = (foldFrom ? { width, '--fold-from': `${foldFrom}px` } : { width }) as CSSProperties

  const section = (
    <section
      aria-label={title}
      data-pane-id={paneId}
      data-collapsed="true"
      data-variant={variant}
      data-status={status.kind}
      data-unread={status.unreadResultCount > 0 || undefined}
      data-focused={focused || undefined}
      className={cn(column ? 'pane-column' : 'pane-strip', focused && 'is-focused', working && 'is-working')}
      data-motion={foldFrom ? 'collapse' : undefined}
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) onFoldEnd?.() }}
      onPointerEnter={peek.enter}
      onPointerLeave={peek.leave}
      style={style}
    >
      {column ? (
        <>
          <button
            ref={expandRef}
            type="button"
            className="pane-column-expand"
            aria-expanded={false}
            aria-label={t('board.strip.expand', { title })}
            title={summary}
            onClick={onExpand}
            onKeyDown={onKeyDown}
          >
            <span className="pane-column-head">
              <RinariAvatar state={face} size={28} className="pane-column-face" />
              <TitleSwap className="pane-column-title" sessionId={record?.id ?? null} text={title} />
            </span>
            <span className="pane-column-context">
              {projectName ? (
                <span className="pane-column-project" title={projectRoot ?? projectName}>
                  <GitBranch size={11} aria-hidden="true" />
                  <span className="truncate">{projectDisplayName(projectName)}{branch ? ` · ${branch}` : ''}</span>
                </span>
              ) : (
                <span className="pane-column-project"><MessageSquare size={11} aria-hidden="true" />{t('board.column.loose')}</span>
              )}
              {worktree && <span className="pane-column-chip">{t('board.column.worktree')}</span>}
            </span>
            {digest.steps && (
              <span className="pane-column-steps" data-testid="pane-column-steps">
                <StepsRing done={digest.steps.done} total={digest.steps.total} />
                <span className="min-w-0">
                  <span className="pane-column-steps-count">{digest.steps.done}/{digest.steps.total}</span>
                  {digest.steps.current && (
                    <span className="pane-column-steps-current">{digest.steps.current} · {t('board.column.step', { n: digest.steps.index + 1, total: digest.steps.total })}</span>
                  )}
                </span>
              </span>
            )}
            {digest.action && <span className="pane-column-now" data-testid="pane-column-now">{digest.action}</span>}
            {!digest.action && digest.children && (
              <span className="pane-column-now">{t('board.column.waitingChildren', { done: digest.children.done, total: digest.children.total })}</span>
            )}
            {/* Sin pasos, acción ni resultado, la columna dice al menos en qué está. */}
            {!digest.steps && !digest.action && !digest.children && !resultLine && interventions === 0 && (
              <span className="pane-column-idle" data-kind={status.kind}>{statusLabel}</span>
            )}
            {resultLine && (
              <span className="pane-column-result" data-kind={status.kind} data-testid="pane-column-result">
                {status.kind === 'done' ? <Check size={12} aria-hidden="true" /> : null}
                <span className="truncate">{resultLine}</span>
                {status.unreadResultCount > 0 && <span className="pane-column-new">{t('board.status.new')}</span>}
              </span>
            )}
          </button>
          {interventions > 0 && <NeedsYouActions session={session} onAnswer={onExpand} />}
          <div className="pane-column-foot">
            <ProviderLogo productId={providerRecord?.product_id} alias={providerAlias} endpoint={providerRecord?.endpoint} size={12} />
            <span className="truncate" title={modelLabel}>{activeModel?.alias ?? modelLabel}</span>
            <span className="pane-column-foot-meta">
              {digest.tokens != null && <span>{formatTokens(digest.tokens, lang)}</span>}
              {digest.elapsedMs != null && <span>{shortElapsed(digest.elapsedMs)}</span>}
            </span>
            <PaneMenu onExpand={onExpand} onOpenSingle={onOpenSingle} onRemove={onRemove} session={session} side="bottom" />
          </div>
        </>
      ) : (
        <>
          <button
            ref={expandRef}
            type="button"
            className="pane-strip-expand"
            aria-expanded={false}
            aria-label={t('board.strip.expand', { title })}
            title={summary}
            onClick={onExpand}
            onKeyDown={onKeyDown}
          >
            <span className="pane-strip-status" data-kind={status.kind} aria-hidden="true">
              <RinariAvatar state={face} size={22} />
            </span>
            {digest.steps && (
              <span className="pane-strip-steps" aria-label={`${digest.steps.done}/${digest.steps.total}`}>
                <StepsRing done={digest.steps.done} total={digest.steps.total} />
              </span>
            )}
            <TitleSwap className="pane-strip-title" aria-hidden sessionId={record?.id ?? null} text={title} />
            <span className="pane-strip-model" aria-hidden="true">
              <ProviderLogo productId={providerRecord?.product_id} alias={providerAlias} endpoint={providerRecord?.endpoint} size={14} />
            </span>
          </button>
          <div className="pane-strip-badges" role="group" aria-label={statusLabel}>
            {working && <LoaderCircle size={12} aria-hidden="true" className="text-[var(--accent-2)] motion-safe:animate-spin" />}
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
          </div>
          <PaneMenu onExpand={onExpand} onOpenSingle={onOpenSingle} onRemove={onRemove} session={session} side="right" />
        </>
      )}
    </section>
  )

  return <PanePeek title={title} face={face} session={session} digest={digest} peek={peek} anchor={section} onExpand={onExpand} />
}

function PaneMenu({ onExpand, onOpenSingle, onRemove, session, side }: { onExpand: () => void; onOpenSingle: () => void; onRemove: () => void; session: PaneSession; side: 'right' | 'bottom' }) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('board.pane.menu')} title={t('board.pane.menu')} className="pane-strip-menu">
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={side} className="w-56">
        <DropdownMenuItem onSelect={onExpand}><ChevronsRight size={13} /> {t('board.pane.expand')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenSingle}>{t('board.pane.openSingle')}</DropdownMenuItem>
        <DropdownMenuItem disabled={session.status.unreadResultCount === 0} onSelect={session.markAllSeen}><CheckCheck size={13} /> {t('board.pane.markRead')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove}><X size={13} /> {t('board.pane.remove')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default memo(CollapsedPaneStrip)
