import { useCallback, useEffect, useRef, useState } from 'react'
import { commandMessage, engineApi, onEngineEvent, type EngineEventMsg, type FlowResult } from '../../services/engine'
import type { FlowScope } from '../../stores/ui'

/**
 * Los eventos que el Engine proyecta en una etapa (`FLOW_EVENT_TYPES` de
 * `engine_protocol/flow.py`). Se copian aquí uno a uno y no se resumen: si el
 * Engine proyecta un evento que esta lista no tiene, la vista se queda vieja
 * sin decirlo.
 */
export const FLOW_REFRESH_EVENTS: ReadonlySet<string> = new Set([
  'turn.started',
  'turn.completed',
  'turn.failed',
  'turn.cancelled',
  'turn.stopped',
  'model.started',
  'model.content.completed',
  'agent.started',
  'turn.changes.completed',
  'verification.completed',
  'approval.requested',
  'approval.resolved',
  'approval.expired',
  'question.requested',
  'question.resolved',
  'question.expired',
])

/**
 * Eventos que no cambian una etapa pero sí **qué sesiones son del alcance**.
 * Mover una sesión de proyecto cambia dos flujos y ninguno de los dos recibe
 * un evento de turno por ello.
 */
export const FLOW_MEMBERSHIP_EVENTS: ReadonlySet<string> = new Set(['session.moved'])

/**
 * Invalidación explícita del Engine. Restaurar un checkpoint reescribe hechos
 * que ya estaban proyectados sin producir ningún turno nuevo, así que sin este
 * evento la vista seguiría mostrando el flujo anterior.
 */
export const FLOW_INVALIDATED_EVENT = 'flow.invalidated'

export const FLOW_REFRESH_DEBOUNCE_MS = 500

export interface FlowState {
  data: FlowResult | null
  loading: boolean
  /**
   * Error del último intento. Con `data` presente **no** sustituye a los
   * datos: significa que lo que se ve es de antes (`stale`).
   */
  error: string | null
  /** Marca del último resultado bueno; es lo que fecha el aviso de desactualizado. */
  updatedAt: number | null
  /** Hay datos en pantalla y el último intento de refrescarlos falló. */
  stale: boolean
  refresh: () => Promise<void>
}

/** Trabajo pendiente del debounce. Se acumula; no se pisa. */
interface PendingWork {
  refresh: boolean
  resolve: boolean
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value ? value : null
}

/**
 * Flujo de un alcance (`flow.get`): carga al montar y al cambiar de alcance, y
 * se refresca cuando llega un evento del Engine que afecta a ese alcance, con
 * debounce y sin polling.
 *
 * La pertenencia se resuelve **contra el Engine** (`session_list` del
 * proyecto, cerradas y archivadas incluidas) y no a partir de las etapas ya
 * cargadas. Derivarla de las etapas tenía dos fallos con la misma raíz —que
 * una sesión sin turnos no aparece en ninguna etapa—: un proyecto vacío
 * aceptaba eventos de cualquier sesión del Engine, y una sesión nueva del
 * proyecto no entraba hasta un refresco manual. Un id desconocido no se
 * descarta ni se acepta: se vuelve a resolver la pertenencia una vez y se
 * recuerda la respuesta, así que una sesión ajena cuesta una consulta la
 * primera vez y ninguna después.
 */
export function useFlow(scope: FlowScope | null, options: { enabled?: boolean } = {}): FlowState {
  const { enabled = true } = options
  const [data, setData] = useState<FlowResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const scopeKey = scope ? `${scope.kind}:${scope.id}` : ''

  /** Identidad del alcance cargado: invalida todo lo que estuviera en vuelo. */
  const epoch = useRef(0)
  /** Orden de las consultas dentro de un alcance: solo la última manda. */
  const request = useRef(0)
  /** Última proyección aceptada; se compara por `revision`. */
  const current = useRef<FlowResult | null>(null)

  const members = useRef(new Set<string>())
  /** Ids ya comprobados que no son del alcance. */
  const outsiders = useRef(new Set<string>())
  /** Ids vistos en un evento cuya pertenencia todavía no se sabe. */
  const unknown = useRef(new Set<string>())

  const refresh = useCallback(async (): Promise<void> => {
    if (!scope || !enabled) return
    const mine = ++request.current
    const myEpoch = epoch.current
    setLoading(true)
    try {
      const result = await engineApi.flowGet(
        scope.kind === 'project' ? { project_id: scope.id } : { session_id: scope.id },
      )
      if (request.current !== mine || epoch.current !== myEpoch) return
      for (const stage of result.stages) {
        for (const row of stage.sessions) members.current.add(row.session_id)
      }
      if (scope.kind === 'session') members.current.add(scope.id)
      // La misma revisión es la misma proyección: se conserva el objeto para
      // no re-renderizar el canvas ni perder el detalle abierto por una
      // respuesta que no trae nada nuevo.
      if (current.current?.revision !== result.revision) {
        current.current = result
        setData(result)
      }
      setUpdatedAt(Date.now())
      setError(null)
    } catch (err) {
      if (request.current !== mine || epoch.current !== myEpoch) return
      // No se borra `data`: un fallo de refresco no convierte en falso lo que
      // ya se había leído. La vista lo rotula como desactualizado.
      setError(commandMessage(err))
    } finally {
      if (request.current === mine && epoch.current === myEpoch) setLoading(false)
    }
    // `scopeKey` es la identidad estable del alcance; el objeto puede cambiar de referencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, enabled])

  /**
   * Pertenencia según el Engine. Un fallo aquí no se presenta como error del
   * flujo —el flujo puede estar perfectamente— pero deja los ids sin resolver
   * para volver a intentarlo, en vez de darlos por ajenos.
   */
  const resolveMembers = useCallback(async (): Promise<void> => {
    if (!scope || !enabled) return
    const myEpoch = epoch.current
    if (scope.kind === 'session') {
      members.current.add(scope.id)
      return
    }
    try {
      const rows = await engineApi.sessions(undefined, true, scope.id)
      if (epoch.current !== myEpoch) return
      for (const row of rows.sessions) members.current.add(row.id)
      // La pertenencia acaba de re-resolverse: lo que antes era ajeno puede
      // haber entrado, así que la memoria de ajenos se vacía.
      outsiders.current = new Set()
    } catch {
      // Sin lista no se decide nada: los desconocidos siguen desconocidos.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, enabled])

  useEffect(() => {
    epoch.current += 1
    request.current += 1
    current.current = null
    members.current = new Set()
    outsiders.current = new Set()
    unknown.current = new Set()
    setData(null)
    setError(null)
    setUpdatedAt(null)
    if (!scope || !enabled) {
      setLoading(false)
      return
    }
    void refresh()
    void resolveMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, enabled])

  useEffect(() => {
    if (!scope || !enabled) return
    let disposed = false
    let unlisten: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const pending: PendingWork = { refresh: false, resolve: false }

    const schedule = (work: Partial<PendingWork>): void => {
      if (work.refresh) pending.refresh = true
      if (work.resolve) pending.resolve = true
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        if (disposed) return
        const job = { ...pending }
        pending.refresh = false
        pending.resolve = false
        void (async () => {
          let shouldRefresh = job.refresh
          if (job.resolve) {
            await resolveMembers()
            if (disposed) return
            for (const id of unknown.current) {
              if (members.current.has(id)) shouldRefresh = true
              else outsiders.current.add(id)
            }
            unknown.current.clear()
          }
          if (shouldRefresh && !disposed) await refresh()
        })()
      }, FLOW_REFRESH_DEBOUNCE_MS)
    }

    void onEngineEvent((event: EngineEventMsg) => {
      if (event.event === FLOW_INVALIDATED_EVENT) {
        // El aviso trae el alcance, no el flujo. Es nuestro si nombra este
        // proyecto o la raíz que el propio resultado declara.
        const project = payloadString(event.payload, 'project_id')
        const root = payloadString(event.payload, 'root')
        const mine =
          (scope.kind === 'project' && project === scope.id) ||
          (root !== null && root === current.current?.scope.root)
        if (mine) schedule({ refresh: true })
        return
      }
      const membership = FLOW_MEMBERSHIP_EVENTS.has(event.event)
      if (!membership && !FLOW_REFRESH_EVENTS.has(event.event)) return
      // Mover una sesión cambia la pertenencia de dos alcances y no se sabe
      // desde fuera cuál es cuál: se resuelve y se consulta.
      if (membership) {
        schedule({ resolve: true, refresh: true })
        return
      }
      const sessionId = payloadString(event.payload, 'session_id')
      // Sin sesión en el payload no se sabe a quién afecta: se consulta.
      if (!sessionId) {
        schedule({ refresh: true })
        return
      }
      if (members.current.has(sessionId)) {
        schedule({ refresh: true })
        return
      }
      if (outsiders.current.has(sessionId)) return
      unknown.current.add(sessionId)
      schedule({ resolve: true })
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })

    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      unlisten?.()
    }
  }, [scopeKey, enabled, refresh, resolveMembers, scope])

  return { data, loading, error, updatedAt, stale: error !== null && data !== null, refresh }
}
