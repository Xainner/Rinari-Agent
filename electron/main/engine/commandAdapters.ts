/**
 * Traducciones que **no** se generan (documento 02 §2, regla fail-closed).
 *
 * Un handler que ramifica, que arma sus parámetros según qué argumentos
 * llegaron o que renombra con lógica propia no es una tabla de claves: el
 * generador se niega a adivinarlo y marca el comando como `manual`, y aquí se
 * escribe leyendo su Rust.
 *
 * La regla que gobierna todo esto: **una clave ausente se omite**, no se envía
 * nula. El Engine rechaza nulos explícitos en parámetros tipados como `limit`,
 * y omitir es lo que hacía el host anterior.
 */

import type { EngineCall } from './translateCommand'

type Args = Record<string, unknown>

/** Copia `key` solo si el argumento vino con valor. */
function put(params: Args, args: Args, key: string, as = key): void {
  const value = args[key]
  if (value !== undefined && value !== null) params[as] = value
}

export const COMMAND_ADAPTERS: Record<string, (args: Args) => EngineCall> = {
  /**
   * Ramifica: `enabled` elige el método, no un parámetro. Generado apuntaba
   * siempre a `mcp.enable`, así que **deshabilitar habilitaba**.
   */
  mcp_set_enabled: (args) => ({
    method: args.enabled ? 'mcp.enable' : 'mcp.disable',
    params: { name: args.name },
  }),

  /** Mismo caso que MCP. */
  plugin_set_enabled: (args) => ({
    method: args.enabled ? 'plugin.enable' : 'plugin.disable',
    params: { name: args.name },
  }),

  /**
   * Dos formas distintas según haya proyecto.
   *
   * Con `project_id` el host anterior manda un objeto literal donde `title`,
   * `mode` y `permission_profile` **viajan aunque sean nulos**, y sin `cwd`
   * ni `chat`. Sin proyecto, arma el objeto omitiendo lo ausente y `chat`
   * siempre presente con `false` por defecto. Boards crea paneles por
   * `project_id`: perderlo crea la sesión fuera del proyecto.
   */
  session_create: (args) => {
    if (args.project_id !== undefined && args.project_id !== null) {
      return {
        method: 'session.create',
        params: {
          project_id: args.project_id,
          title: args.title ?? null,
          mode: args.mode ?? null,
          permission_profile: args.permission_profile ?? null,
        },
      }
    }
    const params: Args = {}
    put(params, args, 'cwd')
    params.chat = args.chat === undefined || args.chat === null ? false : args.chat
    put(params, args, 'title')
    put(params, args, 'mode')
    put(params, args, 'permission_profile')
    return { method: 'session.create', params }
  },

  /** Patch parcial: solo lo presente, y `ref` siempre. */
  provider_update: (args) => {
    const params: Args = { ref: args.reference }
    for (const key of ['alias', 'endpoint', 'account_hint', 'secret', 'secret_env', 'settings']) {
      put(params, args, key)
    }
    return { method: 'provider.update', params }
  },

  /**
   * Procedencia de Boards: `source_session_id` y `quoted_source` son parte de
   * la UX del reenvío manual, no adorno.
   */
  peer_message_forward: (args) => {
    const params: Args = { target_session_id: args.target_session_id, message: args.message }
    put(params, args, 'source_session_id')
    put(params, args, 'quoted_source')
    return { method: 'session.peer_message.forward', params }
  },

  /**
   * Precedencia, no unión: el host anterior usa `else if` y manda **una**
   * clave. Mandar las tres cambiaría a qué grupo resuelve el Engine.
   */
  peer_group_get: (args) => {
    for (const key of ['group_id', 'session_id', 'board_id']) {
      const value = args[key]
      if (typeof value === 'string' && value) return { method: 'session.peer_group.get', params: { [key]: value } }
    }
    return { method: 'session.peer_group.get', params: {} }
  },

  session_timeline: (args) => {
    const params: Args = { ref: args.reference }
    put(params, args, 'before_turn_index')
    put(params, args, 'limit')
    return { method: 'session.timeline', params }
  },

  attachment_preview: (args) => {
    const params: Args = { uri: args.uri }
    put(params, args, 'max_dimension')
    put(params, args, 'max_bytes')
    return { method: 'attachment.preview', params }
  },

  /** Paginación real: `cursor` y `limit` no pueden perderse. */
  workspace_process_list: (args) => {
    const params: Args = { session_id: args.session_id }
    put(params, args, 'id')
    put(params, args, 'cursor')
    put(params, args, 'limit')
    return { method: 'workspace.process.list', params }
  },

  /**
   * `process_identity_v1`: `engine_instance_id` y `generation` son la
   * precondición que impide detener un recurso de otra generación. Se omiten
   * si faltan, para que un Engine antiguo siga funcionando.
   */
  workspace_process_stop: (args) => {
    const params: Args = { session_id: args.session_id }
    put(params, args, 'id')
    put(params, args, 'engine_instance_id')
    put(params, args, 'generation')
    return { method: 'workspace.process.stop', params }
  },
}
