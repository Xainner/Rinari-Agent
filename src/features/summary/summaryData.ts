import { useEffect, useState } from 'react'
import { engineApi, onEngineEvent } from '../../services/engine'
import type { RepoStatus } from '../../types/protocol.generated'

/** Lo que el Engine junta de la conversación (#82), leído con cuidado: el contrato es abierto. */
export interface SummaryData {
  pages: Array<{ url: string; title: string }>
  searches: Array<{ query: string }>
  mcp: Array<{ connector: string; calls: number }>
  sourcesTotal: number
  results: Array<{ path: string; name: string; kind: string; exists: boolean }>
  /** `status`: el estado de la conexión (C2), si esta versión de Rinari lo informa. */
  mcpServers: Array<{ name: string; connected: boolean; status: string | null }>
  skills: Array<{ name: string }>
  processes: Array<{ id: string; command: string }>
  scheduled: Array<{ id: string; name: string; enabled: boolean }>
}

const list = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : []
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {})
const str = (value: unknown) => (typeof value === 'string' ? value : '')

export function readSummary(raw: unknown): SummaryData {
  const root = obj(raw)
  const sources = obj(root.sources)
  const connectors = obj(root.connectors)
  const background = obj(root.background)
  const pages = list(sources.pages).map((page) => ({ url: str(page.url), title: str(page.title) })).filter((page) => page.url)
  const searches = list(sources.searches).map((search) => ({ query: str(search.query) })).filter((search) => search.query)
  const mcp = list(sources.mcp).map((entry) => ({ connector: str(entry.connector), calls: typeof entry.calls === 'number' ? entry.calls : 0 })).filter((entry) => entry.connector)
  return {
    pages,
    searches,
    mcp,
    sourcesTotal: typeof sources.total === 'number' ? sources.total : pages.length + searches.length + mcp.length,
    results: list(root.results).map((item) => ({ path: str(item.path), name: str(item.name) || str(item.path), kind: str(item.kind) || 'file', exists: item.exists !== false })).filter((item) => item.path),
    mcpServers: list(connectors.mcp).map((server) => ({ name: str(server.name), connected: server.connected === true, status: str(server.status) || null })).filter((server) => server.name),
    skills: list(connectors.skills).map((skill) => ({ name: str(skill.name) })).filter((skill) => skill.name),
    processes: list(background.processes).map((process) => ({ id: str(process.id), command: str(process.command) })).filter((process) => process.id),
    scheduled: list(background.scheduled).map((task) => ({ id: str(task.id), name: str(task.name), enabled: task.enabled !== false })).filter((task) => task.id),
  }
}

/** El resumen de la conversación, que se vuelve a leer con `session.summary.changed`. */
export function useConversationSummary(sessionId: string, enabled: boolean): SummaryData | null {
  const [data, setData] = useState<SummaryData | null>(null)
  useEffect(() => {
    setData(null)
    if (!enabled || !sessionId) return
    let alive = true
    const load = () => { engineApi.sessionSummary(sessionId).then((raw) => { if (alive) setData(readSummary(raw)) }).catch(() => { if (alive) setData(null) }) }
    load()
    let stop: (() => void) | undefined
    void onEngineEvent((event) => {
      if (event.event === 'session.summary.changed' && event.payload?.session_id === sessionId) load()
    }).then((unsubscribe) => { if (alive) stop = unsubscribe; else unsubscribe() })
    return () => { alive = false; stop?.() }
  }, [sessionId, enabled])
  return data
}

/** El estado del repo: git al momento; GitHub (gh, PR, checks) llega después por `repo.status.updated`. */
export function useRepoStatus(sessionId: string, enabled: boolean): { status: RepoStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    setStatus(null)
    if (!enabled || !sessionId) return
    let alive = true
    engineApi.repoStatus(sessionId, tick > 0).then((next) => { if (alive) setStatus(next) }).catch(() => { if (alive) setStatus(null) })
    let stop: (() => void) | undefined
    void onEngineEvent((event) => {
      if (event.event === 'repo.status.updated' && event.payload?.session_id === sessionId) setStatus(event.payload as RepoStatus)
    }).then((unsubscribe) => { if (alive) stop = unsubscribe; else unsubscribe() })
    return () => { alive = false; stop?.() }
  }, [sessionId, enabled, tick])
  return { status, refresh: () => setTick((value) => value + 1) }
}

/** La página de GitHub para abrir un PR de la rama, cuando no hay gh con sesión. */
export function compareUrl(status: RepoStatus): string | null {
  const github = obj(status.github)
  const owner = str(github.owner)
  const repo = str(github.repo)
  if (!owner || !repo || !status.branch) return null
  return `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(status.branch)}?expand=1`
}
