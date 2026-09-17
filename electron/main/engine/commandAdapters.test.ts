// TR-01..TR-09: semántica de los handlers que no se pueden generar.
//
// Estas pruebas comprueban **comportamiento**, no que el método exista. Cada
// caso corresponde a un handler Rust que ramifica o construye sus parámetros
// con lógica propia, y que el generador se niega a adivinar.
import { describe, expect, it } from 'vitest'

import { COMMAND_ADAPTERS } from './commandAdapters'
import { COMMAND_MAP, translateCommand } from './translateCommand'

describe('cobertura de los adaptadores manuales', () => {
  it('todo comando marcado manual tiene su adaptador escrito', () => {
    const marcados = Object.entries(COMMAND_MAP)
      .filter(([, translation]) => translation.manual)
      .map(([name]) => name)
    const sinAdaptador = marcados.filter((name) => !COMMAND_ADAPTERS[name])
    expect(sinAdaptador).toEqual([])
    expect(marcados.length).toBeGreaterThanOrEqual(10)
  })

  it('no hay adaptadores huérfanos que el mapa no reconozca', () => {
    const sobrantes = Object.keys(COMMAND_ADAPTERS).filter((name) => !COMMAND_MAP[name]?.manual)
    expect(sobrantes).toEqual([])
  })
})

describe('TR-01 — mcp_set_enabled elige método, no parámetro', () => {
  it('true habilita y false deshabilita', () => {
    // El mapa generado apuntaba siempre a `mcp.enable`: deshabilitar habilitaba.
    expect(translateCommand('mcp_set_enabled', { name: 'srv', enabled: true })).toEqual({
      method: 'mcp.enable',
      params: { name: 'srv' },
    })
    expect(translateCommand('mcp_set_enabled', { name: 'srv', enabled: false })).toEqual({
      method: 'mcp.disable',
      params: { name: 'srv' },
    })
  })
})

describe('TR-02 — plugin_set_enabled', () => {
  it('true habilita y false deshabilita', () => {
    expect(translateCommand('plugin_set_enabled', { name: 'p', enabled: true }).method).toBe('plugin.enable')
    expect(translateCommand('plugin_set_enabled', { name: 'p', enabled: false }).method).toBe('plugin.disable')
  })
})

describe('TR-03 — session_create conserva el proyecto', () => {
  it('con project_id manda la forma del proyecto', () => {
    // Boards crea paneles por proyecto: perder `project_id` crea la sesión
    // fuera del proyecto esperado.
    expect(
      translateCommand('session_create', { project_id: 'prj_1', title: 'demo', mode: 'build' }),
    ).toEqual({
      method: 'session.create',
      params: { project_id: 'prj_1', title: 'demo', mode: 'build', permission_profile: null },
    })
  })

  it('conserva permission_profile', () => {
    const conProyecto = translateCommand('session_create', {
      project_id: 'prj_1',
      permission_profile: 'read-only',
    })
    expect(conProyecto.params).toMatchObject({ permission_profile: 'read-only' })
    const sinProyecto = translateCommand('session_create', { chat: true, permission_profile: 'read-only' })
    expect(sinProyecto.params).toMatchObject({ permission_profile: 'read-only' })
  })

  it('sin proyecto omite lo ausente y `chat` va siempre', () => {
    expect(translateCommand('session_create', {})).toEqual({
      method: 'session.create',
      params: { chat: false },
    })
    expect(translateCommand('session_create', { cwd: 'C:/demo', chat: true }).params).toEqual({
      cwd: 'C:/demo',
      chat: true,
    })
  })
})

describe('TR-04 — provider_update manda solo el patch', () => {
  it('un campo solo no arrastra los demás', () => {
    expect(translateCommand('provider_update', { reference: 'p1', alias: 'nuevo' })).toEqual({
      method: 'provider.update',
      params: { ref: 'p1', alias: 'nuevo' },
    })
    expect(translateCommand('provider_update', { reference: 'p1', endpoint: 'http://x/v1' }).params).toEqual({
      ref: 'p1',
      endpoint: 'http://x/v1',
    })
  })

  it('varios campos viajan juntos y `ref` siempre', () => {
    const call = translateCommand('provider_update', {
      reference: 'p1',
      secret: 's',
      settings: { protocol: 'openai-compatible' },
    })
    expect(call.params).toEqual({ ref: 'p1', secret: 's', settings: { protocol: 'openai-compatible' } })
  })

  it('no manda nulos por los campos que no se tocan', () => {
    const params = translateCommand('provider_update', { reference: 'p1', alias: 'x' }).params!
    for (const key of ['endpoint', 'account_hint', 'secret', 'secret_env', 'settings']) {
      expect(params).not.toHaveProperty(key)
    }
  })
})

describe('TR-05 — peer_message_forward conserva la procedencia', () => {
  it('lleva origen y cita intactos', () => {
    expect(
      translateCommand('peer_message_forward', {
        target_session_id: 'ses_b',
        message: 'revisar',
        source_session_id: 'ses_a',
        quoted_source: { session_id: 'ses_a', turn_id: 'turn_1' },
      }),
    ).toEqual({
      method: 'session.peer_message.forward',
      params: {
        target_session_id: 'ses_b',
        message: 'revisar',
        source_session_id: 'ses_a',
        quoted_source: { session_id: 'ses_a', turn_id: 'turn_1' },
      },
    })
  })

  it('sin procedencia no inventa claves', () => {
    expect(translateCommand('peer_message_forward', { target_session_id: 'b', message: 'x' }).params).toEqual({
      target_session_id: 'b',
      message: 'x',
    })
  })
})

describe('TR-06 — session_timeline pagina', () => {
  it('manda before_turn_index y limit', () => {
    expect(translateCommand('session_timeline', { reference: 's1', before_turn_index: 50, limit: 20 })).toEqual(
      { method: 'session.timeline', params: { ref: 's1', before_turn_index: 50, limit: 20 } },
    )
  })

  it('sin paginación solo va la referencia', () => {
    expect(translateCommand('session_timeline', { reference: 's1' }).params).toEqual({ ref: 's1' })
  })
})

describe('TR-07 — attachment_preview', () => {
  it('max_bytes y max_dimension viajan los dos', () => {
    expect(translateCommand('attachment_preview', { uri: 'artifact://x', max_bytes: 1000, max_dimension: 512 })).toEqual(
      { method: 'attachment.preview', params: { uri: 'artifact://x', max_dimension: 512, max_bytes: 1000 } },
    )
  })
})

describe('TR-08 — workspace_process_list pagina', () => {
  it('cursor y limit llegan al Engine', () => {
    expect(
      translateCommand('workspace_process_list', { session_id: 'ses', cursor: 'abc', limit: 25 }),
    ).toEqual({
      method: 'workspace.process.list',
      params: { session_id: 'ses', cursor: 'abc', limit: 25 },
    })
  })

  it('un id concreto no se pierde', () => {
    expect(translateCommand('workspace_process_list', { session_id: 'ses', id: 'proc' }).params).toEqual({
      session_id: 'ses',
      id: 'proc',
    })
  })
})

describe('TR-09 — workspace_process_stop conserva la identidad', () => {
  it('manda engine_instance_id y generation', () => {
    // `process_identity_v1`: sin esto se podría detener un proceso de otra
    // generación que reutilizó el mismo id.
    expect(
      translateCommand('workspace_process_stop', {
        session_id: 'ses',
        id: 'proc',
        engine_instance_id: 'engine-a',
        generation: 7,
      }),
    ).toEqual({
      method: 'workspace.process.stop',
      params: { session_id: 'ses', id: 'proc', engine_instance_id: 'engine-a', generation: 7 },
    })
  })

  it('sin identidad se omite, para no romper un Engine antiguo', () => {
    expect(translateCommand('workspace_process_stop', { session_id: 'ses', id: 'proc' }).params).toEqual({
      session_id: 'ses',
      id: 'proc',
    })
  })
})

describe('peer_group_get manda una sola clave, por precedencia', () => {
  it('group_id gana a session_id y este a board_id', () => {
    expect(translateCommand('peer_group_get', { board_id: 'b', session_id: 's', group_id: 'g' }).params).toEqual(
      { group_id: 'g' },
    )
    expect(translateCommand('peer_group_get', { board_id: 'b', session_id: 's' }).params).toEqual({
      session_id: 's',
    })
    expect(translateCommand('peer_group_get', { board_id: 'b' }).params).toEqual({ board_id: 'b' })
  })
})
