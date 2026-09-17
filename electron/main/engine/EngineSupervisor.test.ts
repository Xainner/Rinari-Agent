// Ciclo de vida del Engine (documento 02 §4.1 y §4.3) contra el Engine falso.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { EngineSupervisor, EngineCommandError, deadlineFor } from './EngineSupervisor'
import {
  ENV_ENGINE_ARGS,
  ENV_ENGINE_ARGS_JSON,
  ENV_ENGINE_BIN,
  ENV_ENGINE_CWD,
  EngineNotFound,
  locateEngine,
} from './engineLocator'

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fakeEngine.mjs')
const started: EngineSupervisor[] = []

function supervisor() {
  const events: string[] = []
  const statuses: string[] = []
  const engine = new EngineSupervisor({
    onEvent: (event) => events.push(event.event),
    onStatus: (status) => statuses.push(status.state),
  })
  started.push(engine)
  return { engine, events, statuses }
}

// El escenario viaja por el entorno del proceso padre; el hijo lo hereda.
function fakeCommand() {
  return { program: process.execPath, args: [FAKE], source: 'env' as const }
}

async function withScenario<T>(scenario: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.RINARI_FAKE_SCENARIO
  process.env.RINARI_FAKE_SCENARIO = scenario
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.RINARI_FAKE_SCENARIO
    else process.env.RINARI_FAKE_SCENARIO = previous
  }
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((engine) => engine.shutdown()))
})

describe('resolución del ejecutable', () => {
  it('en producción sin sidecar falla con un mensaje accionable, no cae al PATH', () => {
    // Arrancar otro `rinari` del PATH cambiaría esquema, capabilities y home.
    expect(() => locateEngine({ packaged: true, env: {} })).toThrow(EngineNotFound)
    try {
      locateEngine({ packaged: true, env: {} })
    } catch (error) {
      expect((error as EngineNotFound).message).toContain('Reinstall Rinari Agent')
      expect((error as EngineNotFound).code).toBe('ENGINE_NOT_FOUND')
    }
  })

  it('en desarrollo cae al `rinari` del PATH', () => {
    const command = locateEngine({ packaged: false, env: {} })
    expect(command).toMatchObject({ program: 'rinari', args: ['engine', '--stdio'], source: 'path' })
  })

  it('el override explícito manda y conserva el contrato de argumentos', () => {
    const command = locateEngine({
      packaged: true,
      env: { [ENV_ENGINE_BIN]: 'uv', [ENV_ENGINE_ARGS]: 'run rinari', [ENV_ENGINE_CWD]: 'C:/repo' },
    })
    expect(command).toMatchObject({
      program: 'uv',
      args: ['run', 'rinari', 'engine', '--stdio'],
      cwd: 'C:/repo',
      source: 'env',
    })
  })

  it('la forma estructurada admite rutas con espacios', () => {
    // `RINARI_ENGINE_ARGS` separa por espacios y no puede con esto.
    const command = locateEngine({
      packaged: false,
      env: {
        [ENV_ENGINE_BIN]: 'python',
        [ENV_ENGINE_ARGS_JSON]: JSON.stringify(['-m', 'C:/Program Files/rinari']),
      },
    })
    expect(command.args).toEqual(['-m', 'C:/Program Files/rinari', 'engine', '--stdio'])
  })

  it('un JSON inválido en la forma estructurada se dice, no se ignora', () => {
    expect(() =>
      locateEngine({ packaged: false, env: { [ENV_ENGINE_BIN]: 'x', [ENV_ENGINE_ARGS_JSON]: '{no' } }),
    ).toThrow(/is not valid JSON/)
    expect(() =>
      locateEngine({ packaged: false, env: { [ENV_ENGINE_BIN]: 'x', [ENV_ENGINE_ARGS_JSON]: '"solo"' } }),
    ).toThrow(/array of strings/)
  })
})

describe('plazos por método', () => {
  it('conserva la diferenciación en vez de aplanar a 60 s', () => {
    expect(deadlineFor('project.status')).toBe(5_000)
    expect(deadlineFor('session.turn.start')).toBe(5_000)
    expect(deadlineFor('session.list')).toBe(10_000)
    expect(deadlineFor('session.history')).toBe(10_000)
    expect(deadlineFor('workspace.file.read')).toBe(60_000)
  })
})

describe('ciclo de vida', () => {
  it('arranca en stopped y llega a ready pasando por handshaking', async () => {
    const { engine, statuses } = supervisor()
    expect(engine.status().state).toBe('stopped')
    await withScenario('default', () => engine.startWithCommand(fakeCommand()))
    expect(engine.status().state).toBe('ready')
    expect(engine.status().engine_version).toBe('fake-1.0')
    expect(engine.status().home_id).toBe('home_fake')
    expect(statuses).toContain('handshaking')
  })

  it('arrancar dos veces no lanza un segundo proceso', async () => {
    const { engine } = supervisor()
    await withScenario('default', () => engine.startWithCommand(fakeCommand()))
    const again = await engine.startWithCommand(fakeCommand())
    expect(again.state).toBe('ready')
  })

  it('un engine sin las capabilities exigidas se rechaza al conectar', async () => {
    const { engine } = supervisor()
    // `outdated` recorta el hello a chat y projects.
    const error = await withScenario('outdated', () =>
      engine.startWithCommand(fakeCommand()).catch((reason: EngineCommandError) => reason),
    )
    expect(error).toBeInstanceOf(EngineCommandError)
    expect((error as EngineCommandError).code).toBe('ENGINE_INCOMPATIBLE')
    expect(engine.status().state).toBe('failed')
    expect(engine.status().detail).toContain('outdated')
  })

  it('el cierre deja el estado en stopped y sin versión', async () => {
    const { engine } = supervisor()
    await withScenario('default', () => engine.startWithCommand(fakeCommand()))
    await engine.shutdown()
    expect(engine.status().state).toBe('stopped')
    expect(engine.status().engine_version).toBeNull()
  })

  it('una petición sin engine falla con ENGINE_DOWN', async () => {
    const { engine } = supervisor()
    const error = await engine.request('session.list').catch((reason: EngineCommandError) => reason)
    expect((error as EngineCommandError).code).toBe('ENGINE_DOWN')
  })

  it('los eventos del Engine llegan por el canal del supervisor', async () => {
    // Un solo canal hacia el store de runtime: no un lector por panel.
    const { engine, events } = supervisor()
    await withScenario('default', () => engine.startWithCommand(fakeCommand()))
    await engine.request('with_events')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(events).toEqual(['model.content.delta', 'model.content.delta'])
  })

  it('si el proceso muere, el estado deja de ser ready', async () => {
    // La UI no puede seguir marcando «ready» tras un exit (§4.3).
    const { engine, statuses } = supervisor()
    await withScenario('default', () => engine.startWithCommand(fakeCommand()))
    expect(engine.status().state).toBe('ready')
    await engine.request('exit').catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(engine.status().state).toBe('degraded')
    expect(engine.status().detail).toBe('engine process exited')
    expect(statuses).toContain('degraded')
  })

  it('reiniciar deja un engine utilizable', async () => {
    const { engine } = supervisor()
    await withScenario('default', () => engine.startWithCommand(fakeCommand()))
    await engine.shutdown()
    await withScenario('default', () => engine.startWithCommand(fakeCommand()))
    expect(engine.status().state).toBe('ready')
    await expect(engine.request('echo', { ok: 1 })).resolves.toBeTruthy()
  })
})
