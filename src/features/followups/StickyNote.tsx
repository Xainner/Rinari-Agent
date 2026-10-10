import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, Globe, StickyNote as StickyNoteIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { useCalmMotion } from '../../lib/motion'
import { commandMessage, engineApi } from '../../services/engine'
import { art } from '../rinari/art'
import type { FollowupSuggestion } from '../../types/protocol.generated'
import { useFollowupStore } from './followupStore'

type Leaving = 'dismiss' | 'accept' | null

const LEAVE_MS = { dismiss: 420, accept: 520 } as const
/** Below this width the note would cover the conversation: it waits as a chip. */
const ROOM_FOR_NOTE_PX = 1180

/**
 * The note Rinari leaves while she works: a short follow-up task, slightly
 * tilted, taped to the corner of the conversation. Seeing it starts nothing.
 * «Hacer en otra conversación» opens a new conversation (same project and
 * profile) that starts the task; «Descartar» peels it away.
 *
 * One note at a time; more wait behind it. It sits in the margin the
 * conversation leaves free; when there is no margin it waits as a small chip
 * and opens on demand, so it never covers the conversation or the composer.
 */
export function StickyNote({ sessionId, compact = false }: { sessionId: string; compact?: boolean }) {
  const { t } = useI18n()
  const calm = useCalmMotion()
  const notes = useFollowupStore((state) => state.bySession[sessionId])
  const loaded = useFollowupStore((state) => state.loaded[sessionId])
  const live = useFollowupStore((state) => state.live)
  const setPending = useFollowupStore((state) => state.setPending)
  const resolve = useFollowupStore((state) => state.resolve)
  const [leaving, setLeaving] = useState<Leaving>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const [roomy, setRoomy] = useState(true)

  useEffect(() => {
    if (!sessionId || loaded) return
    let cancelled = false
    engineApi.followupList({ sessionId })
      .then((result) => { if (!cancelled) setPending(sessionId, result.suggestions) })
      .catch(() => { if (!cancelled) setPending(sessionId, []) })
    return () => { cancelled = true }
  }, [sessionId, loaded, setPending])

  useLayoutEffect(() => {
    const parent = host.current?.parentElement
    if (!parent || compact) return
    // 0 = not laid out yet (hidden, or a test DOM): assume there is room.
    const measure = () => {
      const width = parent.getBoundingClientRect().width
      setRoomy(width === 0 || width >= ROOM_FOR_NOTE_PX)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [compact, notes?.length])

  const note = notes?.[0]
  useEffect(() => { setExpanded(false); setLeaving(null) }, [note?.id])
  if (!note) return <div ref={host} hidden />

  const waiting = (notes?.length ?? 1) - 1
  const asChip = compact || !roomy

  async function leave(kind: Exclude<Leaving, null>, current: FollowupSuggestion) {
    setBusy(true)
    try {
      if (kind === 'accept') {
        const result = await engineApi.followupAccept(current.id)
        toast.success(t('followups.started', { title: result.session.title ?? current.title }))
      } else {
        await engineApi.followupDismiss(current.id)
      }
      setLeaving(kind)
      window.setTimeout(() => {
        resolve({ id: current.id, session_id: current.session_id, status: kind === 'accept' ? 'accepted' : 'dismissed' })
        setOpen(false)
      }, calm ? 0 : LEAVE_MS[kind])
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const card = (
    <article
      key={note.id}
      className={cn('sticky-note', live[note.id] && !calm && 'is-arriving', leaving && `is-leaving-${leaving}`)}
      data-testid="followup-note"
      data-note-id={note.id}
      aria-label={t('followups.label')}
    >
      {waiting > 0 && <span className="sticky-note-stack" aria-hidden="true" />}
      <img src={art.chibi('peek')} alt="" draggable={false} className="sticky-note-chibi" />
      <span className="sticky-note-tape" aria-hidden="true" />
      <span className="sticky-note-curl" aria-hidden="true" />
      <header className="sticky-note-head">
        <span className="sticky-note-from">{t('followups.from')}</span>
        {waiting > 0 && <span className="sticky-note-more" title={t('followups.more', { n: waiting })}>+{waiting}</span>}
        <button type="button" className="sticky-note-dismiss" disabled={busy || leaving !== null} onClick={() => void leave('dismiss', note)} aria-label={t('followups.dismiss')} title={t('followups.dismiss')}>
          <X size={13} aria-hidden="true" />
        </button>
      </header>
      <h3 className="sticky-note-title">{note.title}</h3>
      <p className={cn('sticky-note-prompt', expanded && 'is-expanded')}>{note.prompt}</p>
      {note.prompt.length > 140 && (
        <button type="button" className="sticky-note-expand" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? t('followups.less') : t('followups.readAll')}
        </button>
      )}
      {note.rationale && <p className="sticky-note-why">{note.rationale}</p>}
      {note.external_content && (
        <p className="sticky-note-caution"><Globe size={11} aria-hidden="true" /> {t('followups.external')}</p>
      )}
      <div className="sticky-note-actions">
        <button type="button" className="sticky-note-accept" disabled={busy || leaving !== null} onClick={() => void leave('accept', note)}>
          <span>{t('followups.accept')}</span> <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  )

  return (
    <div ref={host} className={cn('sticky-note-anchor', asChip && 'is-chip', compact && 'is-compact')}>
      {asChip ? (
        <>
          <button type="button" className={cn('sticky-note-chip', live[note.id] && !calm && 'is-arriving')} aria-expanded={open} onClick={() => setOpen((value) => !value)} data-testid="followup-chip">
            <StickyNoteIcon size={13} aria-hidden="true" /> {t('followups.chip')}{waiting > 0 ? ` · ${waiting + 1}` : ''}
          </button>
          {open && <div className="sticky-note-pop">{card}</div>}
        </>
      ) : card}
    </div>
  )
}
