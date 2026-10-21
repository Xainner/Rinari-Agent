import { create } from 'zustand'
import { onEngineEvent, type EngineEventMsg, type McpAuthError, type McpConnection, type McpStatus } from '../../services/engine'
import type { LiveStatus } from './connectorModel'

/**
 * Lo que llega por eventos sobre los conectores: el estado vivo de cada
 * servidor (`mcp.status.changed`), el inicio de sesión en curso
 * (`mcp.auth.progress` / `mcp.auth.finished`) y un registro corto de lo que
 * pasó desde que se abrió la app. El registro no es el del Engine: es lo que
 * esta ventana vio, y la pantalla lo dice así.
 */

export type AuthStage = 'discovering' | 'registering' | 'waiting_for_browser' | 'exchanging_code'
export type AuthOutcome = 'signed_in' | 'failed' | 'cancelled' | 'timed_out'

export interface AuthFlow {
  flowId: string
  stage: AuthStage | null
  outcome: AuthOutcome | null
  error?: McpAuthError
}

export interface ConnectorLogEntry {
  at: string
  server: string
  kind: 'status' | 'auth'
  /** `status`: el estado nuevo; `auth`: la etapa o el resultado. */
  value: string
  hint?: string | null
  message?: string | null
}

const LOG_LIMIT = 40

interface ConnectorEvents {
  live: Record<string, LiveStatus>
  auth: Record<string, AuthFlow>
  log: ConnectorLogEntry[]
  /** Sube con cada evento que cambia algo: las vistas recargan lo que les falta. */
  tick: number
  apply: (event: EngineEventMsg) => void
  /** El inicio de sesión que esta ventana empezó (antes del primer evento). */
  startFlow: (server: string, flowId: string) => void
  clearFlow: (server: string) => void
  /** Olvida el estado vivo de un servidor quitado. */
  forget: (server: string) => void
  /** Deja solo el estado vivo de los servidores que siguen en la lista. */
  prune: (servers: readonly string[]) => void
}

const now = () => new Date().toISOString()
const str = (value: unknown) => (typeof value === 'string' ? value : null)

export const useConnectorEvents = create<ConnectorEvents>((set) => ({
  live: {},
  auth: {},
  log: [],
  tick: 0,
  apply: (event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>
    const name = str(payload.name)
    if (!name) return
    if (event.event === 'mcp.status.changed') {
      const status = str(payload.status) as McpStatus | null
      if (!status) return
      const connection = (payload.connection ?? undefined) as McpConnection | undefined
      set((state) => ({
        live: { ...state.live, [name]: { status, connection } },
        log: [{ at: str(connection?.changed_at) ?? now(), server: name, kind: 'status' as const, value: status, hint: connection?.hint ?? null, message: connection?.message ?? null }, ...state.log].slice(0, LOG_LIMIT),
        tick: state.tick + 1,
      }))
      return
    }
    if (event.event === 'mcp.auth.progress') {
      const flowId = str(payload.flow_id) ?? ''
      const stage = str(payload.stage) as AuthStage | null
      set((state) => ({
        auth: { ...state.auth, [name]: { flowId, stage, outcome: null } },
        log: [{ at: now(), server: name, kind: 'auth' as const, value: stage ?? 'progress' }, ...state.log].slice(0, LOG_LIMIT),
      }))
      return
    }
    if (event.event === 'mcp.auth.finished') {
      const flowId = str(payload.flow_id) ?? ''
      const outcome = str(payload.outcome) as AuthOutcome | null
      const error = (payload.error ?? undefined) as McpAuthError | undefined
      set((state) => ({
        auth: { ...state.auth, [name]: { flowId, stage: state.auth[name]?.stage ?? null, outcome, error } },
        log: [{ at: str(payload.finished_at) ?? now(), server: name, kind: 'auth' as const, value: outcome ?? 'finished', hint: error?.code ?? null }, ...state.log].slice(0, LOG_LIMIT),
        tick: state.tick + 1,
      }))
    }
  },
  // Un flujo rápido puede terminar antes de que vuelva `mcp.auth.start`: lo que ya llegó de ese flujo se conserva.
  startFlow: (server, flowId) => set((state) => (state.auth[server]?.flowId === flowId ? {} : { auth: { ...state.auth, [server]: { flowId, stage: null, outcome: null } } })),
  clearFlow: (server) => set((state) => {
    const next = { ...state.auth }
    delete next[server]
    return { auth: next }
  }),
  forget: (server) => set((state) => {
    if (!(server in state.live)) return {}
    const live = { ...state.live }
    delete live[server]
    return { live }
  }),
  prune: (servers) => set((state) => {
    const keep = new Set(servers)
    const gone = Object.keys(state.live).filter((name) => !keep.has(name))
    if (gone.length === 0) return {}
    return { live: Object.fromEntries(Object.entries(state.live).filter(([name]) => keep.has(name))) }
  }),
}))

let listening: Promise<unknown> | null = null

/** Una sola suscripción por ventana, desde el arranque: así el registro ve lo que pasa sin la pantalla abierta. */
export function listenConnectorEvents(): void {
  if (listening) return
  listening = onEngineEvent((event) => {
    if (event.event === 'mcp.status.changed' || event.event === 'mcp.auth.progress' || event.event === 'mcp.auth.finished') {
      useConnectorEvents.getState().apply(event)
    }
  }).catch(() => { listening = null })
}

/** Solo para pruebas. */
export function resetConnectorEvents(): void {
  useConnectorEvents.setState({ live: {}, auth: {}, log: [], tick: 0 })
}

/** Pide volver a mirar una carpeta (por ejemplo, justo después de confiar en ella). */
export const useProjectOffersCheck = create<{ root: string | null; nonce: number; check: (root: string) => void }>((set) => ({
  root: null,
  nonce: 0,
  check: (root) => set((state) => ({ root, nonce: state.nonce + 1 })),
}))
