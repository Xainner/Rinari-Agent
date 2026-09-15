import { useCallback, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { desktopApi, type QuestionRequest } from '../../services/desktop'
import { commandMessage, onEngineEvent } from '../../services/engine'

/**
 * Controlador central de preguntas pendientes por sesión.
 *
 * Una sola suscripción y una sola carga por sesión, compartidas por todos los
 * consumidores (tarjetas de preguntas, badge del header de un panel, tira
 * colapsada). Se activa con el primer suscriptor y se libera con el último.
 */
interface Entry {
  sessionId: string
  requests: QuestionRequest[]
  listeners: Set<() => void>
  generation: number
  disposed: boolean
  stop: (() => void) | null
}

const EMPTY: QuestionRequest[] = Object.freeze([]) as unknown as QuestionRequest[]
const entries = new Map<string, Entry>()

function emit(entry: Entry) {
  for (const listener of [...entry.listeners]) listener()
}

function refresh(entry: Entry) {
  const current = ++entry.generation
  void desktopApi
    .questions(entry.sessionId)
    .then((result) => {
      if (entry.disposed || current !== entry.generation) return
      const pending = result.questions.filter((item) => item.session_id === entry.sessionId && item.status === 'pending')
      entry.requests = pending.length === 0 ? EMPTY : pending
      emit(entry)
    })
    .catch((error) => {
      if (!entry.disposed) toast.error(commandMessage(error))
    })
}

function start(sessionId: string): Entry {
  const entry: Entry = { sessionId, requests: EMPTY, listeners: new Set(), generation: 0, disposed: false, stop: null }
  entries.set(sessionId, entry)
  void onEngineEvent((event) => {
    if (entry.disposed) return
    if (
      event.payload.session_id === sessionId &&
      (event.event.startsWith('question.') ||
        ['turn.completed', 'turn.failed', 'turn.cancelled', 'turn.stopped'].includes(event.event))
    ) {
      refresh(entry)
    }
  }).then((stop) => {
    if (entry.disposed) stop()
    else entry.stop = stop
  })
  refresh(entry)
  return entry
}

function subscribe(sessionId: string, listener: () => void): () => void {
  if (!sessionId) return () => {}
  const entry = entries.get(sessionId) ?? start(sessionId)
  entry.listeners.add(listener)
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size > 0) return
    // Liberación diferida: un remount inmediato (StrictMode, cambio de
    // identidad del suscriptor) reutiliza la entrada sin recargar.
    queueMicrotask(() => {
      if (entry.listeners.size > 0 || entries.get(sessionId) !== entry) return
      entry.disposed = true
      entry.stop?.()
      entries.delete(sessionId)
    })
  }
}

/** Preguntas pendientes de una sesión (referencia estable entre renders). */
export function usePendingQuestions(sessionId: string): QuestionRequest[] {
  // Identidad estable por sesión: React solo se resuscribe al cambiar de sesión.
  const subscribeToSession = useCallback((listener: () => void) => subscribe(sessionId, listener), [sessionId])
  const getSnapshot = useCallback(() => entries.get(sessionId)?.requests ?? EMPTY, [sessionId])
  return useSyncExternalStore(subscribeToSession, getSnapshot, () => EMPTY)
}

/** Vuelve a consultar solo esa sesión (tras resolver/omitir una pregunta). */
export function refreshPendingQuestions(sessionId: string): void {
  const entry = entries.get(sessionId)
  if (entry) refresh(entry)
}

/** Para pruebas: descarta el estado compartido. */
export function resetPendingQuestionsForTests(): void {
  for (const entry of entries.values()) {
    entry.disposed = true
    entry.stop?.()
  }
  entries.clear()
}
