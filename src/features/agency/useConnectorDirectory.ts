import { useEffect, useState } from 'react'
import { engineApi, type McpCatalogEntry, type McpServer } from '../../services/engine'
import { catalogByServer, displayName, isRemote, serverKey } from '../connectors/connectorModel'

/** Un conector tal como lo muestran la Agency y sus fichas: su nombre visible y su logo. */
export interface ConnectorMark {
  name: string
  label: string
  logo: string | null
  tone: McpCatalogEntry['category'] | 'remote' | 'local'
  enabled: boolean
}

async function load(): Promise<ConnectorMark[]> {
  const [{ servers }, catalog] = await Promise.all([
    engineApi.mcpList(),
    // Sin catálogo (una versión sin `mcp_catalog_v1`), cada conector lleva su nombre y el ícono genérico.
    engineApi.mcpCatalogList().then((result) => result.entries).catch(() => [] as McpCatalogEntry[]),
  ])
  const byServer = catalogByServer(catalog)
  return servers.map((server: McpServer) => {
    const entry = byServer.get(serverKey(server)) ?? null
    return {
      name: server.name,
      label: displayName(server, entry),
      logo: entry?.logo ?? null,
      tone: entry?.category ?? (isRemote(server) ? 'remote' : 'local'),
      enabled: server.enabled,
    }
  })
}

/**
 * Los conectores del dueño con su logo, leídos una vez por pantalla (se
 * vuelven a pedir al montar otra). Mientras llegan, la lista está vacía.
 */
export function useConnectorDirectory(): { marks: ConnectorMark[]; byName: Map<string, ConnectorMark>; loaded: boolean } {
  const [marks, setMarks] = useState<ConnectorMark[] | null>(null)
  useEffect(() => {
    let alive = true
    load().then((value) => { if (alive) setMarks(value) }).catch(() => { if (alive) setMarks([]) })
    return () => { alive = false }
  }, [])
  const list = marks ?? []
  return { marks: list, byName: new Map(list.map((mark) => [mark.name, mark])), loaded: marks !== null }
}
