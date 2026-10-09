/**
 * Paquete de «Exportar diagnóstico»: un resumen, los registros y los volcados
 * de fallo, en un ZIP que la persona guarda y adjunta si quiere.
 *
 * El resumen es lo que el Engine devuelve en `engine.diagnostics` (tamaños,
 * estado, fallos recientes, nunca contenido) más lo del host: versiones,
 * sistema y los cambios de estado del Engine. Nada sale del equipo desde aquí.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createZip, type ZipEntry } from './zip'

/** Los volcados recientes bastan; uno viejo describe otra versión. */
const MAX_DUMPS = 5
const MAX_DUMP_BYTES = 20 * 1024 * 1024

export interface BundleSources {
  appVersion: string
  versions: Record<string, string | undefined>
  os: { platform: string; release: string; arch: string }
  engineStatus: () => unknown
  /** `engine.diagnostics`; un Engine caído o antiguo deja su error en el resumen. */
  engineDiagnostics: () => Promise<unknown>
  engineStates: () => unknown[]
  logFiles: () => string[]
  crashDir: string | null
  now?: () => Date
}

export interface BundleFile {
  name: string
  /** `null` para el resumen: se genera al guardar. */
  bytes: number | null
}

export interface BundlePreview {
  files: BundleFile[]
  totalBytes: number
}

async function sizeOf(path: string): Promise<number | null> {
  return stat(path).then((info) => (info.isFile() ? info.size : null), () => null)
}

async function dumps(dir: string | null): Promise<Array<{ path: string; bytes: number; mtime: number }>> {
  if (!dir) return []
  const found: Array<{ path: string; bytes: number; mtime: number }> = []
  async function walk(current: string, depth: number): Promise<void> {
    const items = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const item of items) {
      const path = join(current, item.name)
      if (item.isDirectory() && depth < 3) await walk(path, depth + 1)
      else if (item.isFile() && item.name.toLowerCase().endsWith('.dmp')) {
        const info = await stat(path).catch(() => null)
        if (info) found.push({ path, bytes: info.size, mtime: info.mtimeMs })
      }
    }
  }
  await walk(dir, 0)
  found.sort((a, b) => b.mtime - a.mtime)
  const kept: typeof found = []
  let total = 0
  for (const dump of found) {
    if (kept.length >= MAX_DUMPS || total + dump.bytes > MAX_DUMP_BYTES) continue
    kept.push(dump)
    total += dump.bytes
  }
  return kept
}

async function logs(sources: BundleSources): Promise<Array<{ path: string; bytes: number }>> {
  const present: Array<{ path: string; bytes: number }> = []
  for (const path of sources.logFiles()) {
    const bytes = await sizeOf(path)
    if (bytes !== null) present.push({ path, bytes })
  }
  return present
}

export async function previewBundle(sources: BundleSources): Promise<BundlePreview> {
  const files: BundleFile[] = [{ name: 'summary.json', bytes: null }]
  for (const log of await logs(sources)) files.push({ name: `logs/${basename(log.path)}`, bytes: log.bytes })
  for (const dump of await dumps(sources.crashDir)) files.push({ name: `crashes/${basename(dump.path)}`, bytes: dump.bytes })
  return { files, totalBytes: files.reduce((sum, file) => sum + (file.bytes ?? 0), 0) }
}

export async function summary(sources: BundleSources): Promise<Record<string, unknown>> {
  let engine: unknown
  try {
    engine = await sources.engineDiagnostics()
  } catch (error) {
    engine = { error: error instanceof Error ? error.message : String(error) }
  }
  return {
    generated_at: (sources.now?.() ?? new Date()).toISOString(),
    app: { version: sources.appVersion, ...sources.versions },
    os: sources.os,
    engine_status: sources.engineStatus(),
    engine_states: sources.engineStates(),
    engine,
  }
}

export async function buildBundle(sources: BundleSources): Promise<Buffer> {
  const entries: ZipEntry[] = [{ name: 'summary.json', data: `${JSON.stringify(await summary(sources), null, 2)}\n` }]
  for (const log of await logs(sources)) {
    const data = await readFile(log.path).catch(() => null)
    if (data) entries.push({ name: `logs/${basename(log.path)}`, data })
  }
  for (const dump of await dumps(sources.crashDir)) {
    const data = await readFile(dump.path).catch(() => null)
    if (data) entries.push({ name: `crashes/${basename(dump.path)}`, data })
  }
  return createZip(entries)
}
