//! Session + turn-runtime commands: list/open/history/mode, turn
//! start/cancel, approvals, prompt queue.
use tauri::State;

use rinari_agent_lib::engine::{CommandError, EngineSupervisor};

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_list(
    supervisor: State<'_, EngineSupervisor>,
    kind: Option<String>,
    include_closed: Option<bool>,
    project_id: Option<String>,
    state: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_list_filtered(kind, include_closed.unwrap_or(false), project_id, state)
    })
    .await
}

#[tauri::command]
pub(crate) async fn session_rename(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    title: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_rename(&reference, &title)
    })
    .await
}

#[tauri::command]
pub(crate) async fn session_archive(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| engine.session_archive(&reference)).await
}

#[tauri::command]
pub(crate) async fn session_restore(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| engine.session_restore(&reference)).await
}

#[tauri::command]
pub(crate) async fn session_fork(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    title: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            rinari_agent_lib::engine::methods::Method::SessionFork,
            Some(serde_json::json!({ "ref": reference, "title": title })),
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn session_open(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| engine.session_open(&reference)).await
}

#[tauri::command]
pub(crate) async fn session_get(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| engine.session_get(&reference)).await
}

#[tauri::command]
pub(crate) async fn session_close(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| engine.session_close(&reference)).await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_delete(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    cascade: Option<bool>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_delete(&reference, cascade.unwrap_or(false))
    })
    .await
}

#[tauri::command]
pub(crate) async fn session_history(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    limit: Option<u32>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_history(&reference, limit)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_timeline(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    before_turn_index: Option<u64>,
    limit: Option<u32>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_timeline(&reference, before_turn_index, limit)
    })
    .await
}

#[tauri::command]
pub(crate) async fn session_mode_set(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    mode: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_mode_set(&reference, &mode)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_create(
    supervisor: State<'_, EngineSupervisor>,
    cwd: Option<String>,
    chat: Option<bool>,
    title: Option<String>,
    mode: Option<String>,
    permission_profile: Option<String>,
    project_id: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        if let Some(project_id) = project_id {
            engine.request(
                rinari_agent_lib::engine::methods::Method::SessionCreate,
                Some(serde_json::json!({
                    "project_id": project_id,
                    "title": title,
                    "mode": mode,
                    "permission_profile": permission_profile,
                })),
            )
        } else {
            engine.session_create_with_options(
                cwd,
                chat.unwrap_or(false),
                title,
                mode,
                permission_profile,
            )
        }
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_permission_set(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    permission_profile: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_permission_set(&reference, &permission_profile)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_permission_get(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_permission_get(&reference)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn turn_changes_get(
    supervisor: State<'_, EngineSupervisor>,
    turn_id: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| engine.turn_changes_get(&turn_id)).await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn turn_changes_review(
    supervisor: State<'_, EngineSupervisor>,
    turn_id: String,
    path: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.turn_changes_review(&turn_id, path.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn turn_changes_undo_preview(
    supervisor: State<'_, EngineSupervisor>,
    turn_id: String,
    paths: Option<Vec<String>>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.turn_changes_undo_preview(&turn_id, paths)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn turn_changes_undo(
    supervisor: State<'_, EngineSupervisor>,
    turn_id: String,
    paths: Option<Vec<String>>,
    apply_safe_only: Option<bool>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.turn_changes_undo(&turn_id, paths, apply_safe_only.unwrap_or(false))
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_model_set(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    model: String,
    provider: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_model_set(&reference, &model, provider.as_deref())
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_events(
    supervisor: State<'_, EngineSupervisor>,
    reference: String,
    after_seq: Option<u64>,
    limit: Option<u32>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.session_events(&reference, after_seq, limit)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn turn_start(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    message: String,
    reasoning_effort: Option<String>,
    attachments: Option<serde_json::Value>,
    allow_unconfirmed_vision: Option<bool>,
) -> Result<serde_json::Value, CommandError> {
    // Un solo nombre canónico: el frontend siempre manda snake_case.
    // (Se probó aceptar también camelCase, pero dos params que solo se
    // diferencian por casing/underscores confunden al parser de args.)
    if session_id.is_empty() {
        return Err("turn_start requires session_id (app 0.1.1)"
            .to_string()
            .into());
    }
    super::run_engine(supervisor, move |engine| {
        engine.turn_start_with_vision(
            &session_id,
            &message,
            reasoning_effort.as_deref(),
            attachments,
            allow_unconfirmed_vision.unwrap_or(false),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn turn_cancel(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
) -> Result<serde_json::Value, CommandError> {
    if session_id.is_empty() {
        return Err("turn_cancel requires session_id (app 0.1.1)"
            .to_string()
            .into());
    }
    super::run_engine(supervisor, move |engine| engine.turn_cancel(&session_id)).await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn approval_resolve(
    supervisor: State<'_, EngineSupervisor>,
    approval_id: String,
    decision: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.approval_resolve(&approval_id, &decision)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn queue_add(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    message: String,
) -> Result<serde_json::Value, CommandError> {
    if session_id.is_empty() {
        return Err("queue_add requires session_id (app 0.1.1)"
            .to_string()
            .into());
    }
    super::run_engine(supervisor, move |engine| {
        engine.queue_add(&session_id, &message)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn queue_list(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
) -> Result<serde_json::Value, CommandError> {
    if session_id.is_empty() {
        return Err("queue_list requires session_id (app 0.1.1)"
            .to_string()
            .into());
    }
    super::run_engine(supervisor, move |engine| engine.queue_list(&session_id)).await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn queue_clear(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
) -> Result<serde_json::Value, CommandError> {
    if session_id.is_empty() {
        return Err("queue_clear requires session_id (app 0.1.1)"
            .to_string()
            .into());
    }
    super::run_engine(supervisor, move |engine| engine.queue_clear(&session_id)).await
}
