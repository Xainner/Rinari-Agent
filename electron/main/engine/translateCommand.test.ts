// Traducción comando → método del protocolo (documento 02 §2).
import { describe, expect, it } from 'vitest'

import { ENGINE_METHODS } from '../../../src/types/protocol.generated'
import { DESKTOP_COMMANDS } from '../../../src/platform/commands.generated'
import { COMMAND_MAP, UnknownCommand, translateCommand } from './translateCommand'

/** Los que no hablan por el protocolo: canales propios del host. */
const HOST_ONLY = new Set([
  'engine_status',
  'engine_start',
  'engine_shutdown',
  'engine_restart',
  'initial_open_request',
  'migration_export',
  'workspace_file_open',
])

describe('cobertura de la tabla', () => {
  it('cubre todos los comandos salvo los del host', () => {
    const faltan = DESKTOP_COMMANDS.filter((name) => !HOST_ONLY.has(name) && !COMMAND_MAP[name])
    expect(faltan).toEqual([])
  })

  it('no inventa métodos: todos existen en el protocolo del Engine', () => {
    const conocidos = new Set<string>(ENGINE_METHODS)
    const inventados = Object.entries(COMMAND_MAP)
      .filter(([, translation]) => !conocidos.has(translation.method))
      .map(([name, translation]) => `${name} -> ${translation.method}`)
    expect(inventados).toEqual([])
  })

  it('no traduce un comando que el host no expone', () => {
    expect(() => translateCommand('rm_minus_rf')).toThrow(UnknownCommand)
  })
})

describe('renombrado de argumentos', () => {
  it('`reference` viaja como `ref`', () => {
    // Si se enviara `reference`, el Engine no encontraría la sesión.
    expect(translateCommand('session_get', { reference: 'ses_a' })).toEqual({
      method: 'session.get',
      params: { ref: 'ses_a' },
    })
  })

  it('`provider_type` viaja como `type`', () => {
    const call = translateCommand('provider_create', { alias: 'local', provider_type: 'openai_compatible' })
    expect(call.method).toBe('provider.create')
    expect(call.params).toEqual({ alias: 'local', type: 'openai_compatible' })
  })

  it('lo que no se renombra pasa con su nombre', () => {
    expect(translateCommand('turn_start', { session_id: 'ses_a', message: 'hola' })).toEqual({
      method: 'session.turn.start',
      params: { session_id: 'ses_a', message: 'hola', allow_unconfirmed_vision: false },
    })
  })
})

describe('ausencias y valores por defecto', () => {
  it('una clave ausente se omite, no se envía nula', () => {
    // El Engine distingue «no me lo dijiste» de «me dijiste nulo».
    const call = translateCommand('session_history', { reference: 'ses_a' })
    expect(call.params).toEqual({ ref: 'ses_a' })
    expect(call.params).not.toHaveProperty('limit')
  })

  it('conserva el valor por defecto que ponía el host anterior', () => {
    const call = translateCommand('session_list', {})
    expect(call.params).toEqual({ include_closed: false })
  })

  it('un argumento dado gana al valor por defecto', () => {
    const call = translateCommand('session_list', { include_closed: true, kind: 'CHAT' })
    expect(call.params).toEqual({ include_closed: true, kind: 'CHAT' })
  })

  it('un comando sin parámetros no envía un objeto vacío', () => {
    expect(translateCommand('agent_list')).toEqual({ method: 'agent.list' })
  })
})

describe('casos que no son un mapeo de claves', () => {
  it('`settings` es el objeto de parámetros entero, sin envolver', () => {
    const settings = { max_tokens: 1000, strategy: 'auto' }
    expect(translateCommand('context_settings_set', { settings })).toEqual({
      method: 'context.settings.set',
      params: settings,
    })
  })

  it('peer_group_get manda una sola clave, por precedencia', () => {
    // El host anterior usa `else if`: group_id gana a session_id y este a
    // board_id. Mandar las tres cambiaría a qué grupo resuelve el Engine.
    expect(translateCommand('peer_group_get', { board_id: 'b1', session_id: 's1', group_id: 'g1' })).toEqual({
      method: 'session.peer_group.get',
      params: { group_id: 'g1' },
    })
    expect(translateCommand('peer_group_get', { board_id: 'b1', session_id: 's1' }).params).toEqual({
      session_id: 's1',
    })
    expect(translateCommand('peer_group_get', { board_id: 'b1' }).params).toEqual({ board_id: 'b1' })
  })
})
