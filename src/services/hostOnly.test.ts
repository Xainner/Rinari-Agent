// HOST-01..05: las operaciones del host recorren el camino real de React.
//
// El bug que estas pruebas fijan: `engineApi.start()` pasaba por
// `platform().command('engine_start')`, y `engine_start` no es un método del
// protocolo, así que la traducción del host Electron lo rechazaba. La sonda de
// paridad no lo veía porque llamaba al preload directamente.
//
// Por eso se ejercita `engineApi`/`desktopApi` —lo que usa la aplicación—, no
// el puente por debajo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ENGINE_BACKED_COMMANDS, HOST_ONLY_COMMANDS, setPlatformForTests } from '../platform'
import { createTestBridge, type TestBridge } from '../platform/testBridge'
import { engineApi } from './engine'
import { desktopApi } from './desktop'

let bridge: TestBridge
let restore: () => void

beforeEach(() => {
  bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
})

afterEach(() => {
  restore()
})

describe('separación host-only / Engine', () => {
  it('ningún comando del host está entre los que viajan por command()', () => {
    const solapados = ENGINE_BACKED_COMMANDS.filter((name) =>
      (HOST_ONLY_COMMANDS as readonly string[]).includes(name),
    )
    expect(solapados).toEqual([])
  })

  it('los host-only son exactamente los seis que no hablan por el protocolo', () => {
    expect([...HOST_ONLY_COMMANDS].sort()).toEqual([
      'engine_restart',
      'engine_shutdown',
      'engine_start',
      'engine_status',
      'initial_open_request',
      'workspace_file_open',
    ])
  })
})

describe('HOST-01/02/03 — ciclo de vida del Engine', () => {
  it('start no pasa por command(): usa la intención del host', async () => {
    const status = await engineApi.start()
    expect(status.state).toBe('ready')
    expect(bridge.engineCalls).toEqual(['start'])
    // Si hubiera ido por `command()`, aquí habría una llamada registrada y
    // bajo Electron habría fallado al no existir método que traducir.
    expect(bridge.calls).toEqual([])
  })

  it('status reporta lo que dice el host', async () => {
    await engineApi.start()
    const status = await engineApi.status()
    expect(status.state).toBe('ready')
    expect(bridge.engineCalls).toEqual(['start', 'status'])
  })

  it('shutdown deja stopped y restart vuelve a ready', async () => {
    await engineApi.start()
    expect((await engineApi.shutdown()).state).toBe('stopped')
    expect((await engineApi.restart()).state).toBe('ready')
    expect(bridge.engineCalls).toEqual(['start', 'shutdown', 'restart'])
  })
})

describe('HOST-04 — handoff del arranque en frío', () => {
  it('usa la misma API que consume App.tsx', async () => {
    bridge.initialHandoff = { project: 'C:/demo', session: null }
    await expect(engineApi.initialOpenRequest()).resolves.toEqual({ project: 'C:/demo', session: null })
    expect(bridge.calls).toEqual([])
  })
})

describe('HOST-05 — abrir un archivo del workspace', () => {
  it('va por la intención del host, no por un método del Engine', async () => {
    // La ruta la valida el Engine antes de abrirse; el renderer no decide
    // qué se abre con la aplicación del sistema.
    await desktopApi.openFile('ses_a', 'src/main.rs', 'turn_1')
    expect(bridge.openedFiles).toEqual([{ session_id: 'ses_a', path: 'src/main.rs', turn_id: 'turn_1' }])
    expect(bridge.calls).toEqual([])
  })
})

describe('los comandos del Engine sí pasan por command()', () => {
  it('session_list viaja como llamada de dominio', async () => {
    bridge.mockCommand('session_list', () => ({ sessions: [] }))
    await engineApi.sessions()
    expect(bridge.calls.map((entry) => entry.name)).toEqual(['session_list'])
    expect(bridge.engineCalls).toEqual([])
  })
})
