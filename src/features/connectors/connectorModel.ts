import type { I18nKey } from '../../i18n'
import type { McpAuthStatus, McpCatalogEntry, McpConnection, McpServer, McpStatus } from '../../services/engine'

/**
 * Lo que la pantalla «Conectores» deduce de un servidor guardado. Solo lee lo
 * que el Engine informa: un estado que no llegó no se inventa, y «iniciar
 * sesión» no es «conectado».
 */

/** Las capacidades de conectores que esta versión de Rinari trae; sin ellas, la opción no se ofrece. */
export interface ConnectorCapabilities {
  remote: boolean
  oauth: boolean
  background: boolean
  tools: boolean
  catalog: boolean
}

export function connectorCapabilities(capabilities?: Record<string, boolean> | null): ConnectorCapabilities {
  const has = (name: string) => capabilities?.[name] === true
  return {
    remote: has('mcp_remote_v1'),
    oauth: has('mcp_oauth_v1'),
    background: has('mcp_background_connect_v1'),
    tools: has('mcp_tool_permissions_v1'),
    catalog: has('mcp_catalog_v1'),
  }
}

/** El estado que se dibuja: el de C2, más «falta iniciar sesión», que solo sale de OAuth. */
export type ConnectorState = 'connecting' | 'connected' | 'reauth' | 'signin' | 'error' | 'idle' | 'disabled'

export interface LiveStatus {
  status: McpStatus
  connection?: McpConnection
}

/** El estado vivo de `mcp.status.changed` gana al de la lista, que puede ser de hace un momento. */
export function withLive(server: McpServer, live?: LiveStatus): McpServer {
  if (!live) return server
  return { ...server, status: live.status, connection: live.connection ?? server.connection, connected: live.status === 'connected' }
}

export const isOAuth = (server: McpServer) => server.auth?.kind === 'oauth'
export const isRemote = (server: McpServer) => server.transport === 'http'

export function connectorState(server: McpServer, auth?: McpAuthStatus | null): ConnectorState {
  if (!server.enabled) return 'disabled'
  const hint = server.connection?.hint ?? null
  if (server.status === 'reauth_required' || auth?.reauth_required) return 'reauth'
  if (isOAuth(server) && auth && !auth.signed_in && server.status !== 'connecting') return 'signin'
  if (hint === 'oauth_required' && server.status === 'error') return 'signin'
  switch (server.status) {
    case 'connecting': return 'connecting'
    case 'connected': return 'connected'
    case 'error': return 'error'
    case 'disabled': return 'disabled'
    case 'idle': return 'idle'
    default:
      // Una versión de Rinari sin conexión en segundo plano solo dice si está conectado.
      return server.connected ? 'connected' : 'idle'
  }
}

export const STATE_TONE: Record<ConnectorState, 'success' | 'accent' | 'warning' | 'danger' | undefined> = {
  connected: 'success',
  connecting: 'accent',
  reauth: 'warning',
  signin: 'warning',
  error: 'danger',
  idle: undefined,
  disabled: undefined,
}

export const STATE_LABEL: Record<ConnectorState, I18nKey> = {
  connected: 'connectors.state.connected',
  connecting: 'connectors.state.connecting',
  reauth: 'connectors.state.reauth',
  signin: 'connectors.state.signin',
  error: 'connectors.state.error',
  idle: 'connectors.state.idle',
  disabled: 'connectors.state.disabled',
}

/** El botón principal de la tarjeta, según el caso. `null`: no hace falta ninguno. */
export type ConnectorAction = 'sign_in' | 'reconnect' | 'enable' | 'test' | null

export function primaryAction(state: ConnectorState, caps: ConnectorCapabilities, server: McpServer): ConnectorAction {
  switch (state) {
    case 'disabled': return 'enable'
    case 'signin':
    case 'reauth': return caps.oauth && isOAuth(server) ? 'sign_in' : caps.background ? 'reconnect' : 'test'
    case 'error':
    case 'idle': return caps.background ? 'reconnect' : 'test'
    default: return null
  }
}

/** «Desconectar»: cerrar la sesión de una cuenta OAuth; para el resto, desactivar. */
export function canSignOut(server: McpServer, auth?: McpAuthStatus | null): boolean {
  return isOAuth(server) && Boolean(auth?.signed_in || auth?.reauth_required)
}

/** La pista del Engine en lenguaje llano; las desconocidas, con un texto general. */
export function hintKey(hint: string | null | undefined, oauthSupported: boolean, known: (key: string) => boolean): I18nKey | null {
  if (!hint) return null
  if (hint === 'oauth_required') return oauthSupported ? 'connectors.hint.oauth_required' : 'mcp.hint.oauth_required'
  if (hint === 'reauth_required') return 'connectors.hint.reauth_required'
  const key = `mcp.hint.${hint}`
  return known(key) ? (key as I18nKey) : 'connectors.hint.unknown'
}

/** Iniciales para el logo cuando no hay icono: «Google Drive» → GD, «GitHub» → GH, «notion» → N. */
export function initials(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** El servidor guardado ↔ su entrada del catálogo, por los `servers` que el catálogo empareja. */
export function catalogByServer(entries: readonly McpCatalogEntry[]): Map<string, McpCatalogEntry> {
  const map = new Map<string, McpCatalogEntry>()
  for (const entry of entries) for (const server of entry.servers) map.set(`${server.scope}:${server.name}`, entry)
  return map
}

export const serverKey = (server: Pick<McpServer, 'name' | 'scope'>) => `${server.scope || 'global'}:${server.name}`

/** El nombre visible: el del catálogo si lo es («Gmail»), si no el que puso el dueño. */
export function displayName(server: McpServer, entry?: McpCatalogEntry | null): string {
  if (!entry) return server.name
  return server.name === entry.id ? entry.name : `${entry.name} · ${server.name}`
}

/** Orden de la lista: lo que pide algo al dueño primero, luego lo conectado, lo apagado al final. */
const ORDER: Record<ConnectorState, number> = { reauth: 0, signin: 1, error: 2, connecting: 3, connected: 4, idle: 5, disabled: 6 }
export function sortConnectors<T extends { state: ConnectorState; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name))
}

/** Un `host` legible de una URL, o la URL tal cual si no se puede leer. */
export function hostOf(url: string | null | undefined): string {
  if (!url) return ''
  try { return new URL(url).host } catch { return url }
}
