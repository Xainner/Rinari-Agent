import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Globe, StickyNote as StickyNoteIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { useCalmMotion } from '../../lib/motion'
import { commandMessage, engineApi } from '../../services/engine'
import { art } from '../rinari/art'
import type { FollowupSuggestion } from '../../types/protocol.generated'
import { useFollowupStore } from './followupStore'

type Leaving = { id: string; kind: 'dismiss' | 'accept' } | null
type Spawn = { context: 'brief' | 'fork'; isolation: 'auto' | 'worktree' | 'same' }
type Note = FollowupSuggestion & { kind?: 'note' | 'plan_step'; context?: Spawn['context']; isolation?: Spawn['isolation'] }
const ISOLATION_NEXT: Record<Spawn['isolation'], Spawn['isolation']> = { auto: 'same', same: 'worktree', worktree: 'auto' }

const LEAVE_MS = { dismiss: 420, accept: 520 } as const
/** Below this width the note would cover the conversation: it waits as a chip. */
const ROOM_FOR_NOTE_PX = 1180

/**
 * The note Rinari leaves while she works: a short follow-up task, slightly
 * tilted, taped to the corner of the conversation. Seeing it starts nothing.
 * «Hacer en otra conversación» opens a new conversation (same project and
 * profile) that starts the task; «Descartar» peels it away.
 *
 * One note at a time; the others wait behind it and the owner can page
 * through them. It sits in the margin the conversation leaves free; when there
 * is no margin it waits as a small chip and opens on demand, so it never
 * covers the conversation or the composer.
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
  // The note being read, by id: a note that arrives or leaves meanwhile does
  // not swap it for another.
  const [currentId, setCurrentId] = useState<string | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const [roomy, setRoomy] = useState(true)
  // How the child opens: the note's choice until the owner changes it here.
  const [spawn, setSpawn] = useState<Spawn | null>(null)

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
    // With no note there is nothing to place: the content is not watched.
    if (!parent || compact || !notes?.length) return
    // 0 = not laid out yet (hidden, or a test DOM): assume there is room.
    const measure = () => {
      const width = parent.getBoundingClientRect().width
      setRoomy(width === 0 || width >= ROOM_FOR_NOTE_PX)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    // Next frame, not inside the observer: showing or hiding the note there
    // resizes what other observers watch in the same pass, and the browser
    // reported «ResizeObserver loop completed with undelivered notifications».
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(parent)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [compact, notes?.length])

  const at = Math.max(0, notes?.findIndex((item) => item.id === currentId) ?? 0)
  const note = notes?.[at] as Note | undefined
  useEffect(() => { setExpanded(false); setSpawn(null) }, [note?.id])
  if (!note) return <div ref={host} hidden />

  const count = notes?.length ?? 1
  const waiting = count - 1
  const asChip = compact || !roomy
  // Only the note that was dismissed or taken leaves: the Engine's
  // followup.resolved often lands before the call returns, and the next note
  // used to inherit the peel and stay invisible (owner, 28-oct).
  const gone = leaving?.id === note.id ? leaving.kind : null
  const page = (step: number) => setCurrentId(notes![(at + step + count) % count].id)

  async function leave(kind: NonNullable<Leaving>['kind'], current: FollowupSuggestion) {
    setBusy(true)
    try {
      if (kind === 'accept') {
        const result = spawn ? await engineApi.followupAccept(current.id, spawn) : await engineApi.followupAccept(current.id)
        toast.success(t('followups.started', { title: result.session.title ?? current.title }))
      } else {
        await engineApi.followupDismiss(current.id)
      }
      setLeaving({ id: current.id, kind })
      window.setTimeout(() => {
        resolve({ id: current.id, session_id: current.session_id, status: kind === 'accept' ? 'accepted' : 'dismissed' })
        setLeaving((value) => (value?.id === current.id ? null : value))
        setCurrentId((value) => (value === current.id ? null : value))
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
      className={cn('sticky-note', live[note.id] && !calm && 'is-arriving', gone && `is-leaving-${gone}`)}
      data-testid="followup-note"
      data-note-id={note.id}
      aria-label={t('followups.label')}
    >
      {waiting > 0 && <span className="sticky-note-stack" aria-hidden="true" />}
      <img src={art.chibi('peek')} alt="" draggable={false} className="sticky-note-chibi" />
      <span className="sticky-note-tape" aria-hidden="true" />
      <span className="sticky-note-curl" aria-hidden="true" />
      <header className="sticky-note-head">
        <span className="sticky-note-from">{t(note.kind === 'plan_step' ? 'followups.planStep' : 'followups.from')}</span>
        {waiting > 0 && (
          <span className="sticky-note-pager" title={t('followups.more', { n: waiting })}>
            <button type="button" onClick={() => page(-1)} aria-label={t('followups.previous')} title={t('followups.previous')}><ChevronLeft size={12} aria-hidden="true" /></button>
            <span>{at + 1}/{count}</span>
            <button type="button" onClick={() => page(1)} aria-label={t('followups.next')} title={t('followups.next')}><ChevronRight size={12} aria-hidden="true" /></button>
          </span>
        )}
        <button type="button" className="sticky-note-dismiss" disabled={busy || gone !== null} onClick={() => void leave('dismiss', note)} aria-label={t('followups.dismiss')} title={t('followups.dismiss')}>
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
      <p className="sticky-note-spawn">
        <button type="button" className="sticky-note-spawn-chip" data-testid="note-context" disabled={busy || gone !== null}
          onClick={() => setSpawn({ context: (spawn?.context ?? note.context ?? 'brief') === 'brief' ? 'fork' : 'brief', isolation: spawn?.isolation ?? note.isolation ?? 'auto' })}>
          {t((spawn?.context ?? note.context ?? 'brief') === 'fork' ? 'children.context.fork' : 'children.context.brief')}
        </button>
        <button type="button" className="sticky-note-spawn-chip" data-testid="note-isolation" disabled={busy || gone !== null}
          onClick={() => setSpawn({ context: spawn?.context ?? note.context ?? 'brief', isolation: ISOLATION_NEXT[spawn?.isolation ?? note.isolation ?? 'auto'] })}>
          {t(`children.isolation.${spawn?.isolation ?? note.isolation ?? 'auto'}`)}
        </button>
      </p>
      <div className="sticky-note-actions">
        <button type="button" className="sticky-note-accept" disabled={busy || gone !== null} onClick={() => void leave('accept', note)}>
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
