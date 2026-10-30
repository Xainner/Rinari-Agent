import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage, engineApi, isCommandError } from '../../services/engine'
import type { SteerTimelineItem } from './types'
import { ChildReportSeparator } from '../../components/MessageBubble'

/**
 * Lo que escribiste mientras Rinari trabajaba, en el punto donde lo leyó.
 * Mientras no lo haya leído (#54) se puede editar en el mismo sitio (Enter
 * guarda, Esc cancela) o borrar; si Rinari lo lee justo antes, se dice y el
 * mensaje queda como estaba. El timeline sigue `steer.updated` y
 * `steer.cancelled`, así que aquí no se copia el texto nuevo a mano.
 */
export function SteerBubble({ item, sessionId }: { item: SteerTimelineItem; sessionId?: string }) {
  // El informe de una hija que la madre leyó a mitad de turno (#100): la misma
  // línea «Mensaje recibido de …» que cuando la despierta, en el punto donde lo leyó.
  if (item.source === 'child_report') return <ChildReportSeparator names={item.content} childIds={item.children} reports={item.reports} />
  return <OwnerSteerBubble item={item} sessionId={sessionId} />
}

function OwnerSteerBubble({ item, sessionId }: { item: SteerTimelineItem; sessionId?: string }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.content)
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const pending = item.status === 'pending'
  const canChange = pending && Boolean(sessionId)

  // Rinari lo leyó mientras se editaba: ya no se puede cambiar.
  useEffect(() => { if (!pending) setEditing(false) }, [pending])
  useEffect(() => {
    if (!editing) return
    const element = field.current
    if (!element) return
    element.focus()
    element.setSelectionRange(element.value.length, element.value.length)
  }, [editing])

  const failed = (error: unknown) => {
    if (isCommandError(error) && error.code === 'STEER_ALREADY_READ') toast(t('steer.alreadyRead'))
    else toast.error(commandMessage(error))
  }

  const save = async () => {
    const text = draft.trim()
    if (!sessionId || busy) return
    if (!text || text === item.content.trim()) { setEditing(false); return }
    setBusy(true)
    try {
      await engineApi.turnSteerUpdate(sessionId, item.steerId, text)
      setEditing(false)
    } catch (error) {
      failed(error)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const sendNow = async () => {
    if (!sessionId || busy) return
    setBusy(true)
    try {
      await engineApi.turnSteerPromote(sessionId, item.steerId)
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!sessionId || busy) return
    setBusy(true)
    try {
      await engineApi.turnSteerCancel(sessionId, item.steerId)
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="steer-message" data-status={item.status} data-interrupted={item.interrupted || undefined} data-editing={editing || undefined} className="steer-row group flex w-full min-w-0 flex-col items-end gap-0.5 py-1.5">
      <div className="flex w-full min-w-0 items-start justify-end gap-1">
        {canChange && !editing && (
          <span className="steer-actions">
            <button type="button" className="btn btn-quiet btn-icon btn-xs" disabled={busy} aria-label={t('steer.edit')} title={t('steer.edit')} onClick={() => { setDraft(item.content); setEditing(true) }}>
              <Pencil size={12} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-quiet btn-icon btn-xs steer-delete" disabled={busy} aria-label={t('steer.delete')} title={t('steer.delete')} onClick={() => void remove()}>
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </span>
        )}
        {editing ? (
          <textarea
            ref={field}
            className="steer-edit"
            value={draft}
            disabled={busy}
            aria-label={t('steer.editLabel')}
            rows={Math.min(8, Math.max(1, draft.split('\n').length))}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(false) }
              else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void save() }
            }}
            onBlur={() => { if (!busy) setEditing(false) }}
          />
        ) : (
          <div className={cn('steer-bubble w-fit min-w-0 max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)]/15 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--text)]', busy && 'opacity-60')}>
            {item.content}
          </div>
        )}
      </div>
      <span className="steer-note">
        {item.interrupted && !editing && <Zap size={10} aria-hidden="true" />}
        {editing
          ? t('steer.editHint')
          : item.interrupted
            ? t(pending ? 'steer.interrupting' : 'steer.interrupted')
            : t(pending ? 'steer.pending' : 'steer.applied')}
        {canChange && !editing && !item.interrupted && (
          <>
            <span aria-hidden="true">·</span>
            <button type="button" className="steer-send-now" data-testid="steer-send-now" disabled={busy} title={t('steer.sendNowHint')} onClick={() => void sendNow()}>
              <Zap size={10} aria-hidden="true" />{t('steer.sendNow')}
            </button>
          </>
        )}
      </span>
    </div>
  )
}
