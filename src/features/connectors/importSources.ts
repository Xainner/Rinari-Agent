import type { McpImportSource } from '../../services/engine'

export type SourceRow =
  | { kind: 'place'; source: McpImportSource }
  | { kind: 'missing'; source: string; label: string; paths: string[] }

/**
 * The places a scan looked at, as the owner reads them: every place where the
 * app was found (with which install or file it is), and for an app found
 * nowhere a single «not found» line instead of one per place it might live.
 */
export function sourceRows(sources: readonly McpImportSource[]): SourceRow[] {
  const rows: SourceRow[] = []
  const missing = new Map<string, { label: string; paths: string[] }>()
  const foundSomewhere = new Set(sources.filter((item) => item.found).map((item) => item.source))
  for (const item of sources) {
    if (item.found) {
      rows.push({ kind: 'place', source: item })
      continue
    }
    if (foundSomewhere.has(item.source)) continue
    const entry = missing.get(item.source)
    if (entry) entry.paths.push(item.path)
    else {
      const row = { label: item.label ?? item.source, paths: [item.path] }
      missing.set(item.source, row)
      rows.push({ kind: 'missing', source: item.source, ...row })
    }
  }
  return rows
}
