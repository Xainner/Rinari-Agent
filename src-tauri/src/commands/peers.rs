//! Peer messaging between the agent sessions of a board
//! (`session_peer_messaging_v1`). Thin bridge: membership, inbox listing,
//! cancel/forward and queue resume. The engine owns consent, limits and the
//! provenance ceiling; nothing here decides who may message whom.

use serde_json::Value;
use tauri::State;

use rinari_agent_lib::engine::{CommandError, EngineSupervisor};

fn require(value: &str, what: &str) -> Result<(), CommandError> {
    if value.is_empty() {
        return Err(format!("{what} is required").into());
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn peer_group_set(
    supervisor: State<'_, EngineSupervisor>,
    board_id: String,
    group_id: Option<String>,
    expected_revision: i64,
    enabled: bool,
    members: Vec<Value>,
) -> Result<Value, CommandError> {
    require(&board_id, "board_id")?;
    if expected_revision < 0 {
        return Err("expected_revision must be >= 0".to_string().into());
    }
    super::run_engine(supervisor, move |engine| {
        engine.peer_group_set(
            &board_id,
            group_id.as_deref(),
            expected_revision,
            enabled,
            members,
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn peer_group_get(
    supervisor: State<'_, EngineSupervisor>,
    board_id: Option<String>,
    session_id: Option<String>,
    group_id: Option<String>,
) -> Result<Value, CommandError> {
    if board_id.is_none() && session_id.is_none() && group_id.is_none() {
        return Err("peer_group_get needs board_id, session_id or group_id"
            .to_string()
            .into());
    }
    super::run_engine(supervisor, move |engine| {
        engine.peer_group_get(
            board_id.as_deref(),
            session_id.as_deref(),
            group_id.as_deref(),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn peer_group_revoke(
    supervisor: State<'_, EngineSupervisor>,
    group_id: String,
) -> Result<Value, CommandError> {
    require(&group_id, "group_id")?;
    super::run_engine(supervisor, move |engine| {
        engine.peer_group_revoke(&group_id)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn peer_message_list(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
) -> Result<Value, CommandError> {
    require(&session_id, "session_id")?;
    super::run_engine(supervisor, move |engine| {
        engine.peer_message_list(&session_id)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn peer_message_cancel(
    supervisor: State<'_, EngineSupervisor>,
    message_id: String,
) -> Result<Value, CommandError> {
    require(&message_id, "message_id")?;
    super::run_engine(supervisor, move |engine| {
        engine.peer_message_cancel(&message_id)
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn peer_message_forward(
    supervisor: State<'_, EngineSupervisor>,
    target_session_id: String,
    message: String,
    source_session_id: Option<String>,
    quoted_source: Option<Value>,
) -> Result<Value, CommandError> {
    require(&target_session_id, "target_session_id")?;
    if message.trim().is_empty() {
        return Err("message is required".to_string().into());
    }
    super::run_engine(supervisor, move |engine| {
        engine.peer_message_forward(
            &target_session_id,
            &message,
            source_session_id.as_deref(),
            quoted_source,
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn queue_resume(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
) -> Result<Value, CommandError> {
    require(&session_id, "session_id")?;
    super::run_engine(supervisor, move |engine| engine.queue_resume(&session_id)).await
}
