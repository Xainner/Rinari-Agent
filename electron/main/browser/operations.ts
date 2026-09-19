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
    'page.evaluate': 'Runtime.evaluate',
    'page.a11y': 'Accessibility.getFullAXTree',
    'page.boxModel': 'DOM.getBoxModel',
    'page.mouse': 'Input.dispatchMouseEvent',
    'page.key': 'Input.dispatchKeyEvent',
  }),
)

/**
 * Operaciones que no son un comando CDP.
 *
 * `page.screenshot` está aquí, y no entre las page-level, por una medición:
 * `Page.captureScreenshot` **no vuelve nunca** si la vista no está compuesta
 * en pantalla —escondida, con el panel colapsado, o sin slot todavía—, y el
 * §8.3 exige que ocultar no rompa una herramienta que esté usando ese target.
 * `webContents.capturePage()` sí funciona escondida, y el §6.3 permite
 * explícitamente resolver con APIs de Electron lo que CDP no cubre.
 */
export const CONTEXT_OPERATIONS = new Set([
  'page.screenshot',
  // Poner un fichero del disco en un input. Semántica y no
  // `DOM.setFileInputFiles` suelto: lo que entra es un selector y una ruta, y
  // el host resuelve el elemento él mismo. Exponer el comando crudo habría
  // dejado pasar un `objectId` y un array de rutas arbitrarias.
  'page.setFileInput',
  // Aceptar descargas de **esta** partición. `Browser.setDownloadBehavior` no
  // se reenvía: la sonda midió que el dominio `Browser` responde desde una
  // sesión page-level y cruza particiones, así que se resuelve con la API de
  // `session`, que sí tiene el ámbito correcto (§6.3).
  'context.beginDownload',
  // Observación bufferizada por el host: no hay una `CdpSession` de la que
  // drenar, así que la recoge el debugger y se sirve desde aquí (§6.3).
  'page.consoleEvents',
  'page.networkEvents',
  // Las cookies son de la partición del contexto, no de una página: van por
  // la API de `session` y no por un debugger page-level (§6.3).
  'context.cookies',
  'context.setCookie',
  'context.targets',
  'context.newPage',
  'context.closePage',
  'context.close',
  'context.setControl',
  'context.selectTarget',
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
 * Huella de una solicitud, para distinguir una reentrega de un id reciclado.
 *
 * Incluye contexto, generación, target y params: el mismo `request_id` con
 * otra carga describe **otra** operación, y ejecutarla como si fuera la misma
 * sería peor que ejecutarla dos veces.
 */
export function fingerprintOf(request: HostRequest): string {
  return JSON.stringify([
    request.session_id,
    request.context_id,
    request.generation,
    request.operation,
    request.target_id,
    request.params,
  ])
}

/** Cuántas solicitudes se recuerdan. Retención acotada. */
export const MAX_REMEMBERED = 512

/**
 * Lleva la cuenta de qué se ha ejecutado ya, por `request_id`.
 *
 * Una reentrega comparte la ejecución en curso —o su resultado conocido— en
 * vez de volver a pulsar el botón. El mismo id con otra carga es un conflicto,
 * no un duplicado, y no se ejecuta nada.
 *
 * Deliberadamente sin persistencia: el registro muere con la época del
 * binding, porque tras un reinicio no se puede prometer «una sola vez» y el
 * §5.4 dice que un éxito no se reconstruye.
 */
export class RequestLedger<T> {
  private readonly seen = new Map<string, { fingerprint: string; run: Promise<T> }>()

  /**
   * Devuelve la ejecución de esta solicitud, creándola sólo la primera vez.
   * `null` significa conflicto: ese id ya describió otra operación.
   */
  remember(requestId: string, fingerprint: string, start: () => Promise<T>): Promise<T> | null {
    const known = this.seen.get(requestId)
    if (known) return known.fingerprint === fingerprint ? known.run : null

    const run = start()
    this.seen.set(requestId, { fingerprint, run })
    if (this.seen.size > MAX_REMEMBERED) {
      const oldest = this.seen.keys().next().value
      if (oldest !== undefined) this.seen.delete(oldest)
    }
    return run
  }

  get size(): number {
    return this.seen.size
  }

  clear(): void {
    this.seen.clear()
  }
}

/** Nombre de recambio cuando lo que sugiere la página no deja nada usable. */
export const FALLBACK_DOWNLOAD_NAME = 'descarga'

/** Tope de longitud del nombre, con margen para el sufijo de desempate. */
const MAX_NAME_LENGTH = 120

/**
 * Nombres que Windows reserva para dispositivos, con o sin extensión.
 *
 * Abrir `CON.txt` para escribir no crea un fichero: habla con un dispositivo.
 */
const RESERVED_NAMES =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/**
 * Nombre de fichero seguro a partir del que sugiere la descarga.
 *
 * El nombre lo propone **la página**, por `Content-Disposition` o por la URL,
 * así que es entrada de un tercero y se trata como tal: si se usara tal cual,
 * un `../../.ssh/authorized_keys` escribiría fuera del directorio de
 * artefactos, y en Windows un `CON` ni siquiera sería un fichero.
 *
 * No intenta conservar la intención del nombre a toda costa; intenta que lo
 * que salga sea un componente de ruta y nada más. Quien quiera el original lo
 * tiene en `suggested_name`, que viaja aparte y sin usarse para abrir nada.
 */
export function safeDownloadName(suggested: unknown): string {
  if (typeof suggested !== 'string') return FALLBACK_DOWNLOAD_NAME
  // Sólo el último componente: separadores de los dos sistemas, porque el
  // nombre puede venir de un servidor que no es el de esta máquina.
  const base = suggested.split(/[/\\]/).pop() ?? ''
  const cleaned = base
    // Los caracteres que Windows prohíbe, más los de control: un `\n` en un
    // nombre es tan legítimo como una ruta relativa.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?* -]/g, '')
    // Puntos y espacios al principio y al final: Windows los recorta solo al
    // crear, así que el fichero acabaría con un nombre distinto del validado.
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim()
  if (cleaned === '') return FALLBACK_DOWNLOAD_NAME
  const guarded = RESERVED_NAMES.test(cleaned) ? `_${cleaned}` : cleaned
  if (guarded.length <= MAX_NAME_LENGTH) return guarded
  // Se recorta por delante conservando la extensión: un nombre larguísimo es
  // un problema de longitud de ruta, y perder el tipo de fichero de paso
  // sería gratis.
  const dot = guarded.lastIndexOf('.')
  const extension = dot > 0 ? guarded.slice(dot, dot + 16) : ''
  return guarded.slice(0, MAX_NAME_LENGTH - extension.length) + extension
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
