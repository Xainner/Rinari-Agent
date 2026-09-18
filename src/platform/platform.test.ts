// Documento 02 §3: el adaptador de plataforma. La suite no necesita Tauri ni
// Electron para ejercitar a quien consume el contrato.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DESKTOP_COMMANDS, platform, setPlatformForTests } from './index'
import { createTestBridge, type TestBridge } from './testBridge'

let bridge: TestBridge
let restore: () => void

beforeEach(() => {
  bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
})

afterEach(() => {
  restore()
})

describe('contrato de plataforma', () => {
  it('la lista de comandos sale del inventario y no tiene duplicados', () => {
    // Si alguien añade un comando al host sin regenerar, `parity:check` falla
    // antes que esto; aquí solo se comprueba que el generado es coherente.
    expect(DESKTOP_COMMANDS.length).toBeGreaterThan(100)
    expect(new Set(DESKTOP_COMMANDS).size).toBe(DESKTOP_COMMANDS.length)
    expect(DESKTOP_COMMANDS).toContain('engine_status')
    expect(DESKTOP_COMMANDS).toContain('turn_start')
  })

  it('`platform()` resuelve al puente instalado y se restaura al terminar', () => {
    expect(platform()).toBe(bridge)
    const inner = createTestBridge()
    const undo = setPlatformForTests(inner)
    expect(platform()).toBe(inner)
    undo()
    expect(platform()).toBe(bridge)
  })
})

describe('testBridge', () => {
  it('registra las llamadas con sus argumentos', async () => {
    bridge.mockCommand('session_get', (args) => ({ id: args.session_id }))
    await expect(platform().command('session_get', { session_id: 'ses_a' })).resolves.toEqual({ id: 'ses_a' })
    expect(bridge.calls).toEqual([{ name: 'session_get', args: { session_id: 'ses_a' } }])
  })

  it('falla en un comando no preparado en vez de inventar una respuesta', async () => {
    // Un doble que devuelve `undefined` convierte un fallo de integración en
    // un test verde: mejor que reviente y se vea cuál falta.
    await expect(platform().command('session_list')).rejects.toThrow(/no está preparado/)
  })

  it('entrega eventos del Engine y deja de hacerlo tras darse de baja', async () => {
    const seen: string[] = []
    const stop = await platform().events.onEngineEvent((event) => seen.push(event.event))
    bridge.emitEngineEvent({ type: 'event', event: 'turn.completed', payload: {} })
    stop()
    bridge.emitEngineEvent({ type: 'event', event: 'turn.started', payload: {} })
    expect(seen).toEqual(['turn.completed'])
  })

  it('un diálogo cancelado devuelve null, no una lista vacía', async () => {
    bridge.nextFileSelection = null
    await expect(platform().dialog.openFiles({ directory: true })).resolves.toBeNull()
    bridge.nextFileSelection = ['C:/repo']
    await expect(platform().dialog.openFiles({ directory: true })).resolves.toEqual(['C:/repo'])
  })

  it('el menú contextual conserva roles y acciones propias', async () => {
    const run = vi.fn()
    await platform().contextMenu.show(
      [
        { kind: 'role', role: 'copy', text: 'Copiar' },
        { kind: 'action', text: 'Nueva conversación', run },
      ],
      { x: 12, y: 34 },
    )
    expect(bridge.menus).toHaveLength(1)
    expect(bridge.menus[0].position).toEqual({ x: 12, y: 34 })
    const [role, action] = bridge.menus[0].items
    expect(role).toMatchObject({ kind: 'role', role: 'copy' })
    expect(action.kind).toBe('action')
    if (action.kind === 'action') action.run()
    expect(run).toHaveBeenCalledOnce()
  })

  it('sin host, `isDesktop()` es falso y nadie simula un Engine conectado', () => {
    bridge.desktop = false
    expect(platform().isDesktop()).toBe(false)
  })
})
