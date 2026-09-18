// Notificaciones del sistema (documento 02 §7): disponibilidad real, dedupe y
// clic que resuelve el destino sin enviar nada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shown: Array<{ title: string; body: string }> = []
const clicks: Array<() => void> = []
let supported = true

vi.mock('electron', () => ({
  Notification: Object.assign(
    class {
      constructor(readonly options: { title: string; body: string }) {
        shown.push({ title: options.title, body: options.body })
      }
      on(event: string, handler: () => void) {
        if (event === 'click') clicks.push(handler)
      }
      show() {}
    },
    { isSupported: () => supported },
  ),
}))

const { createNotifications, DEDUPE_WINDOW_MS } = await import('./notifications')

let activated: Array<{ sessionId?: string; turnId?: string }>
let focused: number

function service() {
  return createNotifications({
    onActivate: (target) => activated.push(target),
    focusWindow: () => (focused += 1),
  })
}

beforeEach(() => {
  shown.length = 0
  clicks.length = 0
  activated = []
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
