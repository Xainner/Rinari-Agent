import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commandMessage, engineApi, type McpAuthStatus, type McpCatalogEntry, type McpServer } from '../../services/engine'
import {
  catalogByServer,
  connectorState,
  displayName,
  serverKey,
  sortConnectors,
  withLive,
  type ConnectorCapabilities,
  type ConnectorState,
} from './connectorModel'
import { listenConnectorEvents, useConnectorEvents } from './connectorStore'

export interface ConnectorItem {
  key: string
  server: McpServer
  entry: McpCatalogEntry | null
  auth: McpAuthStatus | null
  state: ConnectorState
  name: string
}

/**
 * Los conectores guardados con su estado real: la lista del Engine, el
 * estado vivo de los eventos encima, la entrada del catálogo que los
 * describe y, para los de OAuth, si hay sesión iniciada.
 */
export function useConnectors(caps: ConnectorCapabilities) {
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([])
  const [auth, setAuth] = useState<Record<string, McpAuthStatus>>({})
  const [error, setError] = useState<string | null>(null)
  const live = useConnectorEvents((state) => state.live)
  const tick = useConnectorEvents((state) => state.tick)
  const capsRef = useRef(caps)
  capsRef.current = caps
  const running = useRef<Promise<void> | null>(null)
  const queued = useRef<Promise<void> | null>(null)

  const load = useCallback(async () => {
    const { catalog: withCatalog, oauth: withOAuth } = capsRef.current
    try {
      const [list, entries] = await Promise.all([
        engineApi.mcpList(),
        withCatalog ? engineApi.mcpCatalogList().then((result) => result.entries).catch(() => [] as McpCatalogEntry[]) : Promise.resolve([] as McpCatalogEntry[]),
      ])
      setServers(list.servers)
      setCatalog(entries)
      setError(null)
      if (withOAuth) {
        const oauth = list.servers.filter((server) => server.auth?.kind === 'oauth')
        const statuses = await Promise.all(oauth.map((server) => engineApi.mcpAuthStatus(server.name).catch(() => null)))
        setAuth(Object.fromEntries(statuses.filter((status): status is McpAuthStatus => status !== null).map((status) => [status.name, status])))
      }
    } catch (err) {
      setError(commandMessage(err))
      setServers((current) => current ?? [])
    }
  }, [])

  // Una recarga pedida durante otra no se pierde: se hace una más al terminar,
  // con las capacidades de ese momento, y quien la pidió espera esa.
  const reload = useCallback((): Promise<void> => {
    if (running.current) {
      queued.current ??= running.current.then(() => { queued.current = null; return reload() })
      return queued.current
    }
    const current = load().finally(() => { running.current = null })
    running.current = current
    return current
  }, [load])

  useEffect(() => { listenConnectorEvents() }, [])
  useEffect(() => { void reload() }, [reload, caps.catalog, caps.oauth])
  // Un evento que cambia algo (otro estado, una sesión iniciada): la lista y las sesiones se releen.
  useEffect(() => {
    if (tick === 0) return
    const timer = window.setTimeout(() => { void reload() }, 200)
    return () => window.clearTimeout(timer)
  }, [tick, reload])

  const items = useMemo<ConnectorItem[]>(() => {
    if (!servers) return []
    const byServer = catalogByServer(catalog)
    return sortConnectors(servers.map((raw) => {
      const server = withLive(raw, live[raw.name])
      const entry = byServer.get(serverKey(server)) ?? null
      const status = auth[server.name] ?? null
      return { key: serverKey(server), server, entry, auth: status, state: connectorState(server, status), name: displayName(server, entry) }
    }))
  }, [servers, catalog, auth, live])

  return { items, servers, catalog, error, loaded: servers !== null, reload }
}
