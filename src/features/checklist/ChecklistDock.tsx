import { useEffect, useId, useRef } from 'react'
import { ChevronUp, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { engineApi } from '../../services/engine'
import type { Checklist, ChecklistItem } from '../../types/protocol.generated'
import { useChecklistStore } from './checklistStore'

/**
 * The live checklist above the composer: what Rinari is doing, step by step,
 * as she reports it (`checklist.update`). Collapsed it is one line (progress
 * ring, count and the step in progress); expanded it is the list.
 *
 * Truthful by construction: a step is checked only when the Engine says so,
 * an interrupted list says so, and nothing appears for conversations that do
 * not need a list. Motion marks changes seen live (an item that arrives, a
 * step that completes), never a list that was already there when it mounted.
 */
export function ChecklistDock({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const entry = useChecklistStore((state) => state.bySession[sessionId])
  const expanded = useChecklistStore((state) => state.expanded[sessionId] ?? false)
  const setExpanded = useChecklistStore((state) => state.setExpanded)
  const apply = useChecklistStore((state) => state.apply)
  const bodyId = useId()

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

  const checklist = entry?.checklist ?? null
  const seen = useSeenStatuses(checklist)
  if (!checklist) return null

  const { counts, state } = checklist
  const working = state === 'active'
  const current = checklist.items.find((item) => item.status === 'in_progress')
    ?? (working ? checklist.items.find((item) => item.status === 'pending') : undefined)
  const left = counts.total - counts.completed
  const headline = state === 'interrupted'
    ? t('checklist.interrupted', { n: left })
    : state === 'completed'
      ? t('checklist.done')
      : state === 'open'
        ? t('checklist.open', { n: left })
        : current ? (current.active_form || current.content) : t('checklist.working')

  async function dismiss() {
    try {
      const result = await engineApi.clearSessionChecklist(sessionId)
      apply(sessionId, result.checklist ?? null, true)
    } catch { /* the turn may have started again; the list stays */ }
  }

  return (
    <section
      className={cn('checklist-dock', entry?.live && 'is-live')}
      data-state={state}
      data-testid="checklist-dock"
      aria-label={t('checklist.label')}
    >
      <div className="checklist-bar">
        <button
          type="button"
          className="checklist-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded(sessionId, !expanded)}
        >
          <ProgressRing done={counts.completed} total={counts.total} working={working} />
          <span className="checklist-count" aria-label={t('checklist.progress', { done: counts.completed, total: counts.total })}>
            {counts.completed}/{counts.total}
          </span>
          <span key={headline} className="checklist-headline" role={working ? 'status' : undefined}>{headline}</span>
          <ChevronUp size={14} aria-hidden="true" className="checklist-chevron" />
        </button>
        {!working && (
          <button type="button" className="checklist-dismiss" onClick={() => void dismiss()} aria-label={t('checklist.dismiss')} title={t('checklist.dismiss')}>
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      <div id={bodyId} className="checklist-body" data-open={expanded || undefined} inert={!expanded || undefined}>
        <div className="checklist-body-inner">
          {checklist.explanation && <p className="checklist-note">{checklist.explanation}</p>}
          <ol className="checklist-items">
            {checklist.items.map((item) => (
              <ChecklistRow key={item.id} item={item} working={working} arrived={seen.arrived.has(item.id)} justDone={seen.completed.has(item.id)} />
            ))}
          </ol>
        </div>
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
        {item.content}
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

function ProgressRing({ done, total, working }: { done: number; total: number; working: boolean }) {
  const ratio = total > 0 ? done / total : 0
  return (
    <span className="checklist-ring" data-working={working || undefined} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="20" height="20">
        <circle className="checklist-ring-track" cx="10" cy="10" r="8" />
        <circle className="checklist-ring-fill" cx="10" cy="10" r="8" pathLength="100" style={{ strokeDashoffset: 100 - ratio * 100 }} />
      </svg>
    </span>
  )
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
