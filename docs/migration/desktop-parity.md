# Inventario de paridad desktop

**Documento 02 §2 — entrega C.** Archivo **generado** por
`npm run parity:inventory` a partir del código y comprobado en CI con
`npm run parity:check`. No editar a mano: si un comando aparece o cambia de
firma sin regenerar, la comprobación falla.

Su objeto es que el host Electron (documento 02 §3, entrega D) tenga la lista
completa de lo que debe seguir existiendo, con argumentos, plazo y efectos. El
documento 02 §2 avisa de que **la allowlist no puede derivarse solo de los
métodos del Engine**: hay operaciones de ventana que no pertenecen al protocolo.
Por eso el inventario tiene dos mitades: los comandos y las APIs de plataforma
que el frontend usa directamente.

## Resumen

| Superficie | Cantidad |
|---|---|
| Comandos registrados en `invoke_handler` | **130** |
| Handlers `#[tauri::command]` hallados | 130 |
| Handlers sin registrar | 0 |
| Invocados desde el frontend sin registrar | 0 |
| Registrados sin ningún llamador en `src/` | 1 |
| Eventos del host hacia el frontend | 3 |

### Registrados sin llamador

Expuestos al WebView pero que ningún archivo de `src/` invoca. No se portan al
host nuevo sin una decisión explícita: cada uno es superficie que nadie usa.

- `mcp_get`

## Plazos

`EngineSupervisor::request` elige el plazo por método y `EngineTransport` fija el
del handshake. El documento 02 §4.2 pide conservar esta diferenciación y **no**
asignar 60 s a toda acción:

| Ámbito | Plazo |
|---|---|
| Handshake (`hello`) | 15 s |
| `project.status` | 5 s |
| `session.turn.start`, `model.discovery.start` | 5 s |
| Lista/lectura/ciclo de vida de sesiones | 10 s |
| Resto de métodos | 60 s |

## Eventos del host hacia el frontend

| Evento | Origen | Contenido | Quién escucha |
|---|---|---|---|
| `rinari-engine-event` | `commands/engine.rs`, sink del supervisor | **Todos** los eventos asíncronos del Engine, por un único canal | `services/engine.ts` |
| `rinari-menu-action` | `menu.rs` | Id de la acción del menú nativo | `services/actions.ts` |
| `rinari-open-request` | `main.rs`, plugin single-instance | Handoff `rinari desktop [ruta] [--session id]` de una segunda instancia | `App.tsx` |

Un único canal para todos los eventos del Engine es un detalle a conservar: el
host nuevo no debe abrir un lector por panel (documento 02 §4.2).

El arranque en frío no usa evento sino el comando `initial_open_request`, que lee
`std::env::args()`. El host nuevo necesita los dos caminos: argumentos del proceso
propio y entrega de la segunda instancia.

## APIs de plataforma usadas directamente

Lo que el frontend importa de `@tauri-apps/*` sin pasar por `invoke`. Es la parte
que un inventario hecho solo con métodos del Engine se dejaría fuera.

| Módulo | Símbolo | Archivos |
|---|---|---|
| `@tauri-apps/api/core` | `invoke` | `features/board/AddPaneDialog.test.tsx`<br>`features/browser/useBrowserFrame.test.tsx`<br>`features/engine/useEngineSession.test.tsx`<br>`features/processes/ProcessIdentity.test.tsx`<br>`features/processes/ProcessRuntimeProvider.test.tsx`<br>`features/processes/ProcessesDock.test.tsx`<br>… y 5 más |
| `@tauri-apps/api/core` | `isTauri` | `platform/tauri.ts` |
| `@tauri-apps/api/dpi` | `LogicalPosition` | `platform/tauri.ts` |
| `@tauri-apps/api/event` | `listen` | `platform/tauri.ts` |
| `@tauri-apps/api/menu` | `Menu` | `platform/tauri.ts` |
| `@tauri-apps/api/menu` | `type MenuOptions` | `platform/tauri.ts` |
| `@tauri-apps/api/window` | `PhysicalPosition` | `platform/tauri.ts` |
| `@tauri-apps/api/window` | `PhysicalSize` | `platform/tauri.ts` |
| `@tauri-apps/api/window` | `currentMonitor` | `platform/tauri.ts` |
| `@tauri-apps/api/window` | `getCurrentWindow` | `platform/tauri.ts` |
| `@tauri-apps/plugin-dialog` | `open` | `features/board/AddPaneDialog.test.tsx`<br>`platform/tauri.ts` |
| `@tauri-apps/plugin-opener` | `openUrl` | `features/files/HtmlPreview.test.tsx`<br>`features/processes/ProcessesReview.test.tsx`<br>`platform/tauri.ts` |
| `@tauri-apps/plugin-process` | `relaunch` | `platform/tauri.ts` |
| `@tauri-apps/plugin-updater` | `check` | `platform/tauri.ts` |

## Comandos

`rename_all` indica cómo viajan los nombres de argumento por el puente: la
mayoría usa `snake_case` explícito y el host nuevo debe respetar exactamente el
mismo contrato, o las llamadas fallan en silencio.

**El nombre del comando no es el método del protocolo.** `session_get` habla
con `session.get`, y sus argumentos se renombran por el camino: el renderer
envía `reference` y el Engine recibe `ref`. El host anterior hacía esa
traducción en 130 handlers Rust; el nuevo la necesita igual, y esta tabla es su
especificación. La columna «Método del Engine» es la cadena real, no la
variante del enum.

### Ciclo de vida del Engine — `commands/engine.rs` (6)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `engine_restart` | — | — | — | `Result<EngineStatus, CommandError>` | emite evento al frontend | `services/engine.ts` |
| `engine_shutdown` | — | — | — | `Result<EngineStatus, CommandError>` | — | `services/engine.ts` |
| `engine_start` | — | — | — | `Result<EngineStatus, CommandError>` | emite evento al frontend | `services/engine.ts` |
| `engine_status` | — | — | — | `EngineStatus` | — | `services/engine.ts` |
| `initial_open_request` | — | — | — | `OpenRequest` | — | `services/engine.ts` |
| `snapshot_get` | — | `runtime.snapshot.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

### Sesiones y turnos — `commands/sessions.rs` (27)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `approval_resolve` | `approval_id`: `String`<br>`decision`: `String` | `approval.resolve` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `queue_add` | `session_id`: `String`<br>`message`: `String` | `session.queue.add` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `queue_clear` | `session_id`: `String` | `session.queue.clear` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `queue_list` | `session_id`: `String` | `session.queue.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_archive` | `reference`: `String` | `session.archive` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_close` | `reference`: `String` | `session.close` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_create` | `cwd`: `Option<String>` *(opcional)*<br>`chat`: `Option<bool>` *(opcional)*<br>`title`: `Option<String>` *(opcional)*<br>`mode`: `Option<String>` *(opcional)*<br>`permission_profile`: `Option<String>` *(opcional)*<br>`project_id`: `Option<String>` *(opcional)* | `session.create` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_delete` | `reference`: `String`<br>`cascade`: `Option<bool>` *(opcional)* | `session.delete` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_events` | `reference`: `String`<br>`after_seq`: `Option<u64>` *(opcional)*<br>`limit`: `Option<u32>` *(opcional)* | `session.events` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_fork` | `reference`: `String`<br>`title`: `Option<String>` *(opcional)* | `session.fork` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_get` | `reference`: `String` | `session.get` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_history` | `reference`: `String`<br>`limit`: `Option<u32>` *(opcional)* | `session.history` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_list` | `kind`: `Option<String>` *(opcional)*<br>`include_closed`: `Option<bool>` *(opcional)*<br>`project_id`: `Option<String>` *(opcional)*<br>`state`: `Option<String>` *(opcional)* | `session.list` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_mode_set` | `reference`: `String`<br>`mode`: `String` | `session.mode.set` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_model_set` | `reference`: `String`<br>`model`: `String`<br>`provider`: `Option<String>` *(opcional)* | `session.model.set` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_open` | `reference`: `String` | `session.open` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_permission_get` | `reference`: `String` | `session.permission.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_permission_set` | `reference`: `String`<br>`permission_profile`: `String` | `session.permission.set` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_rename` | `reference`: `String`<br>`title`: `String` | `session.rename` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_restore` | `reference`: `String` | `session.restore` | 10 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_timeline` | `reference`: `String`<br>`before_turn_index`: `Option<u64>` *(opcional)*<br>`limit`: `Option<u32>` *(opcional)* | `session.timeline` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `turn_cancel` | `session_id`: `String` | `session.turn.cancel` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `turn_changes_get` | `turn_id`: `String` | `turn.changes.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `turn_changes_review` | `turn_id`: `String`<br>`path`: `Option<String>` *(opcional)* | `turn.changes.review` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `turn_changes_undo` | `turn_id`: `String`<br>`paths`: `Option<Vec<String>>` *(opcional)*<br>`apply_safe_only`: `Option<bool>` *(opcional)* | `turn.changes.undo` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `turn_changes_undo_preview` | `turn_id`: `String`<br>`paths`: `Option<Vec<String>>` *(opcional)* | `turn.changes.undo.preview` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `turn_start` | `session_id`: `String`<br>`message`: `String`<br>`reasoning_effort`: `Option<String>` *(opcional)*<br>`attachments`: `Option<serde_json::Value>` *(opcional)*<br>`allow_unconfirmed_vision`: `Option<bool>` *(opcional)* | `session.turn.start` | 5 s | `Result<serde_json::Value, CommandError>` | — | `features/engine/EngineConsole.tsx`<br>`services/engine.ts` |

### Mensajería entre paneles — `commands/peers.rs` (7)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `peer_group_get` | `board_id`: `Option<String>` *(opcional)*<br>`session_id`: `Option<String>` *(opcional)*<br>`group_id`: `Option<String>` *(opcional)* | `session.peer_group.get` | 60 s | `Result<Value, CommandError>` | — | `services/engine.ts` |
| `peer_group_revoke` | `group_id`: `String` | `session.peer_group.revoke` | 60 s | `Result<Value, CommandError>` | — | `services/engine.ts` |
| `peer_group_set` | `board_id`: `String`<br>`group_id`: `Option<String>` *(opcional)*<br>`expected_revision`: `i64`<br>`enabled`: `bool`<br>`members`: `Vec<Value>` | `session.peer_group.set` | 60 s | `Result<Value, CommandError>` | — | `services/engine.ts` |
| `peer_message_cancel` | `message_id`: `String` | `session.peer_message.cancel` | 60 s | `Result<Value, CommandError>` | — | `services/engine.ts` |
| `peer_message_forward` | `target_session_id`: `String`<br>`message`: `String`<br>`source_session_id`: `Option<String>` *(opcional)*<br>`quoted_source`: `Option<Value>` *(opcional)* | `session.peer_message.forward` | 60 s | `Result<Value, CommandError>` | — | `services/engine.ts` |
| `peer_message_list` | `session_id`: `String` | `session.peer_message.list` | 60 s | `Result<Value, CommandError>` | — | `services/engine.ts` |
| `queue_resume` | `session_id`: `String` | `session.queue.resume` | 60 s | `Result<Value, CommandError>` | — | `services/engine.ts` |

### Workspace, contexto y adjuntos — `commands/workspace.rs` (26)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `artifact_list` | `session_id`: `Option<String>` *(opcional)* | `artifact.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `artifact_read` | `uri`: `String`<br>`max_bytes`: `Option<u32>` *(opcional)* | `artifact.read` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `attachment_prepare` | `session_id`: `String`<br>`attachments`: `serde_json::Value` | `attachment.prepare` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `attachment_prepare_cancel` | `job_id`: `String` | `attachment.prepare.cancel` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `attachment_prepare_get` | `job_id`: `String` | `attachment.prepare.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `attachment_prepare_start` | `session_id`: `String`<br>`attachments`: `serde_json::Value` | `attachment.prepare.start` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `attachment_preview` | `uri`: `String`<br>`max_bytes`: `Option<u32>` *(opcional)*<br>`max_dimension`: `Option<u32>` *(opcional)* | `attachment.preview` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `checkpoint_list` | `path`: `Option<String>` *(opcional)* | `checkpoint.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `checkpoint_restore` | `path`: `String`<br>`checkpoint_id`: `Option<String>` *(opcional)*<br>`preview`: `Option<bool>` *(opcional)*<br>`allow_mixed`: `Option<bool>` *(opcional)* | `checkpoint.restore` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `checkpoint_show` | `checkpoint_id`: `String` | `checkpoint.show` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `context_compact` | `session_id`: `String` | `context.compact` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `context_get` | `reference`: `String` | `context.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `context_settings_get` | — | `context.settings.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `context_settings_set` | `settings`: `serde_json::Value` | `context.settings.set` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `context_status` | `model_id`: `String` | `context.status` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_changes` | `path`: `String` | `project.changes` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_diff` | `path`: `String`<br>`file`: `Option<String>` *(opcional)*<br>`max_chars`: `Option<u32>` *(opcional)* | `project.diff` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `session_image_support` | `session_id`: `Option<String>` *(opcional)*<br>`model_id`: `Option<String>` *(opcional)* | `session.image_support` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `task_get` | `path`: `String`<br>`task_id`: `String` | `task.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `task_tree` | `path`: `String` | `task.tree` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `usage_get` | `reference`: `Option<String>` *(opcional)* | `usage.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `verification_latest` | `path`: `String`<br>`kinds`: `Option<Vec<String>>` *(opcional)*<br>`limit`: `Option<u32>` *(opcional)* | `verification.latest` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `verification_plan` | `path`: `String`<br>`changed_files`: `Vec<String>` | `verification.plan` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `vision_settings_get` | — | `vision.settings.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `vision_settings_set` | `settings`: `serde_json::Value` | `vision.settings.set` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `workspace_file_search` | `session_id`: `String`<br>`query`: `String`<br>`limit`: `Option<u32>` *(opcional)* | `workspace.file.search` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

### Superficies desktop del Engine — `commands/desktop.rs` (12)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `browser_view_get` | `session_id`: `String`<br>`target_id`: `Option<String>` *(opcional)* | `browser.view.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `features/browser/useBrowserFrame.ts` |
| `question_list` | `session_id`: `String` | `question.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/desktop.ts` |
| `question_resolve` | `session_id`: `String`<br>`request_id`: `String`<br>`status`: `String`<br>`answers`: `std::collections::HashMap<String, String>` | `question.resolve` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/desktop.ts` |
| `session_move` | `session_id`: `String`<br>`project_id`: `Option<String>` *(opcional)* | `session.move` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/desktop.ts` |
| `workspace_file_open` | `session_id`: `String`<br>`path`: `String`<br>`turn_id`: `Option<String>` *(opcional)* | — | — | `Result<(), CommandError>` | abre ruta/URL con el opener del sistema | `services/desktop.ts` |
| `workspace_file_read` | `session_id`: `String`<br>`path`: `String`<br>`turn_id`: `Option<String>` *(opcional)* | `workspace.file.read` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/desktop.ts` |
| `workspace_preview_start` | `session_id`: `String`<br>`path`: `String`<br>`turn_id`: `Option<String>` *(opcional)*<br>`run_dev`: `Option<bool>` *(opcional)*<br>`dev_url`: `Option<String>` *(opcional)* | `workspace.preview.start` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/desktop.ts` |
| `workspace_preview_status` | `session_id`: `String`<br>`preview_id`: `String` | `workspace.preview.status` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/desktop.ts` |
| `workspace_preview_stop` | `session_id`: `String`<br>`preview_id`: `String` | `workspace.preview.stop` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/desktop.ts` |
| `workspace_process_list` | `session_id`: `String`<br>`id`: `Option<String>` *(opcional)*<br>`cursor`: `Option<String>` *(opcional)*<br>`limit`: `Option<i64>` *(opcional)* | `workspace.process.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/processes.ts` |
| `workspace_process_read` | `session_id`: `String`<br>`id`: `Option<String>` *(opcional)* | `workspace.process.read` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/processes.ts` |
| `workspace_process_stop` | `session_id`: `String`<br>`id`: `Option<String>` *(opcional)*<br>`engine_instance_id`: `Option<String>` *(opcional)*<br>`generation`: `Option<i64>` *(opcional)* | `workspace.process.stop` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/processes.ts` |

### Proyectos — `commands/projects.rs` (10)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `project_add` | `path`: `String`<br>`name`: `Option<String>` *(opcional)*<br>`description`: `Option<String>` *(opcional)* | `project.add` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_get` | `project_id`: `String` | `project.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_intelligence` | `path`: `String` | `project.intelligence` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_list` | `include_archived`: `Option<bool>` *(opcional)* | `project.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_list_recent` | `limit`: `Option<u32>` *(opcional)* | `project.list_recent` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_open` | `path`: `String` | `project.open` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_remove` | `project_id`: `String`<br>`session_policy`: `Option<String>` *(opcional)* | `project.remove` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_status` | `path`: `String` | `project.status` | 5 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_trust` | `path`: `String` | `project.trust` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `project_update` | `project_id`: `String`<br>`name`: `Option<String>` *(opcional)*<br>`description`: `Option<String>` *(opcional)*<br>`pinned`: `Option<bool>` *(opcional)*<br>`archived`: `Option<bool>` *(opcional)* | `project.update` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

### Proveedores — `commands/providers.rs` (8)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `provider_create` | `alias`: `String`<br>`provider_type`: `String`<br>`auth_method`: `Option<String>` *(opcional)*<br>`endpoint`: `Option<String>` *(opcional)*<br>`account_hint`: `Option<String>` *(opcional)*<br>`secret`: `Option<String>` *(opcional)*<br>`secret_env`: `Option<String>` *(opcional)*<br>`settings`: `Option<serde_json::Value>` *(opcional)* | `provider.create` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `provider_discover` | — | `provider.discover` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `provider_get` | `reference`: `String` | `provider.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `provider_list` | — | `provider.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `provider_remove` | `reference`: `String`<br>`switch_to`: `Option<String>` *(opcional)*<br>`keep_credentials`: `Option<bool>` *(opcional)* | `provider.remove` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `provider_test` | `reference`: `String` | `provider.test` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `provider_update` | `reference`: `String`<br>`alias`: `Option<String>` *(opcional)*<br>`endpoint`: `Option<String>` *(opcional)*<br>`account_hint`: `Option<String>` *(opcional)*<br>`secret`: `Option<String>` *(opcional)*<br>`secret_env`: `Option<String>` *(opcional)*<br>`settings`: `Option<serde_json::Value>` *(opcional)* | `provider.update` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `provider_use` | `reference`: `String` | `provider.use` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

### Modelos — `commands/models.rs` (10)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `model_add` | `provider`: `String`<br>`provider_model_id`: `String`<br>`alias`: `String`<br>`capabilities`: `Option<serde_json::Value>` *(opcional)*<br>`settings`: `Option<serde_json::Value>` *(opcional)* | `model.add` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_alias` | `reference`: `String`<br>`new_alias`: `String`<br>`provider`: `Option<String>` *(opcional)* | `model.alias` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_discover` | `provider`: `Option<String>` *(opcional)* | `model.discover` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_discovery_start` | `provider`: `Option<String>` *(opcional)* | `model.discovery.start` | 5 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_get` | `reference`: `String`<br>`provider`: `Option<String>` *(opcional)* | `model.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_list` | `provider`: `Option<String>` *(opcional)* | `model.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_refresh` | `provider`: `Option<String>` *(opcional)* | `model.refresh` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_remove` | `reference`: `String`<br>`provider`: `Option<String>` *(opcional)* | `model.remove` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_test` | `reference`: `String`<br>`provider`: `Option<String>` *(opcional)* | `model.test` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `model_use` | `reference`: `String`<br>`provider`: `Option<String>` *(opcional)* | `model.use` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

### Agentes — `commands/agents.rs` (3)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `agent_config_get` | `agent`: `String` | `agent.config.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `agent_config_set` | `agent`: `String`<br>`model`: `Option<String>` *(opcional)*<br>`fallback`: `Option<String>` *(opcional)*<br>`enabled`: `Option<bool>` *(opcional)*<br>`clear`: `Option<bool>` *(opcional)* | `agent.config.set` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `agent_list` | — | `agent.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

### Souls — `commands/souls.rs` (6)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `soul_activate` | `id`: `String` | `soul.activate` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `soul_create` | `id`: `String`<br>`name`: `String`<br>`identity`: `String`<br>`description`: `Option<String>` *(opcional)*<br>`version`: `Option<String>` *(opcional)* | `soul.create` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `soul_get` | `id`: `String` | `soul.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `soul_list` | — | `soul.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `soul_remove` | `id`: `String` | `soul.remove` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `soul_update` | `id`: `String`<br>`name`: `Option<String>` *(opcional)*<br>`identity`: `Option<String>` *(opcional)*<br>`description`: `Option<String>` *(opcional)*<br>`version`: `Option<String>` *(opcional)* | `soul.update` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

### MCP, plugins, herramientas y políticas — `commands/ecosystem.rs` (11)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `mcp_create` | `name`: `String`<br>`command`: `Vec<String>` | `mcp.create` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `mcp_get` | `name`: `String` | `mcp.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | **ninguno** |
| `mcp_list` | — | `mcp.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `mcp_remove` | `name`: `String` | `mcp.remove` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `mcp_set_enabled` | `name`: `String`<br>`enabled`: `bool` | `mcp.enable` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `mcp_test` | `name`: `String` | `mcp.test` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `plugin_diagnostics` | — | `plugin.diagnostics` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `plugin_list` | — | `plugin.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `plugin_set_enabled` | `name`: `String`<br>`enabled`: `bool` | `plugin.enable` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `policy_get` | — | `policy.get` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `tool_list` | — | `tool.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

### Bundles — `commands/workflow.rs` (4)

| Comando | Argumentos | Método del Engine | Plazo | Devuelve | Efectos de host | Llamado desde |
|---|---|---|---|---|---|---|
| `bundle_apply` | `id`: `String`<br>`session_ref`: `Option<String>` *(opcional)* | `profile_bundle.apply` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `bundle_create` | `id`: `String`<br>`name`: `String`<br>`description`: `Option<String>` *(opcional)*<br>`soul_id`: `Option<String>` *(opcional)*<br>`mode`: `Option<String>` *(opcional)*<br>`agents`: `Option<serde_json::Value>` *(opcional)* | `profile_bundle.create` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `bundle_list` | — | `profile_bundle.list` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |
| `bundle_remove` | `id`: `String` | `profile_bundle.remove` | 60 s | `Result<serde_json::Value, CommandError>` | — | `services/engine.ts` |

## Qué falta para declarar paridad

Este inventario dice **qué** existe, no que el host nuevo lo cubra. El documento
02 §8 cierra la fase cuando cada fila tenga correspondencia y prueba en el host
Electron, o un bloqueo explícito que impida declarar paridad. Las columnas de
errores y prueba de paridad se añaden en la entrega D, cuando exista el destino
contra el que compararse.
