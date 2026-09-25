import { useCallback, useEffect, useState } from 'react'
import { MessageSquareShare, PauseCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { commandMessage, engineApi, onEngineEvent, type QueuedPromptEntry } from '../../services/engine'
import { useI18n } from '../../i18n'
import { usePeerNavigation } from '../../features/board/PeerNavigationContext'

/**
 * Cola de prompts de la sesión: visible mientras un turno corre o hay
 * entradas pendientes. Encolar preserva turnos y aprobaciones (lo impone el
 * engine). Con `session_peer_messaging_v1` las entradas llegan tipadas
 * (`entries`): mensajes de otros paneles, pausas tras Stop y su reanudación.
 */
export default function QueueBar({
  sessionId,
  refreshKey,
  peerMessaging = false,
  showInput = true,
}: {
  sessionId: string | null
  refreshKey: boolean
  /** El Engine anuncia `session_peer_messaging_v1`: se escuchan sus eventos. */
  peerMessaging?: boolean
  /** Con guiado del turno, el compositor ya encola (Tab): sin campo propio. */
  showInput?: boolean
}) {
  const { t } = useI18n()
  const navigation = usePeerNavigation()
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
      if (
        peerMessaging &&
        (event.event === 'session.peer.message' || event.event === 'session.peer.message.updated') &&
        event.payload.to_session_id === sessionId
      ) void reload()
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [sessionId, peerMessaging, reload])

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

  async function resume() {
    if (!sessionId) return
    try {
      await engineApi.queueResume(sessionId)
      await reload()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function cancelEntry(messageId: string) {
    try {
      await engineApi.peerMessageCancel(messageId)
      await reload()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  if (!sessionId || ((!refreshKey || !showInput) && entries.length === 0)) return null
  const paused = entries.some((entry) => entry.state === 'paused')

  function originLabel(entry: QueuedPromptEntry): string {
    if (entry.origin.kind === 'peer') {
      const source = entry.origin.source_session_id ?? null
      const label = (source && navigation?.labelFor(source)) || entry.origin.source_label || t('board.peers.unknown')
      return t('queue.entryPeer', { label })
    }
    return t('queue.entryUser')
  }

  return (
    <div className="queue-bar px-4 pb-1" data-testid="queue-bar">
      {entries.length > 0 && (
        <div className="mx-auto mb-1 w-full max-w-2xl space-y-1">
          {entries.map((entry, i) => (
            <div
              key={entry.message_id ?? `manual-${i}`}
              data-state={entry.state}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
            >
              <span className="font-mono text-[var(--accent-2)]">{i + 1}.</span>
              {entry.origin.kind === 'peer' && <MessageSquareShare size={12} aria-hidden="true" className="shrink-0 text-[var(--accent-2)]" />}
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">{originLabel(entry)}</span>
              <span className="min-w-0 flex-1 truncate" title={entry.message}>{entry.message}</span>
              {entry.state === 'paused' && (
                <span className="inline-flex shrink-0 items-center gap-1 text-[var(--warning)]" title={entry.error ?? undefined}>
                  <PauseCircle size={12} aria-hidden="true" />{t('queue.paused')}
                </span>
              )}
              {entry.state === 'uncertain' && (
                <span className="shrink-0 text-[var(--warning)]" title={entry.error ?? undefined}>{t('queue.uncertain')}</span>
              )}
              {entry.message_id && (
                <button
                  type="button"
                  aria-label={t('queue.cancelEntry')}
                  title={t('queue.cancelEntry')}
                  onClick={() => void cancelEntry(entry.message_id as string)}
                  className="shrink-0 rounded p-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void clear()}
              className="text-[11px] text-[var(--text-subtle)] hover:text-[var(--text)]"
            >
              {t('queue.clear')}
            </button>
            {paused && (
              <button
                type="button"
                onClick={() => void resume()}
                className="text-[11px] font-semibold text-[var(--accent-2)] hover:underline"
              >
                {t('queue.resume')}
              </button>
            )}
          </div>
        </div>
      )}
      {refreshKey && showInput && (
        <div className="mx-auto flex w-full max-w-2xl gap-2">
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
