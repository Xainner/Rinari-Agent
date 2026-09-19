// Generado por `npm run parity:inventory`. No editar a mano.
// Documento 02 §2: el nombre del comando no es el método del protocolo y
// sus argumentos se renombran por el camino (`reference` viaja como `ref`).

/** Cómo un argumento del renderer llega al Engine. */
export interface ParamBinding {
  /** Clave con la que el Engine lo recibe. */
  key: string
  /** Argumento del renderer del que sale; `null` si es un valor fijo. */
  from: string | null
  /** Se omite cuando falta, en vez de enviarse nulo. */
  optional: boolean
  /** Valor que ponía el host anterior cuando el argumento faltaba. */
  fallback?: boolean | string
}

export interface CommandTranslation {
  method: string
  params: ParamBinding[]
  /** El argumento nombrado **es** el objeto de parámetros, sin envolver. */
  passthrough?: string
  /**
   * El handler ramifica o construye sus parámetros con lógica propia: la
   * traducción se escribe a mano en `commandAdapters.ts` y este mapa solo
   * dice que existe. Generarla adivinando invertiría la semántica.
   */
  manual?: true
}

export const COMMAND_MAP: Record<string, CommandTranslation> = {
  agent_config_get: { method: 'agent.config.get', params: [{ key: 'agent', from: 'agent', optional: false }] },
  agent_config_set: { method: 'agent.config.set', params: [{ key: 'agent', from: 'agent', optional: false }, { key: 'model', from: 'model', optional: false }, { key: 'fallback', from: 'fallback', optional: false }, { key: 'enabled', from: 'enabled', optional: false }, { key: 'clear', from: 'clear', optional: false }] },
  agent_list: { method: 'agent.list', params: [] },
  approval_resolve: { method: 'approval.resolve', params: [{ key: 'approval_id', from: 'approval_id', optional: false }, { key: 'decision', from: 'decision', optional: false }] },
  artifact_list: { method: 'artifact.list', params: [{ key: 'session_id', from: 'session_id', optional: true }] },
  artifact_read: { method: 'artifact.read', params: [{ key: 'uri', from: 'uri', optional: false }, { key: 'max_bytes', from: 'max_bytes', optional: true }] },
  attachment_prepare: { method: 'attachment.prepare', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'attachments', from: 'attachments', optional: false }] },
  attachment_prepare_cancel: { method: 'attachment.prepare.cancel', params: [{ key: 'job_id', from: 'job_id', optional: false }] },
  attachment_prepare_get: { method: 'attachment.prepare.get', params: [{ key: 'job_id', from: 'job_id', optional: false }] },
  attachment_prepare_start: { method: 'attachment.prepare.start', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'attachments', from: 'attachments', optional: false }] },
  attachment_preview: { method: 'attachment.preview', params: [], manual: true },
  browser_view_get: { method: 'browser.view.get', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'target_id', from: 'target_id', optional: false }] },
  bundle_apply: { method: 'profile_bundle.apply', params: [{ key: 'id', from: 'id', optional: false }, { key: 'session_ref', from: 'session_ref', optional: true }] },
  bundle_create: { method: 'profile_bundle.create', params: [{ key: 'id', from: 'id', optional: false }, { key: 'name', from: 'name', optional: false }, { key: 'description', from: 'description', optional: true }, { key: 'soul_id', from: 'soul_id', optional: true }, { key: 'mode', from: 'mode', optional: true }, { key: 'agents', from: 'agents', optional: true }] },
  bundle_list: { method: 'profile_bundle.list', params: [] },
  bundle_remove: { method: 'profile_bundle.remove', params: [{ key: 'id', from: 'id', optional: false }] },
  checkpoint_list: { method: 'checkpoint.list', params: [{ key: 'path', from: 'path', optional: true }] },
  checkpoint_restore: { method: 'checkpoint.restore', params: [{ key: 'path', from: 'path', optional: false }, { key: 'checkpoint_id', from: 'checkpoint_id', optional: false }, { key: 'preview', from: 'preview', optional: false }, { key: 'allow_mixed', from: 'allow_mixed', optional: false }] },
  checkpoint_show: { method: 'checkpoint.show', params: [{ key: 'checkpoint_id', from: 'checkpoint_id', optional: false }] },
  context_compact: { method: 'context.compact', params: [{ key: 'session_id', from: 'session_id', optional: false }] },
  context_get: { method: 'context.get', params: [{ key: 'ref', from: 'reference', optional: false }] },
  context_settings_get: { method: 'context.settings.get', params: [] },
  context_settings_set: { method: 'context.settings.set', params: [], passthrough: 'settings' },
  context_status: { method: 'context.status', params: [{ key: 'model_id', from: 'model_id', optional: false }] },
  flow_get: { method: 'flow.get', params: [{ key: 'project_id', from: 'project_id', optional: false }, { key: 'session_id', from: 'session_id', optional: false }] },
  mcp_create: { method: 'mcp.create', params: [{ key: 'name', from: 'name', optional: false }, { key: 'command', from: 'command', optional: false }] },
  mcp_get: { method: 'mcp.get', params: [{ key: 'name', from: 'name', optional: false }] },
  mcp_list: { method: 'mcp.list', params: [] },
  mcp_remove: { method: 'mcp.remove', params: [{ key: 'name', from: 'name', optional: false }] },
  mcp_set_enabled: { method: 'mcp.enable', params: [], manual: true },
  mcp_test: { method: 'mcp.test', params: [{ key: 'name', from: 'name', optional: false }] },
  model_add: { method: 'model.add', params: [{ key: 'provider', from: 'provider', optional: false }, { key: 'provider_model_id', from: 'provider_model_id', optional: false }, { key: 'alias', from: 'alias', optional: false }, { key: 'capabilities', from: 'capabilities', optional: false }, { key: 'settings', from: 'settings', optional: false }] },
  model_alias: { method: 'model.alias', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'new_alias', from: 'new_alias', optional: false }, { key: 'provider', from: 'provider', optional: false }] },
  model_discover: { method: 'model.discover', params: [{ key: 'provider', from: 'provider', optional: false }] },
  model_discovery_start: { method: 'model.discovery.start', params: [{ key: 'provider', from: 'provider', optional: false }] },
  model_get: { method: 'model.get', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'provider', from: 'provider', optional: false }] },
  model_list: { method: 'model.list', params: [{ key: 'provider', from: 'provider', optional: false }] },
  model_refresh: { method: 'model.refresh', params: [{ key: 'provider', from: 'provider', optional: false }] },
  model_remove: { method: 'model.remove', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'provider', from: 'provider', optional: false }] },
  model_test: { method: 'model.test', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'provider', from: 'provider', optional: false }] },
  model_use: { method: 'model.use', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'provider', from: 'provider', optional: false }] },
  peer_group_get: { method: 'session.peer_group.get', params: [], manual: true },
  peer_group_revoke: { method: 'session.peer_group.revoke', params: [{ key: 'group_id', from: 'group_id', optional: false }] },
  peer_group_set: { method: 'session.peer_group.set', params: [{ key: 'board_id', from: 'board_id', optional: false }, { key: 'expected_revision', from: 'expected_revision', optional: false }, { key: 'enabled', from: 'enabled', optional: false }, { key: 'members', from: 'members', optional: false }, { key: 'group_id', from: 'group_id', optional: true }] },
  peer_message_cancel: { method: 'session.peer_message.cancel', params: [{ key: 'message_id', from: 'message_id', optional: false }] },
  peer_message_forward: { method: 'session.peer_message.forward', params: [], manual: true },
  peer_message_list: { method: 'session.peer_message.list', params: [{ key: 'session_id', from: 'session_id', optional: false }] },
  plugin_diagnostics: { method: 'plugin.diagnostics', params: [] },
  plugin_list: { method: 'plugin.list', params: [] },
  plugin_set_enabled: { method: 'plugin.enable', params: [], manual: true },
  policy_get: { method: 'policy.get', params: [] },
  project_add: { method: 'project.add', params: [{ key: 'path', from: 'path', optional: false }, { key: 'name', from: 'name', optional: false }, { key: 'description', from: 'description', optional: false }] },
  project_changes: { method: 'project.changes', params: [{ key: 'path', from: 'path', optional: false }] },
  project_diff: { method: 'project.diff', params: [{ key: 'path', from: 'path', optional: false }, { key: 'file', from: 'file', optional: true }, { key: 'max_chars', from: 'max_chars', optional: true }] },
  project_get: { method: 'project.get', params: [{ key: 'project_id', from: 'project_id', optional: false }] },
  project_intelligence: { method: 'project.intelligence', params: [{ key: 'path', from: 'path', optional: false }] },
  project_list: { method: 'project.list', params: [{ key: 'include_archived', from: 'include_archived', optional: false, fallback: false }] },
  project_list_recent: { method: 'project.list_recent', params: [{ key: 'limit', from: 'limit', optional: true }] },
  project_open: { method: 'project.open', params: [{ key: 'path', from: 'path', optional: false }] },
  project_remove: { method: 'project.remove', params: [{ key: 'project_id', from: 'project_id', optional: false }, { key: 'session_policy', from: 'policy', optional: false }] },
  project_status: { method: 'project.status', params: [{ key: 'path', from: 'path', optional: false }] },
  project_trust: { method: 'project.trust', params: [{ key: 'path', from: 'path', optional: false }] },
  project_update: { method: 'project.update', params: [{ key: 'project_id', from: 'project_id', optional: false }, { key: 'name', from: 'name', optional: false }, { key: 'description', from: 'description', optional: false }, { key: 'pinned', from: 'pinned', optional: false }, { key: 'archived', from: 'archived', optional: false }] },
  provider_create: { method: 'provider.create', params: [{ key: 'alias', from: 'alias', optional: false }, { key: 'type', from: 'provider_type', optional: false }, { key: 'auth_method', from: 'auth_method', optional: false }, { key: 'endpoint', from: 'endpoint', optional: false }, { key: 'account_hint', from: 'account_hint', optional: false }, { key: 'secret', from: 'secret', optional: false }, { key: 'secret_env', from: 'secret_env', optional: false }, { key: 'settings', from: 'settings', optional: false }] },
  provider_discover: { method: 'provider.discover', params: [] },
  provider_get: { method: 'provider.get', params: [{ key: 'ref', from: 'reference', optional: false }] },
  provider_list: { method: 'provider.list', params: [] },
  provider_remove: { method: 'provider.remove', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'switch_to', from: 'switch_to', optional: false }, { key: 'keep_credentials', from: 'keep_credentials', optional: false, fallback: false }] },
  provider_test: { method: 'provider.test', params: [{ key: 'ref', from: 'reference', optional: false }] },
  provider_update: { method: 'provider.update', params: [], manual: true },
  provider_use: { method: 'provider.use', params: [{ key: 'ref', from: 'reference', optional: false }] },
  question_list: { method: 'question.list', params: [{ key: 'session_id', from: 'session_id', optional: false }] },
  question_resolve: { method: 'question.resolve', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'request_id', from: 'request_id', optional: false }, { key: 'status', from: 'status', optional: false }, { key: 'answers', from: 'answers', optional: false }] },
  queue_add: { method: 'session.queue.add', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'message', from: 'message', optional: false }] },
  queue_clear: { method: 'session.queue.clear', params: [{ key: 'session_id', from: 'session_id', optional: false }] },
  queue_list: { method: 'session.queue.list', params: [{ key: 'session_id', from: 'session_id', optional: false }] },
  queue_resume: { method: 'session.queue.resume', params: [{ key: 'session_id', from: 'session_id', optional: false }] },
  session_archive: { method: 'session.archive', params: [{ key: 'ref', from: 'reference', optional: false }] },
  session_close: { method: 'session.close', params: [{ key: 'ref', from: 'reference', optional: false }] },
  session_create: { method: 'session.create', params: [], manual: true },
  session_delete: { method: 'session.delete', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'cascade', from: 'cascade', optional: false, fallback: false }] },
  session_events: { method: 'session.events', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'after_seq', from: 'after_seq', optional: true }, { key: 'limit', from: 'limit', optional: true }] },
  session_fork: { method: 'session.fork', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'title', from: 'title', optional: false }] },
  session_get: { method: 'session.get', params: [{ key: 'ref', from: 'reference', optional: false }] },
  session_history: { method: 'session.history', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'limit', from: 'limit', optional: true }] },
  session_image_support: { method: 'session.image_support', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'model_id', from: 'model_id', optional: false }] },
  session_list: { method: 'session.list', params: [{ key: 'kind', from: 'kind', optional: false }, { key: 'include_closed', from: 'include_closed', optional: false, fallback: false }, { key: 'project_id', from: 'project_id', optional: false }, { key: 'state', from: 'state', optional: false }] },
  session_mode_set: { method: 'session.mode.set', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'mode', from: 'mode', optional: false }] },
  session_model_set: { method: 'session.model.set', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'model', from: 'model', optional: false }, { key: 'provider', from: 'provider', optional: false }] },
  session_move: { method: 'session.move', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'project_id', from: 'project_id', optional: false }] },
  session_open: { method: 'session.open', params: [{ key: 'ref', from: 'reference', optional: false }] },
  session_permission_get: { method: 'session.permission.get', params: [{ key: 'ref', from: 'reference', optional: false }] },
  session_permission_set: { method: 'session.permission.set', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'permission_profile', from: 'permission_profile', optional: false }] },
  session_rename: { method: 'session.rename', params: [{ key: 'ref', from: 'reference', optional: false }, { key: 'title', from: 'title', optional: false }] },
  session_restore: { method: 'session.restore', params: [{ key: 'ref', from: 'reference', optional: false }] },
  session_timeline: { method: 'session.timeline', params: [], manual: true },
  snapshot_get: { method: 'runtime.snapshot.get', params: [] },
  soul_activate: { method: 'soul.activate', params: [{ key: 'id', from: 'id', optional: false }] },
  soul_create: { method: 'soul.create', params: [{ key: 'id', from: 'id', optional: false }, { key: 'name', from: 'name', optional: false }, { key: 'identity', from: 'identity', optional: false }, { key: 'description', from: 'description', optional: false }, { key: 'version', from: 'version', optional: false }] },
  soul_get: { method: 'soul.get', params: [{ key: 'id', from: 'id', optional: false }] },
  soul_list: { method: 'soul.list', params: [] },
  soul_remove: { method: 'soul.remove', params: [{ key: 'id', from: 'id', optional: false }] },
  soul_update: { method: 'soul.update', params: [{ key: 'id', from: 'id', optional: false }, { key: 'name', from: 'name', optional: true }, { key: 'identity', from: 'identity', optional: true }, { key: 'description', from: 'description', optional: true }, { key: 'version', from: 'version', optional: true }] },
  task_get: { method: 'task.get', params: [{ key: 'path', from: 'path', optional: false }, { key: 'task_id', from: 'task_id', optional: false }] },
  task_tree: { method: 'task.tree', params: [{ key: 'path', from: 'path', optional: false }] },
  tool_list: { method: 'tool.list', params: [] },
  turn_cancel: { method: 'session.turn.cancel', params: [{ key: 'session_id', from: 'session_id', optional: false }] },
  turn_changes_get: { method: 'turn.changes.get', params: [{ key: 'turn_id', from: 'turn_id', optional: false }] },
  turn_changes_review: { method: 'turn.changes.review', params: [{ key: 'turn_id', from: 'turn_id', optional: false }, { key: 'path', from: 'path', optional: false }] },
  turn_changes_undo: { method: 'turn.changes.undo', params: [{ key: 'turn_id', from: 'turn_id', optional: false }, { key: 'paths', from: 'paths', optional: false }, { key: 'apply_safe_only', from: 'apply_safe_only', optional: false, fallback: false }] },
  turn_changes_undo_preview: { method: 'turn.changes.undo.preview', params: [{ key: 'turn_id', from: 'turn_id', optional: false }, { key: 'paths', from: 'paths', optional: false }] },
  turn_start: { method: 'session.turn.start', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'message', from: 'message', optional: false }, { key: 'reasoning_effort', from: 'reasoning_effort', optional: false }, { key: 'attachments', from: 'attachments', optional: false }, { key: 'allow_unconfirmed_vision', from: 'allow_unconfirmed_vision', optional: false, fallback: false }] },
  usage_get: { method: 'usage.get', params: [{ key: 'ref', from: 'reference', optional: true }] },
  verification_latest: { method: 'verification.latest', params: [{ key: 'path', from: 'path', optional: false }, { key: 'kinds', from: 'kinds', optional: true }, { key: 'limit', from: 'limit', optional: true }] },
  verification_plan: { method: 'verification.plan', params: [{ key: 'path', from: 'path', optional: false }, { key: 'changed_files', from: 'changed_files', optional: false }] },
  vision_settings_get: { method: 'vision.settings.get', params: [] },
  vision_settings_set: { method: 'vision.settings.set', params: [], passthrough: 'settings' },
  workspace_file_read: { method: 'workspace.file.read', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'path', from: 'path', optional: false }, { key: 'turn_id', from: 'turn_id', optional: false }] },
  workspace_file_search: { method: 'workspace.file.search', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'query', from: 'query', optional: false }, { key: 'limit', from: 'limit', optional: false, fallback: '30' }] },
  workspace_preview_start: { method: 'workspace.preview.start', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'path', from: 'path', optional: false }, { key: 'turn_id', from: 'turn_id', optional: false }, { key: 'run_dev', from: 'run_dev', optional: false }, { key: 'dev_url', from: 'dev_url', optional: false }] },
  workspace_preview_status: { method: 'workspace.preview.status', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'preview_id', from: 'preview_id', optional: false }] },
  workspace_preview_stop: { method: 'workspace.preview.stop', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'preview_id', from: 'preview_id', optional: false }] },
  workspace_process_list: { method: 'workspace.process.list', params: [], manual: true },
  workspace_process_read: { method: 'workspace.process.read', params: [{ key: 'session_id', from: 'session_id', optional: false }, { key: 'id', from: 'id', optional: false }] },
  workspace_process_stop: { method: 'workspace.process.stop', params: [], manual: true },
}
