/**
 * Allowlist de operaciones del browser nativo y validación de la solicitud.
 *
 * Vive aparte de `NativeBrowserHost` a propósito: sin importar Electron, estas
 * reglas se pueden probar sin abrir una ventana, y son justo las que no
 * conviene comprobar a ojo.
 *
 * La regla de fondo (documento 03 §4.2): interfaz semántica, no CDP público.
 * La sonda de viabilidad midió por qué importa — desde una sesión page-level
 * responden `Target.getTargets`, `Browser.getVersion` y
 * `Browser.setDownloadBehavior`, y la enumeración cruza particiones—, así que
 * una operación que se colara tendría ámbito mayor que su propio target.
 */

import { APP_SCHEME } from '../appScheme'

/**
 * Operaciones page-level y el comando CDP con el que se ejecutan.
 *
 * Sin prototipo a propósito: con un objeto normal, `operations['__proto__']`
 * devuelve `Object.prototype` —un valor truthy—, y una operación llamada así
 * habría pasado por válida con un objeto por nombre de comando.
 */
export const PAGE_OPERATIONS: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    'page.navigate': 'Page.navigate',
    'page.screenshot': 'Page.captureScreenshot',
    'page.evaluate': 'Runtime.evaluate',
    'page.a11y': 'Accessibility.getFullAXTree',
    'page.boxModel': 'DOM.getBoxModel',
    'page.mouse': 'Input.dispatchMouseEvent',
    'page.key': 'Input.dispatchKeyEvent',
  }),
)

/** Operaciones sobre el contexto, que no son un comando CDP. */
export const CONTEXT_OPERATIONS = new Set([
  'context.targets',
  'context.newPage',
  'context.closePage',
  'context.close',
])

export type Resolution =
  | { kind: 'page'; method: string }
  | { kind: 'context' }
  | { kind: 'unsupported' }

/**
 * Qué es una operación. Lo que no esté nombrado cae en `unsupported`: es una
 * allowlist, no una denylist, así que una operación nueva no entra por existir.
 */
export function resolveOperation(operation: string): Resolution {
  const method = PAGE_OPERATIONS[operation]
  // `typeof` además del mapa sin prototipo: dos cierres para la misma puerta,
  // porque lo que sale de aquí acaba siendo el nombre de un comando CDP.
  if (typeof method === 'string' && method !== '') return { kind: 'page', method }
  if (CONTEXT_OPERATIONS.has(operation)) return { kind: 'context' }
  return { kind: 'unsupported' }
}

export interface HostRequest {
  type: string
  request_id: string
  binding_id: string
  engine_instance_id: string
  session_id: string
  context_id: string
  generation: number
  operation: string
  target_id: string | null
  params: Record<string, unknown>
  timeout_ms: number
}

/**
 * ¿Es esto una solicitud del broker?
 *
 * Se comprueba la forma entera y no sólo el `type`: main decide con esto si
 * **consume** el evento o lo reenvía al renderer, y un evento a medio formar
 * que se diera por bueno desaparecería de la conversación sin ejecutarse.
 */
export function isHostRequest(event: unknown): event is HostRequest {
  if (typeof event !== 'object' || event === null) return false
  const candidate = event as Record<string, unknown>
  return (
    candidate.type === 'host.browser.request' &&
    typeof candidate.request_id === 'string' &&
    candidate.request_id !== '' &&
    typeof candidate.binding_id === 'string' &&
    typeof candidate.engine_instance_id === 'string' &&
    typeof candidate.session_id === 'string' &&
    candidate.session_id !== '' &&
    typeof candidate.operation === 'string' &&
    typeof candidate.params === 'object' &&
    candidate.params !== null &&
    !Array.isArray(candidate.params)
  )
}

/**
 * Destinos que una página del agente no puede tomar.
 *
 * El §9 avisa de que «una página localhost no es confiable por su hostname»:
 * esto no autoriza por host, sólo cierra los esquemas que darían acceso a la
 * aplicación o al disco. A dónde se puede navegar lo sigue decidiendo la
 * política de red de las herramientas.
 */
export function isNavigableUrl(url: string): boolean {
  if (url === 'about:blank') return true
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  // El esquema propio serviría el renderer de confianza dentro de una vista
  // de contenido remoto.
  if (parsed.protocol === `${APP_SCHEME}:`) return false
  // `file:` sería lectura de disco desde contenido remoto; `javascript:` y los
  // esquemas del sistema, ejecución encubierta.
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}
