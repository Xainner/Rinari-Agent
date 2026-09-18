// QUIT-01..07: una sola autoridad de salida, y preguntar antes de detener.
//
// El fallo que fijan: `Cmd+Q` y el menú entraban por `before-quit`, que
// detenía el Engine **antes** del diálogo. Cancelar dejaba la ventana abierta
// con el turno ya interrumpido.
import { describe, expect, it, vi } from 'vitest'

import { QuitCoordinator, type QuitDeps } from './QuitCoordinator'

function coordinator(overrides: Partial<QuitDeps> = {}) {
  const calls = { confirm: 0, shutdown: 0, commit: 0, errors: [] as unknown[] }
  const deps: QuitDeps = {
    shouldConfirm: () => true,
    confirm: async () => {
      calls.confirm += 1
      return true
    },
    shutdown: async () => {
      calls.shutdown += 1
    },
    commit: () => {
      calls.commit += 1
    },
    onShutdownError: (error) => calls.errors.push(error),
    ...overrides,
  }
  // Los overrides que cuentan se envuelven para no perder el contador.
  if (overrides.confirm) {
    deps.confirm = async (reason) => {
      calls.confirm += 1
      return overrides.confirm!(reason)
    }
  }
  if (overrides.shutdown) {
    deps.shutdown = async () => {
      calls.shutdown += 1
      return overrides.shutdown!()
    }
  }
  return { quit: new QuitCoordinator(deps), calls }
}

describe('QUIT-01/03 — cancelar no toca el Engine', () => {
  it('cerrar la ventana y cancelar deja el Engine en marcha', async () => {
    const { quit, calls } = coordinator({ confirm: async () => false })
    await expect(quit.requestQuit('window-close')).resolves.toBe(false)
    expect(calls.shutdown).toBe(0)
    expect(calls.commit).toBe(0)
    expect(quit.isCommitted()).toBe(false)
    expect(quit.current).toBe('idle')
  })

  it('Cmd+Q o app.quit y cancelar tampoco', async () => {
    // Esta es la ruta que antes detenía el Engine antes de preguntar.
    const { quit, calls } = coordinator({ confirm: async () => false })
    await expect(quit.requestQuit('app')).resolves.toBe(false)
    expect(calls.shutdown).toBe(0)
  })

  it('tras cancelar se puede volver a intentar', async () => {
    let answer = false
    const { quit, calls } = coordinator({ confirm: async () => answer })
    expect(await quit.requestQuit('app')).toBe(false)
    answer = true
    expect(await quit.requestQuit('app')).toBe(true)
    expect(calls.confirm).toBe(2)
    expect(calls.shutdown).toBe(1)
  })
})

describe('QUIT-02/04 — confirmar detiene una sola vez', () => {
  it('confirmar cierra el Engine y compromete la salida', async () => {
    const { quit, calls } = coordinator()
    await expect(quit.requestQuit('window-close')).resolves.toBe(true)
    expect(calls.shutdown).toBe(1)
    expect(calls.commit).toBe(1)
    expect(quit.isCommitted()).toBe(true)
  })

  it('el menú Salir usa la misma ruta', async () => {
    const { quit, calls } = coordinator()
    await quit.requestQuit('menu')
    expect(calls.confirm).toBe(1)
    expect(calls.shutdown).toBe(1)
  })

  it('sin nada que confirmar no se pregunta, pero sí se cierra', async () => {
    const { quit, calls } = coordinator({ shouldConfirm: () => false })
    await expect(quit.requestQuit('app')).resolves.toBe(true)
    expect(calls.confirm).toBe(0)
    expect(calls.shutdown).toBe(1)
  })
})

describe('QUIT-05/06 — peticiones simultáneas comparten una sola operación', () => {
  it('dos salidas a la vez preguntan y cierran una vez', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { quit, calls } = coordinator({
      confirm: async () => {
        await gate
        return true
      },
    })
    const first = quit.requestQuit('window-close')
    const second = quit.requestQuit('menu')
    release()
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(calls.confirm).toBe(1)
    expect(calls.shutdown).toBe(1)
    expect(calls.commit).toBe(1)
  })

  it('un quit que llega durante el shutdown espera al mismo', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { quit, calls } = coordinator({ shutdown: () => gate })
    const first = quit.requestQuit('app')
    await Promise.resolve()
    const second = quit.requestQuit('window-all-closed')
    release()
    await Promise.all([first, second])
    expect(calls.shutdown).toBe(1)
    expect(calls.commit).toBe(1)
  })
})

describe('QUIT-07 — una salida comprometida no vuelve a preguntar', () => {
  it('la siguiente petición pasa sin diálogo ni segundo cierre', async () => {
    const { quit, calls } = coordinator()
    await quit.requestQuit('menu')
    // `before-quit` se emite otra vez tras `app.quit()`: debe dejar pasar.
    await expect(quit.requestQuit('app')).resolves.toBe(true)
    expect(calls.confirm).toBe(1)
    expect(calls.shutdown).toBe(1)
    expect(calls.commit).toBe(1)
  })
})

describe('un cierre fallido no deja el coordinador bloqueado', () => {
  it('registra el error, no compromete y permite reintentar', async () => {
    let fails = true
    const { quit, calls } = coordinator({
      shutdown: async () => {
        if (fails) throw new Error('el Engine no respondió')
      },
    })
    await expect(quit.requestQuit('app')).resolves.toBe(false)
    expect(calls.commit).toBe(0)
    expect(quit.isCommitted()).toBe(false)
    expect(calls.errors).toHaveLength(1)

    fails = false
    await expect(quit.requestQuit('app')).resolves.toBe(true)
    expect(calls.commit).toBe(1)
  })
})

describe('cierre sin diálogo', () => {
  it('la sonda de paridad cierra el Engine sin preguntar', async () => {
    // Terminar el host no basta: su hijo sigue vivo si no se le cierra.
    const { quit, calls } = coordinator()
    await expect(quit.shutdownWithoutPrompt()).resolves.toBe(true)
    expect(calls.confirm).toBe(0)
    expect(calls.shutdown).toBe(1)
    expect(quit.isCommitted()).toBe(true)
  })

  it('si falla, lo dice y no se marca comprometido', async () => {
    const { quit, calls } = coordinator({
      shutdown: async () => {
        throw new Error('sin respuesta')
      },
    })
    await expect(quit.shutdownWithoutPrompt()).resolves.toBe(false)
    expect(quit.isCommitted()).toBe(false)
    expect(calls.errors).toHaveLength(1)
  })
})

describe('no hay bucle entre cerrar y salir', () => {
  it('el manejador de ventana deja pasar una vez comprometido', async () => {
    const { quit } = coordinator()
    const windowClose = vi.fn(async () => {
      if (quit.isCommitted()) return 'allow'
      return (await quit.requestQuit('window-close')) ? 'allow' : 'block'
    })
    expect(await windowClose()).toBe('allow')
    // Tras `app.quit()` la ventana recibe `close` otra vez.
    expect(await windowClose()).toBe('allow')
    expect(windowClose).toHaveBeenCalledTimes(2)
  })
})
