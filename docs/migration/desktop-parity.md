# Paridad desktop Electron

Inventario vigente de los comandos que el renderer puede pedir con `command()`.
Se genera desde `docs/migration/desktop-command-contract.json`; las filas
iniciales vinieron de la captura de Tauri 0.1.3 hecha para la migración, y
desde entonces el fichero es el inventario de Electron. La regla para añadir
un comando o una intención está en AGENTS.md, «Comandos e intenciones».

- Comandos: **130**
- Respaldados por Engine: **124**
- Resueltos por el host: **6**
- Adaptadores manuales fail-closed: **10**
- Imports Tauri activos: **0**

| Comando | Dueño | Método Engine | Llamadores |
|---|---|---|---|
| `agent_config_get` | engine | `agent.config.get` | `src/services/engine.ts` |
| `agent_config_set` | engine | `agent.config.set` | `src/services/engine.ts` |
| `agent_list` | engine | `agent.list` | `src/services/engine.ts` |
| `approval_resolve` | engine | `approval.resolve` | **ninguno** |
| `artifact_list` | engine | `artifact.list` | `src/services/engine.ts` |
| `artifact_read` | engine | `artifact.read` | **ninguno** |
| `attachment_prepare` | engine | `attachment.prepare` | `src/services/engine.ts` |
| `attachment_prepare_cancel` | engine | `attachment.prepare.cancel` | `src/services/engine.ts` |
| `attachment_prepare_get` | engine | `attachment.prepare.get` | `src/services/engine.ts` |
| `attachment_prepare_start` | engine | `attachment.prepare.start` | `src/services/engine.ts` |
| `attachment_preview` | engine | `attachment.preview` | `src/services/engine.ts` |
| `browser_view_get` | engine | `browser.view.get` | `src/features/browser/useBrowserFrame.ts` |
| `bundle_apply` | engine | `profile_bundle.apply` | `src/services/engine.ts` |
| `bundle_create` | engine | `profile_bundle.create` | `src/services/engine.ts` |
| `bundle_list` | engine | `profile_bundle.list` | `src/services/engine.ts` |
| `bundle_remove` | engine | `profile_bundle.remove` | `src/services/engine.ts` |
| `checkpoint_list` | engine | `checkpoint.list` | `src/services/engine.ts` |
| `checkpoint_restore` | engine | `checkpoint.restore` | `src/services/engine.ts` |
| `checkpoint_show` | engine | `checkpoint.show` | `src/services/engine.ts` |
| `context_compact` | engine | `context.compact` | `src/services/engine.ts` |
| `context_get` | engine | `context.get` | `src/services/engine.ts` |
| `context_settings_get` | engine | `context.settings.get` | `src/services/engine.ts` |
| `context_settings_set` | engine | `context.settings.set` | `src/services/engine.ts` |
| `context_status` | engine | `context.status` | `src/services/engine.ts` |
| `engine_restart` | host | — | **ninguno** |
| `engine_shutdown` | host | — | **ninguno** |
| `engine_start` | host | — | **ninguno** |
| `engine_status` | host | — | **ninguno** |
| `initial_open_request` | host | — | **ninguno** |
| `mcp_create` | engine | `mcp.create` | `src/services/engine.ts` |
| `mcp_get` | engine | `mcp.get` | **ninguno** |
| `mcp_list` | engine | `mcp.list` | `src/services/engine.ts` |
| `mcp_remove` | engine | `mcp.remove` | `src/services/engine.ts` |
| `mcp_set_enabled` | engine | `mcp.enable` | `src/services/engine.ts` |
| `mcp_test` | engine | `mcp.test` | `src/services/engine.ts` |
| `model_add` | engine | `model.add` | `src/services/engine.ts` |
| `model_alias` | engine | `model.alias` | `src/services/engine.ts` |
| `model_discover` | engine | `model.discover` | `src/services/engine.ts` |
| `model_discovery_start` | engine | `model.discovery.start` | **ninguno** |
| `model_get` | engine | `model.get` | `src/services/engine.ts` |
| `model_list` | engine | `model.list` | `src/services/engine.ts` |
| `model_refresh` | engine | `model.refresh` | **ninguno** |
| `model_remove` | engine | `model.remove` | **ninguno** |
| `model_test` | engine | `model.test` | **ninguno** |
| `model_use` | engine | `model.use` | **ninguno** |
| `peer_group_get` | engine | `session.peer_group.get` | `src/services/engine.ts` |
| `peer_group_revoke` | engine | `session.peer_group.revoke` | `src/services/engine.ts` |
| `peer_group_set` | engine | `session.peer_group.set` | `src/services/engine.ts` |
| `peer_message_cancel` | engine | `session.peer_message.cancel` | `src/services/engine.ts` |
| `peer_message_forward` | engine | `session.peer_message.forward` | `src/services/engine.ts` |
| `peer_message_list` | engine | `session.peer_message.list` | **ninguno** |
| `plugin_diagnostics` | engine | `plugin.diagnostics` | **ninguno** |
| `plugin_list` | engine | `plugin.list` | `src/services/engine.ts` |
| `plugin_set_enabled` | engine | `plugin.enable` | `src/services/engine.ts` |
| `policy_get` | engine | `policy.get` | **ninguno** |
| `project_add` | engine | `project.add` | **ninguno** |
| `project_changes` | engine | `project.changes` | `src/services/engine.ts` |
| `project_diff` | engine | `project.diff` | **ninguno** |
| `project_get` | engine | `project.get` | `src/services/engine.ts` |
| `project_intelligence` | engine | `project.intelligence` | `src/services/engine.ts` |
| `project_list` | engine | `project.list` | `src/services/engine.ts` |
| `project_list_recent` | engine | `project.list_recent` | `src/services/engine.ts` |
| `project_open` | engine | `project.open` | **ninguno** |
| `project_remove` | engine | `project.remove` | **ninguno** |
| `project_status` | engine | `project.status` | `src/services/engine.ts` |
| `project_trust` | engine | `project.trust` | **ninguno** |
| `project_update` | engine | `project.update` | `src/services/engine.ts` |
| `provider_create` | engine | `provider.create` | `src/services/engine.ts` |
| `provider_discover` | engine | `provider.discover` | `src/services/engine.ts` |
| `provider_get` | engine | `provider.get` | `src/services/engine.ts` |
| `provider_list` | engine | `provider.list` | **ninguno** |
| `provider_remove` | engine | `provider.remove` | **ninguno** |
| `provider_test` | engine | `provider.test` | `src/services/engine.ts` |
| `provider_update` | engine | `provider.update` | `src/services/engine.ts` |
| `provider_use` | engine | `provider.use` | **ninguno** |
| `question_list` | engine | `question.list` | `src/services/desktop.ts` |
| `question_resolve` | engine | `question.resolve` | `src/services/desktop.ts` |
| `queue_add` | engine | `session.queue.add` | **ninguno** |
| `queue_clear` | engine | `session.queue.clear` | **ninguno** |
| `queue_list` | engine | `session.queue.list` | **ninguno** |
| `queue_resume` | engine | `session.queue.resume` | **ninguno** |
| `session_archive` | engine | `session.archive` | `src/services/engine.ts` |
| `session_close` | engine | `session.close` | `src/services/engine.ts` |
| `session_create` | engine | `session.create` | **ninguno** |
| `session_delete` | engine | `session.delete` | `src/services/engine.ts` |
| `session_events` | engine | `session.events` | **ninguno** |
| `session_fork` | engine | `session.fork` | `src/services/engine.ts` |
| `session_get` | engine | `session.get` | `src/services/engine.ts` |
| `session_history` | engine | `session.history` | **ninguno** |
| `session_image_support` | engine | `session.image_support` | `src/services/engine.ts` |
| `session_list` | engine | `session.list` | `src/services/engine.ts` |
| `session_mode_set` | engine | `session.mode.set` | `src/services/engine.ts` |
| `session_model_set` | engine | `session.model.set` | **ninguno** |
| `session_move` | engine | `session.move` | `src/services/desktop.ts` |
| `session_open` | engine | `session.open` | **ninguno** |
| `session_permission_get` | engine | `session.permission.get` | `src/services/engine.ts` |
| `session_permission_set` | engine | `session.permission.set` | `src/services/engine.ts` |
| `session_rename` | engine | `session.rename` | `src/services/engine.ts` |
| `session_restore` | engine | `session.restore` | `src/services/engine.ts` |
| `session_timeline` | engine | `session.timeline` | **ninguno** |
| `snapshot_get` | engine | `runtime.snapshot.get` | `src/services/engine.ts` |
| `soul_activate` | engine | `soul.activate` | `src/services/engine.ts` |
| `soul_create` | engine | `soul.create` | `src/services/engine.ts` |
| `soul_get` | engine | `soul.get` | `src/services/engine.ts` |
| `soul_list` | engine | `soul.list` | **ninguno** |
| `soul_remove` | engine | `soul.remove` | `src/services/engine.ts` |
| `soul_update` | engine | `soul.update` | `src/services/engine.ts` |
| `task_get` | engine | `task.get` | `src/services/engine.ts` |
| `task_tree` | engine | `task.tree` | **ninguno** |
| `tool_list` | engine | `tool.list` | `src/services/engine.ts` |
| `turn_cancel` | engine | `session.turn.cancel` | **ninguno** |
| `turn_changes_get` | engine | `turn.changes.get` | `src/services/engine.ts` |
| `turn_changes_review` | engine | `turn.changes.review` | **ninguno** |
| `turn_changes_undo` | engine | `turn.changes.undo` | **ninguno** |
| `turn_changes_undo_preview` | engine | `turn.changes.undo.preview` | `src/services/engine.ts` |
| `turn_start` | engine | `session.turn.start` | `src/features/engine/EngineConsole.tsx` |
| `usage_get` | engine | `usage.get` | `src/services/engine.ts` |
| `verification_latest` | engine | `verification.latest` | `src/services/engine.ts` |
| `verification_plan` | engine | `verification.plan` | `src/services/engine.ts` |
| `vision_settings_get` | engine | `vision.settings.get` | `src/services/engine.ts` |
| `vision_settings_set` | engine | `vision.settings.set` | `src/services/engine.ts` |
| `workspace_file_open` | host | — | **ninguno** |
| `workspace_file_read` | engine | `workspace.file.read` | `src/services/desktop.ts` |
| `workspace_file_search` | engine | `workspace.file.search` | **ninguno** |
| `workspace_preview_start` | engine | `workspace.preview.start` | `src/services/desktop.ts` |
| `workspace_preview_status` | engine | `workspace.preview.status` | `src/services/desktop.ts` |
| `workspace_preview_stop` | engine | `workspace.preview.stop` | `src/services/desktop.ts` |
| `workspace_process_list` | engine | `workspace.process.list` | `src/services/processes.ts` |
| `workspace_process_read` | engine | `workspace.process.read` | `src/services/processes.ts` |
| `workspace_process_stop` | engine | `workspace.process.stop` | `src/services/processes.ts` |
