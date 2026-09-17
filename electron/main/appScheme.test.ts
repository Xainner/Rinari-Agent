// Esquema local de la UI (documento 02 §6.1): resolución sin traversal y CSP
// de producción. SEC-03 del documento 04.
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import { APP_ORIGIN, contentSecurityPolicy, contentTypeFor, isInsideRoot, resolveAppUrl } from './appScheme'

const ROOT = resolve('C:/app/dist')

/** Una resolución aceptada tiene que caer dentro de la raíz. */
function resolvedInsideRoot(url: string): boolean {
  const result = resolveAppUrl(url, ROOT)
  return result.ok && isInsideRoot(ROOT, result.path)
}

describe('resolución de rutas', () => {
  it('sirve index.html en la raíz y en una ruta de la SPA', () => {
    expect(resolveAppUrl(`${APP_ORIGIN}/`, ROOT)).toEqual({ ok: true, path: resolve(ROOT, 'index.html') })
    // Sin extensión enruta la SPA, no un fichero suelto.
    expect(resolveAppUrl(`${APP_ORIGIN}/proyectos/abc`, ROOT)).toEqual({
      ok: true,
      path: resolve(ROOT, 'index.html'),
    })
  })

  it('sirve un recurso real dentro de la raíz', () => {
    expect(resolveAppUrl(`${APP_ORIGIN}/assets/app.js`, ROOT)).toEqual({
      ok: true,
      path: resolve(ROOT, 'assets', 'app.js'),
    })
  })

  it('ninguna forma de traversal sale de la raíz', () => {
    // El parser de URL y `normalize` **contienen** los `..` en vez de
    // rechazarlos: lo que importa es que el fichero servido caiga dentro,
    // venga la ruta como venga.
    const intentos = [
      `${APP_ORIGIN}/../secretos.txt`,
      `${APP_ORIGIN}/assets/../../secretos.txt`,
      `${APP_ORIGIN}/%2e%2e/%2e%2e/secretos.txt`,
      `${APP_ORIGIN}/assets%2f..%2f..%2fsecretos.txt`,
      // Backslash: en Windows es separador y el parser de URL no lo colapsa.
      `${APP_ORIGIN}/..%5C..%5Csecretos.txt`,
      `${APP_ORIGIN}/assets%5C..%5C..%5Csecretos.txt`,
      `${APP_ORIGIN}/....//secretos.txt`,
    ]
    for (const intento of intentos) {
      expect(resolvedInsideRoot(intento), intento).toBe(true)
    }
  })

  it('la barrera de contención no se deja engañar por un hermano con prefijo igual', () => {
    // Es la última capa, la que no depende de que el parser siga colapsando.
    expect(isInsideRoot(ROOT, resolve(ROOT, 'assets', 'app.js'))).toBe(true)
    expect(isInsideRoot(ROOT, ROOT)).toBe(true)
    // `C:/app/dist-otro` empieza por `C:/app/dist` y no está dentro.
    expect(isInsideRoot(ROOT, `${ROOT}-otro${sep}x.js`)).toBe(false)
    expect(isInsideRoot(ROOT, resolve('C:/otra/cosa.txt'))).toBe(false)
  })

  it('rechaza un NUL, que truncaría la ruta en el sistema', () => {
    expect(resolveAppUrl(`${APP_ORIGIN}/app.js%00.png`, ROOT)).toEqual({
      ok: false,
      reason: 'outside-root',
    })
  })

  it('solo atiende a su propio origen', () => {
    expect(resolveAppUrl('app://otro/index.html', ROOT)).toEqual({ ok: false, reason: 'wrong-origin' })
    expect(resolveAppUrl('https://rinari/index.html', ROOT)).toEqual({ ok: false, reason: 'wrong-origin' })
    expect(resolveAppUrl('no es una url', ROOT)).toEqual({ ok: false, reason: 'bad-url' })
  })
})

describe('tipos de contenido', () => {
  it('reconoce lo que sirve el renderer', () => {
    expect(contentTypeFor('/index.html')).toContain('text/html')
    expect(contentTypeFor('/assets/app.js')).toContain('text/javascript')
    expect(contentTypeFor('/assets/x.woff2')).toBe('font/woff2')
  })

  it('lo desconocido no se sirve como algo ejecutable', () => {
    expect(contentTypeFor('/algo.exe')).toBe('application/octet-stream')
    expect(contentTypeFor('/sin-extension')).toBe('application/octet-stream')
  })
})

describe('CSP de producción', () => {
  const csp = contentSecurityPolicy()

  it('parte de no permitir nada', () => {
    expect(csp).toContain("default-src 'none'")
  })

  it('no admite eval ni JavaScript remoto', () => {
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain(`script-src ${APP_ORIGIN}`)
    expect(csp).not.toMatch(/script-src[^;]*https?:/)
  })

  it('no admite marcos ni incrustar la app en otro sitio', () => {
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it('no reutiliza la CSP de Tauri', () => {
    // `ipc.localhost` no significa nada en Electron y daría falsa confianza.
    expect(csp).not.toContain('ipc.localhost')
    expect(csp).not.toContain('tauri')
  })
})
