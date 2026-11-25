import { useEffect, useId, useRef, useState } from 'react'
import { CheckCheck, ChevronUp, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { engineApi } from '../../services/engine'
import type { Checklist, ChecklistItem } from '../../types/protocol.generated'
import type { TurnTimeline } from '../activity/types'
import TurnStatusLine from '../activity/TurnStatusCard'
import { useChecklistStore } from './checklistStore'

/** Reads a conversation's list once, if no live event brought it first. */
export function useChecklistLoad(sessionId: string) {
  const apply = useChecklistStore((state) => state.apply)
  useEffect(() => {
    if (!sessionId || useChecklistStore.getState().bySession[sessionId]) return
    let cancelled = false
    engineApi.sessionChecklist(sessionId)
      .then((result) => {
        // A live event that arrived meanwhile is newer than this read.
        if (cancelled || useChecklistStore.getState().bySession[sessionId]) return
        apply(sessionId, result.checklist ?? null, false)
      })
      .catch(() => { /* an older Engine or a closed session: no list */ })
    return () => { cancelled = true }
  }, [sessionId, apply])
}

/**
 * The status at the top of the composer: what Rinari is doing now and, when
 * she keeps a list (`checklist.update`), her steps. While a turn runs its bar
 * is the turn's live line (face, step, action, time, tokens); otherwise it is
 * the list's progress (ring, count, headline). Expanded, the list opens above
 * the bar.
 *
 * Truthful by construction: a step is checked only when the Engine says so,
 * an interrupted list says so, and nothing appears for conversations that do
 * not need a list. Motion marks changes seen live (an item that arrives, a
 * step that completes), never a list that was already there when it mounted.
 */
export function ChecklistDock({ sessionId, live = null }: { sessionId: string; live?: TurnTimeline | null }) {
  const { t } = useI18n()
  const entry = useChecklistStore((state) => state.bySession[sessionId])
  const expanded = useChecklistStore((state) => state.expanded[sessionId] ?? false)
  const setExpanded = useChecklistStore((state) => state.setExpanded)
  const apply = useChecklistStore((state) => state.apply)
  const bodyId = useId()

  const checklist = entry?.checklist ?? null
  const seen = useSeenStatuses(checklist)
  const finishedLive = useFinishedLive(checklist?.state ?? null)
  const settled = useSettledOpen(expanded && Boolean(checklist))
  const mode = live ? 'live' : 'list'
  const swapped = useSwapped(checklist || live ? mode : null)
  if (!checklist && !live) return null

  const counts = checklist?.counts ?? { pending: 0, in_progress: 0, completed: 0, blocked: 0, total: 0 }
  const state = checklist?.state ?? 'active'
  const working = state === 'active'
  const current = checklist?.items.find((item) => item.status === 'in_progress')
    ?? (working ? checklist?.items.find((item) => item.status === 'pending') : undefined)
  const left = counts.total - counts.completed
  // Con su plural: «Queda 1 paso», no «Quedan 1 pasos» (#6).
  const headline = state === 'interrupted'
    ? t(left === 1 ? 'checklist.interruptedOne' : 'checklist.interrupted', { n: left })
    : state === 'completed'
      ? t('checklist.done')
      : state === 'open'
        ? t(left === 1 ? 'checklist.openOne' : 'checklist.open', { n: left })
        : current ? (current.active_form || current.content) : t('checklist.working')

  // Una lista que quedó abierta en un turno ya terminado: el dueño la cierra
  // como hecha sin pedírselo a Rinari (plan 0.4.0 #59).
  async function completeAll() {
    try {
      const result = await engineApi.completeSessionChecklist(sessionId)
      apply(sessionId, result.checklist ?? null, true)
    } catch { /* the turn may have started again; the list stays */ }
  }

  async function dismiss() {
    try {
      const result = await engineApi.clearSessionChecklist(sessionId)
      apply(sessionId, result.checklist ?? null, true)
    } catch { /* the turn may have started again; the list stays */ }
  }

  const lineContent = live ? (
    <span key="live" className={cn('checklist-bar-content', swapped && 'is-swapped')}><TurnStatusLine timeline={live} checklist={checklist} /></span>
  ) : checklist ? (
    <span key="list" className={cn('checklist-bar-content', swapped && 'is-swapped')}>
      <ProgressRing done={counts.completed} total={counts.total} working={working} finished={state === 'completed'} />
      {/* Mientras trabaja cuenta el paso en curso («Paso 2/3»); si no, los hechos. */}
      <span className="checklist-count" aria-label={t('checklist.progress', { done: counts.completed, total: counts.total })}>
        {working && current ? t('turn.status.step', { n: checklist.items.indexOf(current) + 1, total: counts.total }) : `${counts.completed}/${counts.total}`}
      </span>
      <span key={headline} className="checklist-headline" role={working ? 'status' : undefined}>{headline}</span>
    </span>
  ) : null

  return (
    <section
      className={cn('checklist-dock', finishedLive && 'just-finished')}
      data-state={checklist ? state : 'live'}
      data-mode={mode}
      data-testid={checklist ? 'checklist-dock' : undefined}
      aria-label={checklist ? t('checklist.label') : undefined}
    >
      {/* The list opens above its bar: the composer stays where it is. */}
      {checklist && (
        <div id={bodyId} className="checklist-body" data-open={expanded || undefined} data-settled={settled || undefined} inert={!expanded || undefined}>
          <div className="checklist-body-inner">
            {checklist.explanation && <p className="checklist-note">{checklist.explanation}</p>}
            <ol className="checklist-items">
              {checklist.items.map((item) => (
                <ChecklistRow key={item.id} item={item} working={working} arrived={seen.arrived.has(item.id)} justDone={seen.completed.has(item.id)} />
              ))}
            </ol>
          </div>
        </div>
      )}
      <div className="checklist-bar">
        {checklist ? (
          <button
            type="button"
            className="checklist-toggle"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded(sessionId, !expanded)}
          >
            {lineContent}
            <ChevronUp size={14} aria-hidden="true" className="checklist-chevron" />
          </button>
        ) : (
          <div className="checklist-toggle is-static">{lineContent}</div>
        )}
        {checklist && !live && (state === 'open' || state === 'interrupted') && (
          <button type="button" className="checklist-dismiss checklist-complete" onClick={() => void completeAll()} aria-label={t('checklist.completeAll')} title={t('checklist.completeAll')}>
            <CheckCheck size={13} aria-hidden="true" />
          </button>
        )}
        {checklist && !working && !live && (
          <button type="button" className="checklist-dismiss" onClick={() => void dismiss()} aria-label={t('checklist.dismiss')} title={t('checklist.dismiss')}>
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}

function ChecklistRow({ item, working, arrived, justDone }: { item: ChecklistItem; working: boolean; arrived: boolean; justDone: boolean }) {
  const { t } = useI18n()
  return (
    <li className={cn('checklist-item', arrived && 'is-new', justDone && 'just-done')} data-status={item.status}>
      <StatusMark status={item.status} working={working} />
      <span className="checklist-item-text">
        <span className="sr-only">{t(`checklist.status.${item.status}`)}: </span>
        <span className="checklist-item-label">{item.content}</span>
        {item.status === 'blocked' && item.blocked_reason && <span className="checklist-item-reason">{item.blocked_reason}</span>}
      </span>
    </li>
  )
}

function StatusMark({ status, working }: { status: ChecklistItem['status']; working: boolean }) {
  return (
    <span className="checklist-mark" data-status={status} data-working={working && status === 'in_progress' ? 'true' : undefined} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="16" height="16">
        <circle className="checklist-mark-ring" cx="8" cy="8" r="6.25" />
        {status === 'in_progress' && <circle className="checklist-mark-arc" cx="8" cy="8" r="6.25" pathLength="100" />}
        {status === 'completed' && <path className="checklist-mark-check" d="M5.1 8.3 7.1 10.2 10.9 6.1" pathLength="1" />}
        {status === 'blocked' && <path className="checklist-mark-bang" d="M8 4.6v4.2M8 11.1v.3" />}
      </svg>
    </span>
  )
}

function ProgressRing({ done, total, working, finished }: { done: number; total: number; working: boolean; finished: boolean }) {
  const ratio = total > 0 ? done / total : 0
  const gradient = useId()
  return (
    <span className="checklist-ring" data-working={working || undefined} data-finished={finished || undefined} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--violet-300)" />
            <stop offset="100%" stopColor="var(--magenta-400)" />
          </linearGradient>
        </defs>
        <circle className="checklist-ring-track" cx="12" cy="12" r="9.5" />
        <circle className="checklist-ring-fill" cx="12" cy="12" r="9.5" pathLength="100" stroke={finished ? undefined : `url(#${gradient})`} style={{ strokeDashoffset: 100 - ratio * 100 }} />
        {working && <circle className="checklist-ring-spark" cx="12" cy="12" r="9.5" pathLength="100" />}
        {finished && <path className="checklist-ring-check" d="M8.2 12.3 10.9 14.9 15.9 9.4" pathLength="1" />}
      </svg>
    </span>
  )
}

/**
 * Whether the bar's content changed kind (the turn's live line, the list's
 * progress) while on screen: only then does the new content enter. Kept for
 * the life of that content, so a later render does not cut its entrance.
 */
function useSwapped(mode: string | null): boolean {
  const seen = useRef<{ mode: string | null; swapped: boolean }>({ mode, swapped: false })
  if (seen.current.mode !== mode) seen.current = { mode, swapped: seen.current.mode !== null && mode !== null }
  return seen.current.swapped
}

/** True only when the list became completed while it was on screen: that is the moment to celebrate, once. */
function useFinishedLive(state: Checklist['state'] | null): boolean {
  const previous = useRef(state)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    if (previous.current && previous.current !== 'completed' && state === 'completed') setFinished(true)
    else if (state !== 'completed') setFinished(false)
    previous.current = state
  }, [state])
  return finished
}

/**
 * Which items appeared, and which became completed, since the previous
 * revision rendered here. Only those animate: a list already on screen when
 * this mounts shows still. Keyed by revision, so a re-render does not replay.
 */
function useSeenStatuses(checklist: Checklist | null): { arrived: Set<string>; completed: Set<string> } {
  const snapshot = useRef<Map<string, string> | null>(null)
  const diff = useRef<{ revision: number | null; arrived: Set<string>; completed: Set<string> }>({
    revision: null,
    arrived: new Set(),
    completed: new Set(),
  })
  if (checklist && diff.current.revision !== checklist.revision) {
    const arrived = new Set<string>()
    const completed = new Set<string>()
    const before = snapshot.current
    if (before) {
      for (const item of checklist.items) {
        const status = before.get(item.id)
        if (status === undefined) arrived.add(item.id)
        else if (status !== 'completed' && item.status === 'completed') completed.add(item.id)
      }
    }
    diff.current = { revision: checklist.revision, arrived, completed }
    snapshot.current = new Map(checklist.items.map((item) => [item.id, item.status]))
  }
  return diff.current
}

/** Lo que dura abrir o cerrar la lista (`--dur-base`), con margen. */
const BODY_TRANSITION_MS = 260

/**
 * Abierta y ya quieta (#26): el scroll interno solo se enciende al terminar
 * de abrirse y se apaga en cuanto empieza a cerrarse, así la barra no aparece
 * a mitad de la animación ni el contenido salta al cerrar. Termina también
 * con un temporizador: sin animación (movimiento reducido) no llega
 * `transitionend`.
 */
function useSettledOpen(expanded: boolean): boolean {
  const [settled, setSettled] = useState(expanded)
  useEffect(() => {
    if (!expanded) { setSettled(false); return }
    const timer = window.setTimeout(() => setSettled(true), BODY_TRANSITION_MS)
    return () => window.clearTimeout(timer)
  }, [expanded])
  return settled
}
