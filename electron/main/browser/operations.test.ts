// Allowlist del browser nativo y validación de la solicitud del broker
// (documento 03 §4.2, §5.4, §9).
//
// Estas tres reglas son las que no se pueden comprobar a ojo: qué operaciones
// existen, qué cuenta como solicitud del broker, y qué destino puede tomar una
// página del agente.
import { describe, expect, it } from 'vitest'

import {
  CONTEXT_OPERATIONS,
  PAGE_OPERATIONS,
  isHostRequest,
  isNavigableUrl,
  resolveOperation,
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
    expect(resolveOperation('page.screenshot')).toEqual({
      kind: 'page',
      method: 'Page.captureScreenshot',
    })
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
