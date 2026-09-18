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
  'context.setControl',
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
/** Prefijo reservado al broker. Nada de aquí llega al renderer. */
export const HOST_EVENT_PREFIX = 'host.browser.'

/**
 * ¿Pertenece este evento al canal privado del broker?
 *
 * Se clasifica **por namespace, antes de validar**. Antes se decidía por si
 * el payload era válido, así que un `host.browser.request` malformado —o
 * llegado antes de que existiera el host— caía al camino público y se enviaba
 * al renderer como evento de conversación. Un frame privado sigue siendo
 * privado aunque esté roto.
 */
export function isHostChannelEvent(envelope: unknown): boolean {
  if (typeof envelope !== 'object' || envelope === null) return false
  const outer = envelope as Record<string, unknown>
  return (
    outer.type === 'event' &&
    typeof outer.event === 'string' &&
    outer.event.startsWith(HOST_EVENT_PREFIX)
  )
}

export function hostRequestOf(envelope: unknown): HostRequest | null {
  if (typeof envelope !== 'object' || envelope === null) return null
  const outer = envelope as Record<string, unknown>
  if (outer.type !== 'event' || outer.event !== 'host.browser.request') return null
  const payload = outer.payload
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const candidate = { ...(payload as Record<string, unknown>), type: 'host.browser.request' }
  return isHostRequest(candidate) ? candidate : null
}

/** Tope de un identificador opaco. Ninguno legítimo se acerca. */
const MAX_ID_LENGTH = 256

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function isHostRequest(event: unknown): event is HostRequest {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return false
  const candidate = event as Record<string, unknown>

  // Identidad completa, no una parte. Antes faltaban `context_id`,
  // `generation`, `target_id` y `timeout_ms`, así que pasaba una solicitud sin
  // contexto —y una con `context_id: 42`, `target_id: []`, `generation: -1` y
  // `timeout_ms: NaN`—. Lo que sale de aquí decide sobre qué página se opera.
  if (candidate.type !== 'host.browser.request') return false
  if (!isId(candidate.request_id)) return false
  if (!isId(candidate.binding_id)) return false
  if (!isId(candidate.engine_instance_id)) return false
  if (!isId(candidate.session_id)) return false
  if (!isId(candidate.context_id)) return false
  if (!isCount(candidate.generation)) return false

  // El target puede faltar —la operación usa entonces la página del
  // contexto—, pero si viene tiene que ser un identificador.
  if (candidate.target_id !== null && !isId(candidate.target_id)) return false

  if (typeof candidate.operation !== 'string' || candidate.operation === '') return false
  // `NaN` e `Infinity` son números; un deadline hecho con ellos no expira.
  if (!isCount(candidate.timeout_ms) || candidate.timeout_ms === 0) return false

  const params = candidate.params
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return false

  return true
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
