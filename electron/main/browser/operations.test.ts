// Allowlist del browser nativo y validación de la solicitud del broker
// (documento 03 §4.2, §5.4, §9).
//
// Estas tres reglas son las que no se pueden comprobar a ojo: qué operaciones
// existen, qué cuenta como solicitud del broker, y qué destino puede tomar una
// página del agente.
import { describe, expect, it } from 'vitest'
import { CHANNEL } from '../../shared/contracts'

import {
  CONTEXT_OPERATIONS,
  MAX_REMEMBERED,
  PAGE_OPERATIONS,
  RequestLedger,
  fingerprintOf,
  hostRequestOf,
  isHostChannelEvent,
  isHostRequest,
  FALLBACK_DOWNLOAD_NAME,
  isNavigableUrl,
  resolveOperation,
  safeDownloadName,
  type HostRequest,
} from './operations'

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'host.browser.request',
    request_id: 'req-1',
    binding_id: 'bind-1',
    engine_instance_id: 'eng-1',
    session_id: 'ses-1',
    context_id: 'ctx-1',
    generation: 1,
    operation: 'page.navigate',
    target_id: null,
    params: { url: 'http://127.0.0.1:9/fixture' },
    timeout_ms: 30_000,
    ...overrides,
  }
}

describe('allowlist de operaciones', () => {
  it('las operaciones page-level se resuelven a su comando CDP', () => {
    for (const [operation, method] of Object.entries(PAGE_OPERATIONS)) {
      expect(resolveOperation(operation)).toEqual({ kind: 'page', method })
    }
  })

  it('las operaciones de contexto no son un comando CDP', () => {
    for (const operation of CONTEXT_OPERATIONS) {
      expect(resolveOperation(operation)).toEqual({ kind: 'context' })
    }
  })

  it.each([
    // Browser-level: la sonda midió que **sí** responden desde una sesión
    // page-level, y que la enumeración cruza particiones. Que funcionen es la
    // razón de que no estén, no un motivo para añadirlas.
    'Target.getTargets',
    'Browser.getVersion',
    'Browser.setDownloadBehavior',
    'Target.createTarget',
    // Nombres con la forma correcta pero que nadie declaró.
    'page.crash',
    'page.setDownloadBehavior',
    'context.attachDebugger',
    // Y basura.
    '',
    'Page.navigate',
    '__proto__',
  ])('%s no es una operación', (operation) => {
    expect(resolveOperation(operation)).toEqual({ kind: 'unsupported' })
  })

  it('el comando CDP se toma de la tabla, no del nombre de la operación', () => {
    // Que `page.navigate` sea `Page.navigate` es una coincidencia cómoda; la
    // traducción no debe derivarse capitalizando lo que llegue.
    expect(resolveOperation('page.a11y')).toEqual({
      kind: 'page',
      method: 'Accessibility.getFullAXTree',
    })
  })

  it('la captura no es un comando CDP', () => {
    // Medido: `Page.captureScreenshot` no vuelve nunca si la vista no está
    // compuesta en pantalla —escondida, colapsada o sin slot—, y el §8.3
    // prohíbe que ocultar rompa una herramienta que use ese target. La
    // captura la sirve `webContents.capturePage`, que sí funciona escondida.
    expect(resolveOperation('page.screenshot')).toEqual({ kind: 'context' })
    expect(PAGE_OPERATIONS['page.screenshot']).toBeUndefined()
  })
})

describe('qué cuenta como solicitud del broker', () => {
  it('una solicitud completa se reconoce', () => {
    expect(isHostRequest(request())).toBe(true)
  })

  it.each([
    ['otro tipo de evento', { type: 'turn.completed' }],
    ['sin request_id', { request_id: undefined }],
    ['request_id vacío', { request_id: '' }],
    ['sin sesión', { session_id: '' }],
    ['sin binding', { binding_id: 42 }],
    ['sin instancia del engine', { engine_instance_id: null }],
    ['operación no textual', { operation: { name: 'page.navigate' } }],
    ['params ausentes', { params: null }],
    ['params en array', { params: ['url'] }],
  ])('%s no lo es', (_label, overrides) => {
    // Importa porque main **consume** lo que reconoce: dar por buena una
    // solicitud a medio formar la haría desaparecer de la conversación sin
    // llegar a ejecutarse.
    expect(isHostRequest(request(overrides))).toBe(false)
  })

  it.each([null, undefined, 'host.browser.request', 7, []])(
    'un valor que no es objeto tampoco (%s)',
    (value) => {
      expect(isHostRequest(value)).toBe(false)
    },
  )
})

describe('la solicitud llega dentro del sobre de evento', () => {
  // El Engine la emite como cualquier otro evento porque el transporte del
  // host sólo clasifica como evento lo que trae `type: "event"`. Una
  // envoltura propia se quedaba sin entregar y el turno esperaba hasta
  // agotar su plazo.
  const envelope = (payload: Record<string, unknown>) => ({
    type: 'event',
    event: 'host.browser.request',
    payload,
  })

  it('se extrae del sobre', () => {
    const extracted = hostRequestOf(envelope(request()))
    expect(extracted?.operation).toBe('page.navigate')
    expect(extracted?.session_id).toBe('ses-1')
  })

  it.each([
    ['otro evento', { type: 'event', event: 'turn.completed', payload: request() }],
    ['sin sobre', request()],
    ['payload ausente', { type: 'event', event: 'host.browser.request' }],
    ['payload en array', { type: 'event', event: 'host.browser.request', payload: [] }],
    ['payload incompleto', envelope({ ...request(), session_id: '' })],
    ['respuesta, no evento', { id: 'r1', ok: true, result: {} }],
  ])('%s no se extrae', (_label, value) => {
    expect(hostRequestOf(value)).toBeNull()
  })
})

describe('DTO-01/02 — identidad completa, no una parte', () => {
  // Los dos objetos que la revisión de PR #10 reprodujo contra el predicado
  // anterior. El primero no trae contexto, generación, target ni plazo; el
  // segundo los trae con tipos imposibles. Los dos pasaban.
  const sinIdentidad = {
    request_id: 'r1',
    binding_id: 'b1',
    engine_instance_id: 'e1',
    session_id: 's1',
    operation: 'page.navigate',
    params: {},
  }

  it('una solicitud sin contexto ni generación ni plazo se rechaza', () => {
    expect(isHostRequest({ type: 'host.browser.request', ...sinIdentidad })).toBe(false)
  })

  it('tipos imposibles en los campos de identidad se rechazan', () => {
    expect(
      isHostRequest({
        type: 'host.browser.request',
        ...sinIdentidad,
        context_id: 42,
        target_id: [],
        generation: -1,
        timeout_ms: NaN,
        control_revision: 'x',
      }),
    ).toBe(false)
  })

  it.each([
    ['contexto vacío', { context_id: '' }],
    ['generación negativa', { generation: -1 }],
    ['generación fraccionaria', { generation: 1.5 }],
    ['plazo no finito', { timeout_ms: Infinity }],
    ['plazo cero', { timeout_ms: 0 }],
    ['plazo negativo', { timeout_ms: -1 }],
    ['target de tipo raro', { target_id: 7 }],
    ['target vacío', { target_id: '' }],
    ['operación vacía', { operation: '' }],
    ['id desmesurado', { request_id: 'x'.repeat(300) }],
  ])('%s se rechaza', (_label, overrides) => {
    expect(isHostRequest(request(overrides))).toBe(false)
  })

  it('un target ausente sí es válido: la operación usa la página del contexto', () => {
    expect(isHostRequest(request({ target_id: null }))).toBe(true)
  })
})

describe('PRIVATE-01 — el canal privado se clasifica por namespace', () => {
  // Se decide antes de validar. Antes, un frame privado malformado devolvía
  // «no es mío» y acababa enviado al renderer como evento de conversación.
  it.each([
    'host.browser.request',
    'host.browser.something-unknown',
    'host.browser.',
  ])('%s pertenece al canal privado', (name) => {
    expect(isHostChannelEvent({ type: 'event', event: name, payload: {} })).toBe(true)
  })

  it('un frame privado malformado sigue siendo privado', () => {
    const roto = { type: 'event', event: 'host.browser.request', payload: { nope: true } }
    expect(isHostChannelEvent(roto)).toBe(true)
    expect(hostRequestOf(roto)).toBeNull()
  })

  it.each([
    ['evento normal', { type: 'event', event: 'turn.completed', payload: {} }],
    ['nombre parecido', { type: 'event', event: 'hostXbrowser.request', payload: {} }],
    ['respuesta', { id: 'r1', ok: true }],
    ['nada', null],
  ])('%s no pertenece', (_label, value) => {
    expect(isHostChannelEvent(value)).toBe(false)
  })
})

describe('BR-10 — el renderer no posee el broker privado', () => {
  it('ningún canal público registra, responde ni publica por host.browser', () => {
    const exposed = Object.values(CHANNEL)
    expect(exposed.some((name) => name.includes('host.browser'))).toBe(false)
    expect('hostBrowserRegister' in CHANNEL).toBe(false)
    expect('hostBrowserReply' in CHANNEL).toBe(false)
    expect('hostBrowserEvent' in CHANNEL).toBe(false)
  })
})

describe('DEDUP-01/02 — una solicitud se ejecuta una sola vez', () => {
  const ledger = () => new RequestLedger<string>()
  /** La misma solicitud del resto del fichero, ya tipada. */
  const typed = (overrides: Record<string, unknown> = {}) =>
    request(overrides) as unknown as HostRequest

  it('una reentrega comparte la ejecución en curso', async () => {
    const book = ledger()
    let runs = 0
    const start = () => {
      runs += 1
      return Promise.resolve(`resultado-${runs}`)
    }
    const first = book.remember('r1', 'huella', start)
    const again = book.remember('r1', 'huella', start)
    expect(await first).toBe('resultado-1')
    // Lo importante no es que devuelva lo mismo, sino que **no se ejecute**
    // otra vez: repetir un click lo pulsa dos veces.
    expect(await again).toBe('resultado-1')
    expect(runs).toBe(1)
  })

  it('el mismo id con otra carga es conflicto y no ejecuta nada', () => {
    const book = ledger()
    let runs = 0
    book.remember('r1', fingerprintOf(typed()), () => {
      runs += 1
      return Promise.resolve('ok')
    })
    const conflicto = book.remember('r1', fingerprintOf(typed({ operation: 'page.mouse' })), () => {
      runs += 1
      return Promise.resolve('no debería')
    })
    expect(conflicto).toBeNull()
    expect(runs).toBe(1)
  })

  it('la huella distingue lo que describe otra operación', () => {
    const base = fingerprintOf(typed())
    expect(fingerprintOf(typed())).toBe(base)
    for (const cambio of [
      { operation: 'page.mouse' },
      { params: { url: 'http://127.0.0.1:9/otra' } },
      { target_id: 'otro' },
      { context_id: 'ctx-2' },
      { generation: 2 },
      { session_id: 'ses-2' },
    ]) {
      expect(fingerprintOf(typed(cambio))).not.toBe(base)
    }
  })

  it('el id y el binding no entran en la huella', () => {
    // Son la correlación, no la operación: una reentrega trae el mismo id y
    // cambiar de binding ya invalida el registro entero.
    expect(fingerprintOf(typed({ request_id: 'otro', binding_id: 'otro' }))).toBe(
      fingerprintOf(typed()),
    )
  })

  it('la retención está acotada y se puede vaciar', () => {
    const book = ledger()
    for (let index = 0; index <= MAX_REMEMBERED + 10; index += 1) {
      book.remember(`r${index}`, 'h', () => Promise.resolve('ok'))
    }
    expect(book.size).toBeLessThanOrEqual(MAX_REMEMBERED)
    book.clear()
    expect(book.size).toBe(0)
  })
})

describe('destinos que una página del agente puede tomar (§9)', () => {
  it.each(['http://127.0.0.1:5173/fixture', 'https://example.com/a?b=c', 'about:blank'])(
    '%s se permite',
    (url) => {
      expect(isNavigableUrl(url)).toBe(true)
    },
  )

  it.each([
    // El esquema propio serviría el renderer de confianza dentro de una vista
    // de contenido remoto.
    'app://rinari/index.html',
    'app://rinari',
    // Lectura de disco desde contenido remoto.
    'file:///C:/Windows/System32/drivers/etc/hosts',
    'file:///etc/passwd',
    // Ejecución encubierta.
    'javascript:fetch("/steal")',
    'data:text/html,<script>alert(1)</script>',
    // Esquemas del sistema.
    'ms-settings:privacy',
    'vscode://file/etc',
    // Y lo que ni siquiera es una URL.
    '',
    'no es una url',
    '//example.com',
  ])('%s se rechaza', (url) => {
    expect(isNavigableUrl(url)).toBe(false)
  })

  it('el hostname no es lo que autoriza', () => {
    // El §9: «una página localhost no es confiable por su hostname». Lo que
    // decide aquí es el esquema; a dónde se navega lo decide la policy de red.
    expect(isNavigableUrl('http://localhost:3000/')).toBe(true)
    expect(isNavigableUrl('file://localhost/etc/passwd')).toBe(false)
  })
})

// Subidas y descargas (documento 03 §6.3, BR-09 de la matriz).
describe('subir y descargar no son un passthrough de CDP', () => {
  // Lo importante no es que las operaciones nuevas existan, es que los
  // comandos CDP equivalentes **sigan sin existir**. `DOM.setFileInputFiles`
  // entrega un fichero del disco a contenido remoto, y `Browser.*` la sonda lo
  // midió alcanzable desde una sesión page-level y cruzando particiones.
  it('los comandos CDP crudos no se pueden pedir', () => {
    expect(resolveOperation('DOM.setFileInputFiles')).toEqual({ kind: 'unsupported' })
    expect(resolveOperation('Browser.setDownloadBehavior')).toEqual({ kind: 'unsupported' })
    expect(PAGE_OPERATIONS['DOM.setFileInputFiles']).toBeUndefined()
    expect(PAGE_OPERATIONS['Browser.setDownloadBehavior']).toBeUndefined()
  })

  it('las operaciones semánticas las resuelve el host, no un comando', () => {
    expect(resolveOperation('page.setFileInput')).toEqual({ kind: 'context' })
    expect(resolveOperation('context.beginDownload')).toEqual({ kind: 'context' })
    expect(CONTEXT_OPERATIONS.has('page.setFileInput')).toBe(true)
  })
})

describe('el nombre de una descarga viene de la página, así que es hostil', () => {
  it('se queda con el último componente de una ruta', () => {
    // El caso que importa: sin esto, el destino sale del directorio de
    // artefactos y escribe donde diga el servidor.
    expect(safeDownloadName('../../.ssh/authorized_keys')).toBe('authorized_keys')
    expect(safeDownloadName(String.raw`..\..\Windows\System32\drivers\etc\hosts`)).toBe(
      'hosts',
    )
    expect(safeDownloadName('/etc/passwd')).toBe('passwd')
  })

  it('un nombre que sólo son puntos o espacios no deja nada usable', () => {
    for (const hostile of ['.', '..', '...', '   ', '', '  ..  ']) {
      expect(safeDownloadName(hostile)).toBe(FALLBACK_DOWNLOAD_NAME)
    }
  })

  it('los nombres de dispositivo de Windows no crean ficheros', () => {
    // Abrir `CON.txt` para escribir habla con un dispositivo, no crea nada.
    expect(safeDownloadName('CON')).toBe('_CON')
    expect(safeDownloadName('con.txt')).toBe('_con.txt')
    expect(safeDownloadName('LPT1.pdf')).toBe('_LPT1.pdf')
    expect(safeDownloadName('NUL')).toBe('_NUL')
    // Y uno que sólo se le parece sí pasa tal cual.
    expect(safeDownloadName('console.log')).toBe('console.log')
  })

  it('quita caracteres de control y los que Windows prohíbe', () => {
    expect(safeDownloadName('a\u0000b.txt')).toBe('ab.txt')
    expect(safeDownloadName('sal\nto.txt')).toBe('salto.txt')
    expect(safeDownloadName('re<po>rt:e"|?*.pdf')).toBe('reporte.pdf')
  })

  it('recorta puntos y espacios del final, que Windows se comería', () => {
    // Si no, el fichero acaba con un nombre distinto del que se validó.
    expect(safeDownloadName('informe.   ')).toBe('informe')
    expect(safeDownloadName('  informe.pdf  ')).toBe('informe.pdf')
  })

  it('acota la longitud sin perder la extensión', () => {
    const long = `${'n'.repeat(400)}.pdf`
    const safe = safeDownloadName(long)
    expect(safe.length).toBeLessThanOrEqual(120)
    expect(safe.endsWith('.pdf')).toBe(true)
  })

  it('lo que no es una cadena no es un nombre', () => {
    for (const value of [undefined, null, 42, {}, ['a.txt']]) {
      expect(safeDownloadName(value)).toBe(FALLBACK_DOWNLOAD_NAME)
    }
  })

  it('un nombre normal se respeta', () => {
    expect(safeDownloadName('informe 2024.pdf')).toBe('informe 2024.pdf')
    expect(safeDownloadName('datos-final_v2.csv')).toBe('datos-final_v2.csv')
  })
})
