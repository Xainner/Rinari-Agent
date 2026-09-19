import { useCallback, useEffect, useRef, useState } from 'react'
import { commandMessage, engineApi, onEngineEvent, type EngineEventMsg, type FlowResult } from '../../services/engine'
import type { FlowScope } from '../../stores/ui'

/** Eventos que pueden cambiar una etapa: turnos, cambios, verificaciones e intervenciones. */
export const FLOW_REFRESH_EVENTS: ReadonlySet<string> = new Set([
  'turn.started',
  'turn.completed',
  'turn.failed',
  'turn.cancelled',
  'turn.stopped',
  'turn.changes.completed',
  'verification.completed',
  'approval.requested',
  'approval.resolved',
  'approval.expired',
  'question.requested',
  'question.resolved',
  'question.expired',
])
export const FLOW_REFRESH_DEBOUNCE_MS = 500

export interface FlowState {
  data: FlowResult | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Flujo de un alcance (`flow.get`): carga al montar y al cambiar de alcance,
 * y se refresca solo cuando llega un evento del Engine de una sesión **de
 * ese alcance** (con debounce). Sin polling. Una respuesta tardía de un
 * alcance anterior se descarta por generación.
 */
export function useFlow(scope: FlowScope | null, options: { enabled?: boolean } = {}): FlowState {
  const { enabled = true } = options
  const [data, setData] = useState<FlowResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const scopeKey = scope ? `${scope.kind}:${scope.id}` : ''
  /** Sesiones del flujo cargado: filtro de eventos sin repetir la consulta. */
  const memberSessions = useRef(new Set<string>())

  const refresh = useCallback(async (): Promise<void> => {
    if (!scope || !enabled) return
    const current = ++generation.current
    setLoading(true)
    try {
      const result = await engineApi.flowGet(
        scope.kind === 'project' ? { project_id: scope.id } : { session_id: scope.id },
      )
      if (generation.current !== current) return
      memberSessions.current = new Set(result.stages.flatMap((stage) => stage.sessions.map((row) => row.session_id)))
      if (scope.kind === 'session') memberSessions.current.add(scope.id)
      setData(result)
      setError(null)
    } catch (err) {
      if (generation.current !== current) return
      setError(commandMessage(err))
    } finally {
      if (generation.current === current) setLoading(false)
    }
    // `scopeKey` es la identidad estable del alcance; el objeto puede cambiar de referencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, enabled])

  useEffect(() => {
    generation.current += 1
    memberSessions.current = new Set()
    setData(null)
    setError(null)
    if (!scope || !enabled) {
      setLoading(false)
      return
    }
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, enabled])

  useEffect(() => {
    if (!scope || !enabled) return
    let disposed = false
    let unlisten: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    void onEngineEvent((event: EngineEventMsg) => {
      if (!FLOW_REFRESH_EVENTS.has(event.event)) return
      const sessionId = typeof event.payload.session_id === 'string' ? event.payload.session_id : null
      // Sin sesión en el payload no se sabe a quién afecta: se consulta. Con una
      // sesión ajena al alcance, no. Un proyecto sin turnos aún (sin miembros)
      // acepta cualquier sesión: el primer turno es el que crea el flujo.
      if (sessionId && memberSessions.current.size > 0 && !memberSessions.current.has(sessionId)) return
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        if (!disposed) void refresh()
      }, FLOW_REFRESH_DEBOUNCE_MS)
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      unlisten?.()
    }
  }, [scopeKey, enabled, refresh, scope])

  return { data, loading, error, refresh }
}
