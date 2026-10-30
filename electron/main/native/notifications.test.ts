// Notificaciones del sistema (documento 02 §7): disponibilidad real, dedupe y
// clic que resuelve el destino sin enviar nada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shown: Array<{ title: string; body: string }> = []
const clicks: Array<() => void> = []
const created: Array<{ options: Record<string, unknown>; handlers: Record<string, (details?: unknown) => void> }> = []
let supported = true

vi.mock('electron', () => ({
  Notification: Object.assign(
    class {
      private readonly handlers: Record<string, (details?: unknown) => void> = {}
      constructor(readonly options: { title: string; body: string }) {
        shown.push({ title: options.title, body: options.body })
        created.push({ options, handlers: this.handlers })
      }
      on(event: string, handler: (details?: unknown) => void) {
        this.handlers[event] = handler
        if (event === 'click') clicks.push(handler as () => void)
      }
      show() {}
    },
    { isSupported: () => supported },
  ),
}))

const { createNotifications, DEDUPE_WINDOW_MS } = await import('./notifications')

let activated: Array<{ sessionId?: string; turnId?: string; action?: string }>
let replies: Array<{ target: { sessionId?: string; turnId?: string }; text: string }>
let focused: number

function service() {
  return createNotifications({
    onActivate: (target) => activated.push(target),
    onReply: (reply) => replies.push(reply),
    focusWindow: () => (focused += 1),
  })
}

beforeEach(() => {
  shown.length = 0
  clicks.length = 0
  created.length = 0
  activated = []
  replies = []
  focused = 0
  supported = true
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('disponibilidad', () => {
  it('sin soporte del sistema lo dice, y no muestra nada', () => {
    // Un permiso ausente se reporta ausente, no como éxito simulado.
    supported = false
    const notifications = service()
    expect(notifications.support()).toEqual({ canSend: false, canActivateTarget: false })
    expect(notifications.send({ title: 'a', body: 'b' })).toBe(false)
    expect(shown).toEqual([])
  })

  it('con soporte, notifica y lo confirma', () => {
    const notifications = service()
    expect(notifications.support()).toEqual({ canSend: true, canActivateTarget: true })
    expect(notifications.send({ title: 'Turno terminado', body: 'demo' })).toBe(true)
    expect(shown).toEqual([{ title: 'Turno terminado', body: 'demo' }])
  })
})

describe('deduplicación', () => {
  it('el mismo aviso repetido no sale dos veces', () => {
    const notifications = service()
    const aviso = { title: 'Turno terminado', body: 'demo', target: { sessionId: 'ses_a' } }
    expect(notifications.send(aviso)).toBe(true)
    expect(notifications.send(aviso)).toBe(false)
    expect(shown).toHaveLength(1)
  })

  it('un destino distinto no es el mismo aviso', () => {
    const notifications = service()
    notifications.send({ title: 'Turno terminado', body: 'demo', target: { sessionId: 'ses_a' } })
    expect(notifications.send({ title: 'Turno terminado', body: 'demo', target: { sessionId: 'ses_b' } })).toBe(
      true,
    )
    expect(shown).toHaveLength(2)
  })

  it('pasada la ventana vuelve a mostrarse', () => {
    const notifications = service()
    const aviso = { title: 'Turno terminado', body: 'demo' }
    notifications.send(aviso)
    vi.advanceTimersByTime(DEDUPE_WINDOW_MS + 1)
    expect(notifications.send(aviso)).toBe(true)
    expect(shown).toHaveLength(2)
  })
})

describe('clic del usuario', () => {
  it('enfoca la ventana y resuelve el destino, sin enviar nada', () => {
    const notifications = service()
    notifications.send({ title: 'Te necesita', body: 'demo', target: { sessionId: 'ses_a', turnId: 't1' } })
    clicks[0]()
    expect(focused).toBe(1)
    expect(activated).toEqual([{ sessionId: 'ses_a', turnId: 't1' }])
  })

  it('un aviso sin destino activa vacío, no inventa uno', () => {
    const notifications = service()
    notifications.send({ title: 'a', body: 'b' })
    clicks[0]()
    expect(activated).toEqual([{}])
  })
})

describe('botones y «Responder» (#64)', () => {
  const aviso = {
    title: 'Logo nuevo',
    body: 'El plan está listo: Migrar',
    target: { sessionId: 'ses_a', turnId: 't1' },
    actions: [{ id: 'review-plan' as const, label: 'Revisar plan' }],
    reply: { placeholder: 'Responder a Rinari' },
  }

  it('pide los botones y la caja de respuesta al sistema', () => {
    service().send(aviso)
    expect(created[0].options).toMatchObject({ actions: [{ type: 'button', text: 'Revisar plan' }], hasReply: true, replyPlaceholder: 'Responder a Rinari' })
  })

  it('un botón trae la ventana y dice cuál se pulsó', () => {
    service().send(aviso)
    created[0].handlers.action({ actionIndex: 0, selectionIndex: -1 })
    expect(focused).toBe(1)
    expect(activated).toEqual([{ sessionId: 'ses_a', turnId: 't1', action: 'review-plan' }])
  })

  it('responder manda el texto a esa conversación sin traer la ventana; vacío no manda nada', () => {
    service().send(aviso)
    created[0].handlers.reply({ reply: '  sí, adelante  ' })
    expect(replies).toEqual([{ target: { sessionId: 'ses_a', turnId: 't1' }, text: 'sí, adelante' }])
    expect(focused).toBe(0)
    service().send({ ...aviso, target: { sessionId: 'ses_b', turnId: 't2' } })
    created[1].handlers.reply({ reply: '   ' })
    expect(replies).toHaveLength(1)
  })

  it('sin quien reciba la respuesta, no ofrece la caja', () => {
    createNotifications({ onActivate: () => {}, focusWindow: () => {} }).send(aviso)
    expect(created[0].options.hasReply).toBeUndefined()
  })
})
