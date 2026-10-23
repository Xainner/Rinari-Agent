import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, ListOrdered } from 'lucide-react'
import { toast } from 'sonner'
import { commandMessage, engineApi, onEngineEvent, type QueuedPromptEntry } from '../../services/engine'
import { useI18n } from '../../i18n'
import { scheduleTaskName } from '../../features/schedules/scheduleModel'

/**
 * Cola de prompts de la sesión: visible mientras un turno corre o hay
 * entradas pendientes. Encolar preserva turnos y aprobaciones (lo impone el
 * engine).
 */
export default function QueueBar({
  sessionId,
  refreshKey,
  showInput = true,
}: {
  sessionId: string | null
  refreshKey: boolean
  /** Con guiado del turno, el compositor ya encola (Tab): sin campo propio. */
  showInput?: boolean
}) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<QueuedPromptEntry[]>([])
  const [draft, setDraft] = useState('')

  const reload = useCallback(async () => {
    if (!sessionId) {
      setEntries([])
      return
    }
    try {
      const result = await engineApi.queueList(sessionId)
      setEntries(
        result.entries ??
          result.queue.map((message) => ({ message_id: null, message, state: 'queued', origin: { kind: 'user' } })),
      )
    } catch {
      // La cola es post-core: si el engine no la soporta, no rompe el chat.
    }
  }, [sessionId])

  useEffect(() => {
    void reload()
  }, [reload, refreshKey])

  useEffect(() => {
    if (!sessionId) return
    let unlisten: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event === 'session.queue.updated' && event.payload.session_id === sessionId) void reload()
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [sessionId, reload])

  async function add() {
    if (!sessionId || draft.trim() === '') return
    try {
      await engineApi.queueAdd(sessionId, draft.trim())
      setDraft('')
      await reload()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function clear() {
    if (!sessionId) return
    try {
      await engineApi.queueClear(sessionId)
      await reload()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  if (!sessionId || ((!refreshKey || !showInput) && entries.length === 0)) return null

  return (
    // A dock of the composer column, as wide as the step card and the composer
    // (22-oct: it floated narrower and indented, with «Vaciar cola» loose below).
    <div className="queue-bar" data-testid="queue-bar">
      {entries.length > 0 && (
        <div className="queue-dock">
          <div className="queue-dock-head">
            <ListOrdered size={13} aria-hidden="true" />
            <span className="queue-dock-title">{t('queue.title', { n: entries.length })}</span>
            <button type="button" className="btn btn-quiet btn-xs" onClick={() => void clear()} data-testid="queue-clear">
              {t('queue.clear')}
            </button>
          </div>
          <ol className="queue-dock-list">
            {entries.map((entry, i) => (
              <li key={entry.message_id ?? `manual-${i}`} data-state={entry.state} className="queue-dock-item">
                <span className="queue-dock-n">{i + 1}</span>
                {/* De quién es: tuyo, o de una tarea que corre aquí («Repetir aquí»). */}
                {entry.origin.kind === 'schedule' ? (
                  <span className="queue-dock-who is-task" data-testid="queue-entry-schedule">
                    <CalendarClock size={11} aria-hidden="true" />
                    {scheduleTaskName(entry.origin) ?? t('schedules.fromTask')}
                  </span>
                ) : (
                  <span className="queue-dock-who">{t('queue.entryUser')}</span>
                )}
                <span className="min-w-0 flex-1 truncate" title={entry.message}>{entry.message}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {refreshKey && showInput && (
        <div className="flex w-full gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
            placeholder={t('queue.placeholder')}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={draft.trim() === ''}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            {t('queue.enqueue')}
          </button>
        </div>
      )}
    </div>
  )
}
