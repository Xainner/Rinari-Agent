/**
 * Esquema local que sirve la UI (documento 02 §6.1).
 *
 * La UI **no** se sirve por `file://`: un documento `file:` comparte origen con
 * todo el disco y la CSP no puede acotarlo. Se registra un esquema propio,
 * estándar y seguro, con un origen único (`app://rinari`) contra el que
 * `validateSender` compara de forma exacta.
 *
 * La resolución de rutas se hace aquí y se prueba aparte: es la superficie por
 * la que un `..` bien colocado leería el disco del usuario.
 */

import { join, normalize, resolve, sep } from 'node:path'

export const APP_SCHEME = 'app'
export const APP_HOST = 'rinari'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

/** Tipos que sirve el renderer; lo que no esté aquí no se entrega. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf('.')
  const extension = dot === -1 ? '' : path.slice(dot).toLowerCase()
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

export type Resolution =
  | { ok: true; path: string }
  | { ok: false; reason: 'outside-root' | 'bad-url' | 'wrong-origin' }

/**
 * ¿`candidate` está dentro de `base`?
 *
 * Se compara sobre rutas ya resueltas y exigiendo el separador, porque
 * `<base>-otro` empieza por `<base>` y no está dentro. Es la última barrera:
 * en la práctica el parser de URL y `normalize` ya contienen los `..`, pero
 * esta comprobación no depende de que sigan haciéndolo.
 */
export function isInsideRoot(base: string, candidate: string): boolean {
  const root = resolve(base)
  const target = resolve(candidate)
  return target === root || target.startsWith(root + sep)
}

/**
 * Traduce una URL del esquema a un fichero dentro de `root`.
 *
 * Reglas: solo el host propio; se decodifica el porcentaje **antes** de
 * normalizar, porque `%2e%2e` es `..`; y el resultado tiene que quedar dentro
 * de la raíz comprobándolo sobre la ruta ya resuelta, no sobre el texto.
 * Una ruta sin extensión cae en `index.html` para que la SPA enrute.
 */
export function resolveAppUrl(url: string, root: string): Resolution {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'bad-url' }
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) {
    return { ok: false, reason: 'wrong-origin' }
  }

  let pathname: string
  try {
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return { ok: false, reason: 'bad-url' }
  }
  // Un NUL trunca la ruta en las llamadas del sistema.
  if (pathname.includes('\0')) return { ok: false, reason: 'outside-root' }

  const relative = normalize(pathname).replace(/^[/\\]+/, '')
  const base = resolve(root)
  const candidate = resolve(base, relative === '' ? 'index.html' : relative)

  if (!isInsideRoot(base, candidate)) return { ok: false, reason: 'outside-root' }
  // Ruta de la SPA sin extensión: la sirve el documento.
  if (!/\.[a-z0-9]+$/i.test(candidate)) return { ok: true, path: join(base, 'index.html') }
  return { ok: true, path: candidate }
}

/**
 * CSP de producción. Sin `unsafe-eval`, sin JavaScript remoto y sin marcos
 * ajenos; el contenido web no confiable vive fuera de este renderer.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    `script-src ${APP_ORIGIN}`,
    `style-src ${APP_ORIGIN} 'unsafe-inline'`,
    `img-src ${APP_ORIGIN} data: blob:`,
    `font-src ${APP_ORIGIN} data:`,
    `media-src ${APP_ORIGIN} data: blob:`,
    `connect-src ${APP_ORIGIN}`,
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}
