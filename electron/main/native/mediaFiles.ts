/**
 * Imágenes, video y audio del workspace dentro de la app.
 *
 * El renderer nunca nombra una ruta que el host vaya a leer: pide un archivo
 * por sesión/turno, el Engine lo autoriza (`workspace.file.resolve`) y main
 * guarda esa ruta aprobada tras un token aleatorio. La UI recibe
 * `app://rinari/__media/<token>`, del mismo origen que ya admite la CSP, y el
 * reproductor pide los bytes por tramos (`Range`): un video de 33 MiB no viaja
 * entero ni pasa por el NDJSON del Engine.
 */

import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

export const MEDIA_PREFIX = '/__media/'

/** Lo que sabe main de un archivo aprobado. */
export interface MediaGrant {
  path: string
  mime: string
}

export interface MediaRegistry {
  /** Registra una ruta aprobada por el Engine y devuelve su URL de la app. */
  grant(entry: MediaGrant): string
  /** La entrada de un token vigente, o `null`. */
  lookup(token: string): MediaGrant | null
}

export function createMediaRegistry({
  origin,
  ttlMs = 6 * 60 * 60 * 1000,
  max = 256,
  now = () => Date.now(),
  token = () => randomBytes(24).toString('hex'),
}: {
  origin: string
  ttlMs?: number
  max?: number
  now?: () => number
  token?: () => string
}): MediaRegistry {
  const grants = new Map<string, MediaGrant & { expires: number }>()
  function prune(): void {
    const at = now()
    for (const [key, entry] of grants) if (entry.expires <= at) grants.delete(key)
    // Lo más antiguo sale primero (orden de inserción del Map).
    while (grants.size > max) grants.delete(grants.keys().next().value as string)
  }
  return {
    grant(entry) {
      prune()
      const key = token()
      grants.set(key, { ...entry, expires: now() + ttlMs })
      return `${origin}${MEDIA_PREFIX}${key}`
    },
    lookup(key) {
      const entry = grants.get(key)
      if (!entry) return null
      if (entry.expires <= now()) {
        grants.delete(key)
        return null
      }
      return { path: entry.path, mime: entry.mime }
    },
  }
}

/** Token de una URL `…/__media/<token>`, o `null` si no es de medios. */
export function mediaToken(url: string): string | null {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  if (!pathname.startsWith(MEDIA_PREFIX)) return null
  const key = pathname.slice(MEDIA_PREFIX.length)
  return /^[a-f0-9]{16,128}$/.test(key) ? key : null
}

/** `bytes=a-b` contra un archivo de `size` bytes; `null` si no se puede servir. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid'
  let start: number
  let end: number
  if (match[1] === '') {
    // Sufijo: los últimos N bytes.
    const length = Number(match[2])
    if (length === 0) return 'invalid'
    start = Math.max(0, size - length)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

/** Respuesta para una petición a un archivo aprobado, con soporte de tramos. */
export async function serveMedia(request: Request, grant: MediaGrant): Promise<Response> {
  let size: number
  try {
    const info = await stat(grant.path)
    if (!info.isFile()) return new Response('Not found', { status: 404 })
    size = info.size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const headers: Record<string, string> = {
    'Content-Type': grant.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  const range = parseRange(request.headers.get('range'), size)
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
  }
  const start = range?.start ?? 0
  const end = range?.end ?? size - 1
  const length = size === 0 ? 0 : end - start + 1
  const body = length === 0
    ? null
    : (Readable.toWeb(createReadStream(grant.path, { start, end })) as unknown as ReadableStream)
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      'Content-Length': String(length),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    },
  })
}
