/**
 * Archivos con un Engine de servidor.
 *
 * - Ver, abrir, mostrar en carpeta, copiar o guardar un archivo: el Gateway
 *   sirve solo lo que su Engine autoriza (`artifact.resolve` /
 *   `workspace.file.resolve`). Se descarga a una caché de este equipo y desde
 *   ahí se abre como un archivo local.
 * - Adjuntar desde este equipo: el archivo se sube al Gateway y el Engine
 *   recibe la ruta del servidor, que importa a su propio almacén.
 */

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface RemoteServer {
  id: string
  server: string
  token: string
}

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'binary'

export interface DownloadedFile {
  path: string
  name: string
  size: number
  kind: FileKind
  mime: string
}

export class RemoteFileError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RemoteFileError'
  }
}

export interface RemoteFilesDeps {
  cacheDir: string
  fetch: typeof fetch
}

const UPLOAD_LIMIT_MS = 30 * 60_000

export function kindOf(mime: string, name: string): FileKind {
  const type = mime.split(';')[0].trim().toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (type.startsWith('text/') || type === 'application/json') return 'text'
  return 'binary'
}

/** El nombre de `Content-Disposition` (RFC 6266, con `filename*` UTF-8). */
export function dispositionName(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* cae al nombre simple */
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/.exec(header)
  return plain ? (plain[1] ?? plain[2]).trim() : null
}

function safeName(name: string): string {
  const cleaned = basename(name.replace(/\\/g, '/')).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/^[ .]+|[ .]+$/g, '')
  return cleaned.slice(0, 120) || 'archivo'
}

async function failure(response: Response): Promise<RemoteFileError> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
  const code = body?.error?.code ?? `HTTP_${response.status}`
  return new RemoteFileError(code, body?.error?.message ?? response.statusText)
}

export function createRemoteFiles(deps: RemoteFilesDeps) {
  /** Subidas ya hechas en esta ejecución: la misma ruta, tamaño y fecha no se sube dos veces. */
  const uploaded = new Map<string, { path: string; at: number }>()

  async function download(
    remote: RemoteServer,
    request: { session_id: string; path: string; turn_id?: string },
  ): Promise<DownloadedFile> {
    const url = new URL(
      request.path.startsWith('artifact://') ? '/remote/v1/files/artifact' : '/remote/v1/files/workspace',
      remote.server,
    )
    if (request.path.startsWith('artifact://')) {
      url.searchParams.set('uri', request.path)
    } else {
      url.searchParams.set('session_id', request.session_id)
      url.searchParams.set('path', request.path)
      if (request.turn_id) url.searchParams.set('turn_id', request.turn_id)
    }
    const response = await deps.fetch(url, {
      headers: { authorization: `Bearer ${remote.token}` },
      redirect: 'error',
    })
    if (!response.ok || !response.body) throw await failure(response)
    const mime = response.headers.get('content-type') ?? 'application/octet-stream'
    const fallback = request.path.startsWith('artifact://') ? request.path.slice('artifact://'.length) : request.path
    const name = safeName(dispositionName(response.headers.get('content-disposition')) ?? fallback)
    const key = createHash('sha256').update(`${remote.id}\n${url.toString()}`).digest('hex').slice(0, 24)
    const folder = join(deps.cacheDir, key)
    await mkdir(folder, { recursive: true })
    const target = join(folder, name)
    const partial = `${target}.part`
    try {
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial))
      await rename(partial, target)
    } catch (reason) {
      await rm(partial, { force: true })
      throw reason
    }
    const size = (await stat(target)).size
    return { path: target, name, size, kind: kindOf(mime, name), mime: mime.split(';')[0].trim() }
  }

  /** Sube un archivo de este equipo y devuelve su ruta en el servidor. */
  async function upload(remote: RemoteServer, localPath: string): Promise<string> {
    const info = await stat(localPath)
    if (info.isDirectory()) {
      throw new RemoteFileError(
        'REMOTE_LOCAL_FOLDER',
        'Folders on this computer do not reach the server: use a folder of the server',
      )
    }
    const key = `${remote.id}\n${localPath}\n${info.size}\n${info.mtimeMs}`
    const known = uploaded.get(key)
    // El Gateway borra las subidas a las 24 h; aquí se reutilizan solo un rato.
    if (known && Date.now() - known.at < UPLOAD_LIMIT_MS) return known.path
    const url = new URL('/remote/v1/uploads', remote.server)
    url.searchParams.set('name', basename(localPath))
    const response = await deps.fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${remote.token}`,
        'content-type': 'application/octet-stream',
      },
      body: Readable.toWeb(createReadStream(localPath)) as unknown as RequestInit['body'],
      duplex: 'half',
      redirect: 'error',
    } as RequestInit)
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as { path?: unknown }
    if (typeof body.path !== 'string' || !body.path) throw new RemoteFileError('BAD_RESPONSE', 'The server did not return a path')
    uploaded.set(key, { path: body.path, at: Date.now() })
    return body.path
  }

  return { download, upload }
}

export type RemoteFiles = ReturnType<typeof createRemoteFiles>

/** Solo rutas absolutas que existen aquí: una relativa es del espacio de trabajo del servidor. */
async function localFile(path: unknown): Promise<string | null> {
  if (typeof path !== 'string' || !path || !isAbsolute(path)) return null
  try {
    const info = await stat(path)
    return info.isFile() || info.isDirectory() ? path : null
  } catch {
    return null
  }
}

/**
 * Con un Engine de servidor, las rutas de este equipo que lleva una petición
 * (adjuntos, almas a importar, la fuente de una skill) se suben antes y se
 * sustituyen por las del servidor. Una ruta que no existe aquí ya es del
 * servidor y no se toca.
 */
export async function uploadLocalPaths(
  method: string,
  params: Record<string, unknown>,
  upload: (path: string) => Promise<string>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...params }
  if (Array.isArray(params.attachments)) {
    out.attachments = await Promise.all(
      params.attachments.map(async (item) => {
        if (!item || typeof item !== 'object') return item
        const record = item as Record<string, unknown>
        const local = await localFile(record.path)
        return local ? { ...record, path: await upload(local) } : record
      }),
    )
  }
  if (method === 'soul.import' && Array.isArray(params.paths)) {
    out.paths = await Promise.all(
      params.paths.map(async (path) => {
        const local = await localFile(path)
        return local ? upload(local) : path
      }),
    )
  }
  if (method === 'skill.job.start') {
    const source = await localFile(params.source)
    if (source) out.source = await upload(source)
  }
  return out
}
