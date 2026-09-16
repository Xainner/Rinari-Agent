use rinari_agent_lib::engine::{methods::Method, CommandError, EngineSupervisor};
use tauri::State;
use tauri_plugin_opener::OpenerExt;

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn workspace_preview_start(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    path: String,
    turn_id: Option<String>,
    run_dev: Option<bool>,
    dev_url: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            Method::WorkspacePreviewStart,
            Some(serde_json::json!({
                "session_id": session_id, "path": path, "turn_id": turn_id,
                "run_dev": run_dev.unwrap_or(false), "dev_url": dev_url
            })),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn workspace_preview_status(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    preview_id: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            Method::WorkspacePreviewStatus,
            Some(serde_json::json!({"session_id": session_id, "preview_id": preview_id})),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn workspace_preview_stop(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    preview_id: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            Method::WorkspacePreviewStop,
            Some(serde_json::json!({"session_id": session_id, "preview_id": preview_id})),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn workspace_file_open(
    app: tauri::AppHandle,
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    path: String,
    turn_id: Option<String>,
) -> Result<(), CommandError> {
    let preview = workspace_file_read(supervisor, session_id, path, turn_id).await?;
    let path = preview
        .get("path")
        .and_then(|value| value.as_str())
        .ok_or_else(|| CommandError::from("Engine returned no file path".to_owned()))?;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|error| CommandError::from(error.to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn session_move(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    project_id: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            Method::SessionMove,
            Some(serde_json::json!({"session_id": session_id, "project_id": project_id})),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn workspace_file_read(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    path: String,
    turn_id: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            Method::WorkspaceFileRead,
            Some(serde_json::json!({"session_id": session_id, "path": path, "turn_id": turn_id})),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn question_list(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            Method::QuestionList,
            Some(serde_json::json!({"session_id": session_id})),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn question_resolve(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    request_id: String,
    status: String,
    answers: std::collections::HashMap<String, String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| engine.request(Method::QuestionResolve, Some(serde_json::json!({"session_id": session_id, "request_id": request_id, "status": status, "answers": answers})))).await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn browser_view_get(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    target_id: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            Method::BrowserViewGet,
            Some(serde_json::json!({"session_id": session_id, "target_id": target_id})),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn workspace_process_list(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    id: Option<String>,
    cursor: Option<String>,
    limit: Option<i64>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        // Optional params are omitted when absent: the engine rejects
        // explicit nulls for typed params such as `limit`.
        let mut params = serde_json::Map::new();
        params.insert(
            "session_id".to_string(),
            serde_json::Value::String(session_id),
        );
        if let Some(value) = id {
            params.insert("id".to_string(), serde_json::Value::String(value));
        }
        if let Some(value) = cursor {
            params.insert("cursor".to_string(), serde_json::Value::String(value));
        }
        if let Some(value) = limit {
            params.insert("limit".to_string(), serde_json::Value::Number(value.into()));
        }
        engine.request(
            Method::WorkspaceProcessList,
            Some(serde_json::Value::Object(params)),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn workspace_process_read(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    id: Option<String>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        engine.request(
            Method::WorkspaceProcessRead,
            Some(serde_json::json!({"session_id": session_id, "id": id})),
        )
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn workspace_process_stop(
    supervisor: State<'_, EngineSupervisor>,
    session_id: String,
    id: Option<String>,
    engine_instance_id: Option<String>,
    generation: Option<i64>,
) -> Result<serde_json::Value, CommandError> {
    super::run_engine(supervisor, move |engine| {
        // process_identity_v1 preconditions; omitted when absent so old
        // engines keep working without them.
        let mut params = serde_json::Map::new();
        params.insert(
            "session_id".to_string(),
            serde_json::Value::String(session_id),
        );
        if let Some(value) = id {
            params.insert("id".to_string(), serde_json::Value::String(value));
        }
        if let Some(value) = engine_instance_id {
            params.insert(
                "engine_instance_id".to_string(),
                serde_json::Value::String(value),
            );
        }
        if let Some(value) = generation {
            params.insert(
                "generation".to_string(),
                serde_json::Value::Number(value.into()),
            );
        }
        engine.request(
            Method::WorkspaceProcessStop,
            Some(serde_json::Value::Object(params)),
        )
    })
    .await
}
