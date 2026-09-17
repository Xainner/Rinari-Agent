//! EngineSupervisor: locate, spawn, handshake, route, and restart the engine.
//!
//! Path: Tauri command → EngineSupervisor → EngineTransport → Engine Protocol.
//! No harness logic lives here; this is process lifecycle plus typed routing.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};

use crate::engine::methods::{Method, REQUIRED_CAPABILITY};
use crate::engine::protocol::{EngineEvent, Hello};
use crate::engine::transport::{EngineTransport, TransportError};

/// Dev override: engine binary. Production uses the bundled sidecar / PATH.
const ENV_ENGINE_BIN: &str = "RINARI_ENGINE_BIN";
/// Dev override: extra args before `engine --stdio`, space-separated
/// (e.g. `run rinari` so `RINARI_ENGINE_BIN=uv` runs the local checkout).
const ENV_ENGINE_ARGS: &str = "RINARI_ENGINE_ARGS";
/// Dev override: working directory for the engine process.
const ENV_ENGINE_CWD: &str = "RINARI_ENGINE_CWD";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineState {
    Stopped,
    Starting,
    Handshaking,
    Ready,
    Degraded,
    Restarting,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct EngineStatus {
    pub state: EngineState,
    pub engine_version: Option<String>,
    pub protocol_version: Option<u32>,
    pub detail: Option<String>,
    pub capabilities: HashMap<String, bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl CommandError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl From<TransportError> for CommandError {
    fn from(error: TransportError) -> Self {
        match error {
            TransportError::Engine(engine) => Self::new(engine.code, engine.message),
            TransportError::Timeout(message) => Self::new("ENGINE_TIMEOUT", message),
            TransportError::ShutDown => Self::new("ENGINE_DOWN", "engine is not running"),
            TransportError::Spawn(message) => Self::new("ENGINE_SPAWN", message),
            TransportError::Handshake(message) => Self::new("ENGINE_HANDSHAKE", message),
            TransportError::Io(message) => Self::new("ENGINE_IO", message),
        }
    }
}

impl From<String> for CommandError {
    fn from(message: String) -> Self {
        Self::new("ENGINE_ERROR", message)
    }
}

/// Frontend event sink. `main.rs` installs a closure that forwards to the
/// WebView; kept as a trait object so this module never links Tauri
/// (unit-test binaries have no SxS manifest for the UI runtime).
pub type EventSink = Arc<dyn Fn(EngineEvent) + Send + Sync + 'static>;

struct Inner {
    state: EngineState,
    transport: Option<Arc<EngineTransport>>,
    hello: Option<Hello>,
    detail: Option<String>,
    pump: Option<JoinHandle<()>>,
    sink: Option<EventSink>,
}

#[derive(Clone)]
pub struct EngineSupervisor {
    inner: Arc<std::sync::Mutex<Inner>>,
}

impl EngineSupervisor {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(std::sync::Mutex::new(Inner {
                state: EngineState::Stopped,
                transport: None,
                hello: None,
                detail: None,
                pump: None,
                sink: None,
            })),
        }
    }

    /// Install (or replace) the event sink; starts the pump when a live
    /// transport is already present.
    pub fn set_sink(&self, sink: EventSink) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.sink = Some(sink);
        }
        self.maybe_start_pump();
    }

    pub fn status(&self) -> EngineStatus {
        match self.inner.lock() {
            Ok(inner) => {
                let mut state = inner.state;
                let mut detail = inner.detail.clone();
                if state == EngineState::Ready
                    && !inner
                        .transport
                        .as_ref()
                        .map(|transport| transport.is_running())
                        .unwrap_or(false)
                {
                    // The child exited without shutdown(): surface Degraded
                    // instead of a stale Ready so the UI can offer restart.
                    state = EngineState::Degraded;
                    detail = Some("engine process exited".to_string());
                }
                EngineStatus {
                    state,
                    engine_version: inner
                        .hello
                        .as_ref()
                        .map(|hello| hello.engine_version.clone()),
                    protocol_version: inner.hello.as_ref().map(|hello| hello.protocol_version),
                    detail,
                    capabilities: inner
                        .hello
                        .as_ref()
                        .map(|hello| hello.capabilities.clone())
                        .unwrap_or_default(),
                }
            }
            Err(_) => EngineStatus {
                state: EngineState::Failed,
                engine_version: None,
                protocol_version: None,
                detail: Some("supervisor lock poisoned".to_string()),
                capabilities: HashMap::new(),
            },
        }
    }

    fn set_state(&self, state: EngineState, detail: Option<String>) {
        if let Ok(mut inner) = self.inner.lock() {
            // A failure always records why. The previous guard kept an
            // existing detail on the way into Failed, meaning to protect a
            // first failure reason from a later one -- but `detail` also
            // carries progress ("spawning uv" while handshaking), and every
            // path into Failed passes through Handshaking first, so it only
            // ever discarded the real reason and left the step it died on.
            inner.state = state;
            inner.detail = detail;
        }
    }

    /// Locate the engine binary: dev override first, `rinari` on PATH otherwise.
    /// Production prefers the bundled sidecar via [`Self::start_with_sidecar`]
    /// (resolved by the Tauri host from its resource dir).
    fn locate() -> Result<(String, Vec<String>, Option<PathBuf>), CommandError> {
        if let Ok(bin) = std::env::var(ENV_ENGINE_BIN) {
            let mut args: Vec<String> = std::env::var(ENV_ENGINE_ARGS)
                .map(|raw| raw.split_whitespace().map(str::to_string).collect())
                .unwrap_or_default();
            args.push("engine".to_string());
            args.push("--stdio".to_string());
            let cwd = std::env::var(ENV_ENGINE_CWD).ok().map(PathBuf::from);
            return Ok((bin, args, cwd));
        }
        #[cfg(debug_assertions)]
        if let Some(cwd) = dev_engine_checkout(std::path::Path::new(env!("CARGO_MANIFEST_DIR"))) {
            return Ok((
                "uv".to_string(),
                vec![
                    "run".to_string(),
                    "rinari".to_string(),
                    "engine".to_string(),
                    "--stdio".to_string(),
                ],
                Some(cwd),
            ));
        }
        Ok((
            "rinari".to_string(),
            vec!["engine".to_string(), "--stdio".to_string()],
            None,
        ))
    }

    pub fn start(&self) -> Result<EngineStatus, CommandError> {
        if self.status().state == EngineState::Ready {
            return Ok(self.status());
        }
        self.set_state(EngineState::Starting, None);
        let (program, args, cwd) = Self::locate()?;
        self.start_with(&program, &args, cwd.as_deref())
    }

    /// Start with an explicit binary: bundled sidecar path in production,
    /// or a scripted fake engine in tests. `start()` locates via env/PATH
    /// and then calls this.
    pub fn start_with(
        &self,
        program: &str,
        args: &[String],
        cwd: Option<&std::path::Path>,
    ) -> Result<EngineStatus, CommandError> {
        if self.status().state == EngineState::Ready {
            return Ok(self.status());
        }
        self.set_state(
            EngineState::Handshaking,
            Some(format!("spawning {program}")),
        );
        let (transport, hello) = EngineTransport::spawn(program, args, cwd).map_err(|error| {
            self.set_state(EngineState::Failed, Some(error.to_string()));
            CommandError::from(error)
        })?;
        if [
            REQUIRED_CAPABILITY,
            "tool_contracts_v1",
            "desktop_workspace_v1",
            "interactive_questions_v1",
            "web_preview_v1",
            "plan_read_scope_v1",
            "persistent_context_compaction_v1",
            "recoverable_tool_results_v1",
        ]
        .iter()
        .any(|cap| hello.capabilities.get(*cap) != Some(&true))
        {
            transport.shutdown();
            let message = concat!(
                "The active Rinari Engine is outdated and does not support the desktop turn ",
                "runtime required by this app. Rebuild the packaged engine or use the current ",
                "Rinari-CLI checkout."
            );
            self.set_state(EngineState::Failed, Some(message.to_string()));
            return Err(CommandError::new("ENGINE_INCOMPATIBLE", message));
        }
        let transport = Arc::new(transport);
        if let Ok(mut inner) = self.inner.lock() {
            inner.transport = Some(Arc::clone(&transport));
            inner.hello = Some(hello);
            inner.state = EngineState::Ready;
            inner.detail = None;
        }
        self.maybe_start_pump();
        Ok(self.status())
    }

    pub fn shutdown(&self) -> EngineStatus {
        // Take the transport FIRST: dropping our Arc lets the pump observe
        // strong_count == 1, drain once, and exit so join() below returns.
        // Joining before the take deadlocks (pump waits for us, we for it).
        let pump = if let Ok(mut inner) = self.inner.lock() {
            if let Some(transport) = inner.transport.take() {
                transport.shutdown();
            }
            inner.hello = None;
            inner.state = EngineState::Stopped;
            inner.detail = None;
            inner.pump.take()
        } else {
            None
        };
        if let Some(pump) = pump {
            let _ = pump.join();
        }
        self.status()
    }

    pub fn restart(&self) -> Result<EngineStatus, CommandError> {
        self.set_state(EngineState::Restarting, None);
        self.shutdown();
        self.start()
    }

    /// Production start: bundled sidecar resolved from the Tauri resource
    /// dir, without env/PATH. Returns `None` when no sidecar is present so
    /// the host can fall back to [`Self::start`].
    pub fn start_with_sidecar(
        &self,
        resource_dir: &std::path::Path,
    ) -> Option<Result<EngineStatus, CommandError>> {
        let (program, args) = sidecar_command(resource_dir)?;
        Some(self.start_with(&program, &args, None))
    }

    /// Poll one pending engine event (pump forwards the rest to the frontend).
    pub fn poll_event(&self) -> Option<EngineEvent> {
        if let Ok(inner) = self.inner.lock() {
            inner.transport.as_ref()?.try_recv_event()
        } else {
            None
        }
    }

    pub fn request(&self, method: Method, params: Option<Value>) -> Result<Value, CommandError> {
        let transport = self.current_transport()?;
        let timeout = match method {
            Method::ProjectStatus => Duration::from_secs(5),
            Method::SessionList
            | Method::SessionCreate
            | Method::SessionOpen
            | Method::SessionRename
            | Method::SessionArchive
            | Method::SessionRestore
            | Method::SessionFork
            | Method::SessionClose
            | Method::SessionHistory => Duration::from_secs(10),
            Method::SessionTurnStart | Method::ModelDiscoveryStart => Duration::from_secs(5),
            _ => Duration::from_secs(60),
        };
        transport
            .request_with_timeout(method.as_str(), params, timeout)
            .map_err(CommandError::from)
    }

    pub fn session_list(
        &self,
        kind: Option<String>,
        include_closed: bool,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        if let Some(kind) = kind {
            params.insert("kind".to_string(), Value::String(kind));
        }
        params.insert("include_closed".to_string(), Value::Bool(include_closed));
        self.request(Method::SessionList, Some(Value::Object(params)))
    }

    pub fn session_list_filtered(
        &self,
        kind: Option<String>,
        include_closed: bool,
        project_id: Option<String>,
        state: Option<String>,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::SessionList,
            Some(json!({
                "kind": kind,
                "include_closed": include_closed,
                "project_id": project_id,
                "state": state,
            })),
        )
    }

    pub fn session_create(
        &self,
        cwd: Option<String>,
        chat: bool,
        title: Option<String>,
    ) -> Result<Value, CommandError> {
        self.session_create_with_options(cwd, chat, title, None, None)
    }

    pub fn session_create_with_options(
        &self,
        cwd: Option<String>,
        chat: bool,
        title: Option<String>,
        mode: Option<String>,
        permission_profile: Option<String>,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        if let Some(cwd) = cwd {
            params.insert("cwd".to_string(), Value::String(cwd));
        }
        params.insert("chat".to_string(), Value::Bool(chat));
        if let Some(title) = title {
            params.insert("title".to_string(), Value::String(title));
        }
        if let Some(mode) = mode {
            params.insert("mode".to_string(), Value::String(mode));
        }
        if let Some(profile) = permission_profile {
            params.insert("permission_profile".to_string(), Value::String(profile));
        }
        self.request(Method::SessionCreate, Some(Value::Object(params)))
    }

    pub fn turn_start(&self, session_id: &str, message: &str) -> Result<Value, CommandError> {
        self.turn_start_with_options(session_id, message, None, None)
    }

    pub fn turn_start_with_effort(
        &self,
        session_id: &str,
        message: &str,
        reasoning_effort: Option<&str>,
    ) -> Result<Value, CommandError> {
        self.turn_start_with_options(session_id, message, reasoning_effort, None)
    }

    pub fn turn_start_with_options(
        &self,
        session_id: &str,
        message: &str,
        reasoning_effort: Option<&str>,
        attachments: Option<Value>,
    ) -> Result<Value, CommandError> {
        self.turn_start_with_vision(session_id, message, reasoning_effort, attachments, false)
    }

    pub fn turn_start_with_vision(
        &self,
        session_id: &str,
        message: &str,
        reasoning_effort: Option<&str>,
        attachments: Option<Value>,
        allow_unconfirmed_vision: bool,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::SessionTurnStart,
            Some(json!({
                "session_id": session_id,
                "message": message,
                "reasoning_effort": reasoning_effort,
                "attachments": attachments.unwrap_or_else(|| Value::Array(vec![])),
                "allow_unconfirmed_vision": allow_unconfirmed_vision,
            })),
        )
    }

    pub fn session_permission_set(
        &self,
        reference: &str,
        profile: &str,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::SessionPermissionSet,
            Some(json!({"ref": reference, "permission_profile": profile})),
        )
    }

    pub fn session_permission_get(&self, reference: &str) -> Result<Value, CommandError> {
        self.request(
            Method::SessionPermissionGet,
            Some(json!({"ref": reference})),
        )
    }

    pub fn turn_changes_get(&self, turn_id: &str) -> Result<Value, CommandError> {
        self.request(Method::TurnChangesGet, Some(json!({"turn_id": turn_id})))
    }

    pub fn turn_changes_review(
        &self,
        turn_id: &str,
        path: Option<&str>,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::TurnChangesReview,
            Some(json!({"turn_id": turn_id, "path": path})),
        )
    }

    pub fn turn_changes_undo_preview(
        &self,
        turn_id: &str,
        paths: Option<Vec<String>>,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::TurnChangesUndoPreview,
            Some(json!({"turn_id": turn_id, "paths": paths})),
        )
    }

    pub fn turn_changes_undo(
        &self,
        turn_id: &str,
        paths: Option<Vec<String>>,
        apply_safe_only: bool,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::TurnChangesUndo,
            Some(json!({
                "turn_id": turn_id,
                "paths": paths,
                "apply_safe_only": apply_safe_only,
            })),
        )
    }

    pub fn session_model_set(
        &self,
        reference: &str,
        model: &str,
        provider: Option<&str>,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::SessionModelSet,
            Some(json!({"ref": reference, "model": model, "provider": provider})),
        )
    }

    pub fn workspace_file_search(
        &self,
        session_id: &str,
        query: &str,
        limit: u32,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::WorkspaceFileSearch,
            Some(json!({"session_id": session_id, "query": query, "limit": limit})),
        )
    }

    pub fn turn_cancel(&self, session_id: &str) -> Result<Value, CommandError> {
        self.request(
            Method::SessionTurnCancel,
            Some(json!({"session_id": session_id})),
        )
    }

    pub fn session_open(&self, reference: &str) -> Result<Value, CommandError> {
        self.request(Method::SessionOpen, Some(json!({"ref": reference})))
    }

    pub fn session_rename(&self, reference: &str, title: &str) -> Result<Value, CommandError> {
        self.request(
            Method::SessionRename,
            Some(json!({"ref": reference, "title": title})),
        )
    }

    pub fn session_archive(&self, reference: &str) -> Result<Value, CommandError> {
        self.request(Method::SessionArchive, Some(json!({"ref": reference})))
    }

    pub fn session_restore(&self, reference: &str) -> Result<Value, CommandError> {
        self.request(Method::SessionRestore, Some(json!({"ref": reference})))
    }

    pub fn session_close(&self, reference: &str) -> Result<Value, CommandError> {
        self.request(Method::SessionClose, Some(json!({"ref": reference})))
    }

    pub fn session_delete(&self, reference: &str, cascade: bool) -> Result<Value, CommandError> {
        self.request(
            Method::SessionDelete,
            Some(json!({"ref": reference, "cascade": cascade})),
        )
    }

    pub fn session_history(
        &self,
        reference: &str,
        limit: Option<u32>,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        params.insert("ref".to_string(), Value::String(reference.to_string()));
        if let Some(limit) = limit {
            params.insert("limit".to_string(), Value::Number(limit.into()));
        }
        self.request(Method::SessionHistory, Some(Value::Object(params)))
    }

    pub fn session_timeline(
        &self,
        reference: &str,
        before_turn_index: Option<u64>,
        limit: Option<u32>,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        params.insert("ref".to_string(), Value::String(reference.to_string()));
        if let Some(before) = before_turn_index {
            params.insert(
                "before_turn_index".to_string(),
                Value::Number(before.into()),
            );
        }
        if let Some(limit) = limit {
            params.insert("limit".to_string(), Value::Number(limit.into()));
        }
        self.request(Method::SessionTimeline, Some(Value::Object(params)))
    }

    pub fn session_mode_set(&self, reference: &str, mode: &str) -> Result<Value, CommandError> {
        self.request(
            Method::SessionModeSet,
            Some(json!({"ref": reference, "mode": mode})),
        )
    }

    // -- tasks / verification / checkpoints / working tree (Phase 6) --------

    pub fn task_tree(&self, path: &str) -> Result<Value, CommandError> {
        self.request(Method::TaskTree, Some(json!({"path": path})))
    }

    pub fn task_get(&self, path: &str, task_id: &str) -> Result<Value, CommandError> {
        self.request(
            Method::TaskGet,
            Some(json!({"path": path, "task_id": task_id})),
        )
    }

    pub fn verification_latest(
        &self,
        path: &str,
        kinds: Option<Vec<String>>,
        limit: Option<u32>,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        params.insert("path".to_string(), Value::String(path.to_string()));
        if let Some(kinds) = kinds {
            params.insert("kinds".to_string(), json!(kinds));
        }
        if let Some(limit) = limit {
            params.insert("limit".to_string(), Value::Number(limit.into()));
        }
        self.request(Method::VerificationLatest, Some(Value::Object(params)))
    }

    pub fn verification_plan(
        &self,
        path: &str,
        changed_files: Vec<String>,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::VerificationPlan,
            Some(json!({"path": path, "changed_files": changed_files})),
        )
    }

    pub fn checkpoint_list(&self, path: Option<String>) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        if let Some(path) = path {
            params.insert("path".to_string(), Value::String(path));
        }
        self.request(Method::CheckpointList, Some(Value::Object(params)))
    }

    pub fn checkpoint_show(&self, checkpoint_id: &str) -> Result<Value, CommandError> {
        self.request(
            Method::CheckpointShow,
            Some(json!({"checkpoint_id": checkpoint_id})),
        )
    }

    pub fn checkpoint_restore(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::CheckpointRestore, Some(params))
    }

    pub fn project_changes(&self, path: &str) -> Result<Value, CommandError> {
        self.request(Method::ProjectChanges, Some(json!({"path": path})))
    }

    pub fn project_diff(
        &self,
        path: &str,
        file: Option<String>,
        max_chars: Option<u32>,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        params.insert("path".to_string(), Value::String(path.to_string()));
        if let Some(file) = file {
            params.insert("file".to_string(), Value::String(file));
        }
        if let Some(max_chars) = max_chars {
            params.insert("max_chars".to_string(), Value::Number(max_chars.into()));
        }
        self.request(Method::ProjectDiff, Some(Value::Object(params)))
    }

    // -- agents (Phase 7) -----------------------------------------------------

    pub fn project_list_recent(&self, limit: Option<u32>) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        if let Some(limit) = limit {
            params.insert("limit".to_string(), Value::Number(limit.into()));
        }
        self.request(Method::ProjectListRecent, Some(Value::Object(params)))
    }

    pub fn project_list(&self, include_archived: bool) -> Result<Value, CommandError> {
        self.request(
            Method::ProjectList,
            Some(json!({"include_archived": include_archived})),
        )
    }

    pub fn project_get(&self, project_id: &str) -> Result<Value, CommandError> {
        self.request(Method::ProjectGet, Some(json!({"project_id": project_id})))
    }

    pub fn project_add(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::ProjectAdd, Some(params))
    }

    pub fn project_update(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::ProjectUpdate, Some(params))
    }

    pub fn project_remove(
        &self,
        project_id: &str,
        session_policy: &str,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::ProjectRemove,
            Some(json!({"project_id": project_id, "session_policy": session_policy})),
        )
    }

    pub fn project_open(&self, path: &str) -> Result<Value, CommandError> {
        self.request(Method::ProjectOpen, Some(json!({"path": path})))
    }

    pub fn project_status(&self, path: &str) -> Result<Value, CommandError> {
        self.request(Method::ProjectStatus, Some(json!({"path": path})))
    }

    pub fn project_intelligence(&self, path: &str) -> Result<Value, CommandError> {
        self.request(Method::ProjectIntelligence, Some(json!({"path": path})))
    }

    pub fn project_trust(&self, path: &str) -> Result<Value, CommandError> {
        self.request(Method::ProjectTrust, Some(json!({"path": path})))
    }

    pub fn agent_list(&self) -> Result<Value, CommandError> {
        self.request(Method::AgentList, None)
    }

    pub fn agent_config_get(&self, agent: &str) -> Result<Value, CommandError> {
        self.request(Method::AgentConfigGet, Some(json!({"agent": agent})))
    }

    pub fn agent_config_set(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::AgentConfigSet, Some(params))
    }

    pub fn session_events(
        &self,
        reference: &str,
        after_seq: Option<u64>,
        limit: Option<u32>,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        params.insert("ref".to_string(), Value::String(reference.to_string()));
        if let Some(after_seq) = after_seq {
            params.insert("after_seq".to_string(), Value::Number(after_seq.into()));
        }
        if let Some(limit) = limit {
            params.insert("limit".to_string(), Value::Number(limit.into()));
        }
        self.request(Method::SessionEvents, Some(Value::Object(params)))
    }

    // -- souls (Phase 8) ------------------------------------------------------

    pub fn soul_list(&self) -> Result<Value, CommandError> {
        self.request(Method::SoulList, None)
    }

    pub fn soul_get(&self, soul_id: &str) -> Result<Value, CommandError> {
        self.request(Method::SoulGet, Some(json!({"id": soul_id})))
    }

    pub fn soul_create(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::SoulCreate, Some(params))
    }

    pub fn soul_update(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::SoulUpdate, Some(params))
    }

    pub fn soul_remove(&self, soul_id: &str) -> Result<Value, CommandError> {
        self.request(Method::SoulRemove, Some(json!({"id": soul_id})))
    }

    pub fn soul_activate(&self, soul_id: &str) -> Result<Value, CommandError> {
        self.request(Method::SoulActivate, Some(json!({"id": soul_id})))
    }

    // -- ecosystem (Phase 9) ----------------------------------------------------

    pub fn mcp_list(&self) -> Result<Value, CommandError> {
        self.request(Method::McpList, None)
    }

    pub fn mcp_get(&self, name: &str) -> Result<Value, CommandError> {
        self.request(Method::McpGet, Some(json!({"name": name})))
    }

    pub fn mcp_create(&self, name: &str, command: Vec<String>) -> Result<Value, CommandError> {
        self.request(
            Method::McpCreate,
            Some(json!({"name": name, "command": command})),
        )
    }

    pub fn mcp_remove(&self, name: &str) -> Result<Value, CommandError> {
        self.request(Method::McpRemove, Some(json!({"name": name})))
    }

    pub fn mcp_enable(&self, name: &str) -> Result<Value, CommandError> {
        self.request(Method::McpEnable, Some(json!({"name": name})))
    }

    pub fn mcp_disable(&self, name: &str) -> Result<Value, CommandError> {
        self.request(Method::McpDisable, Some(json!({"name": name})))
    }

    pub fn mcp_test(&self, name: &str) -> Result<Value, CommandError> {
        self.request(Method::McpTest, Some(json!({"name": name})))
    }

    pub fn plugin_list(&self) -> Result<Value, CommandError> {
        self.request(Method::PluginList, None)
    }

    pub fn plugin_get(&self, name: &str) -> Result<Value, CommandError> {
        self.request(Method::PluginGet, Some(json!({"name": name})))
    }

    pub fn plugin_enable(&self, name: &str) -> Result<Value, CommandError> {
        self.request(Method::PluginEnable, Some(json!({"name": name})))
    }

    pub fn plugin_disable(&self, name: &str) -> Result<Value, CommandError> {
        self.request(Method::PluginDisable, Some(json!({"name": name})))
    }

    pub fn plugin_diagnostics(&self) -> Result<Value, CommandError> {
        self.request(Method::PluginDiagnostics, None)
    }

    pub fn tool_list(&self) -> Result<Value, CommandError> {
        self.request(Method::ToolList, None)
    }

    pub fn policy_get(&self) -> Result<Value, CommandError> {
        self.request(Method::PolicyGet, None)
    }

    // -- observability (Phase 10) -------------------------------------------------

    pub fn artifact_list(&self, session_id: Option<String>) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        if let Some(session_id) = session_id {
            params.insert("session_id".to_string(), Value::String(session_id));
        }
        let params = if params.is_empty() {
            None
        } else {
            Some(Value::Object(params))
        };
        self.request(Method::ArtifactList, params)
    }

    pub fn artifact_read(&self, uri: &str, max_bytes: Option<u32>) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        params.insert("uri".to_string(), Value::String(uri.to_string()));
        if let Some(max_bytes) = max_bytes {
            params.insert("max_bytes".to_string(), Value::Number(max_bytes.into()));
        }
        self.request(Method::ArtifactRead, Some(Value::Object(params)))
    }

    pub fn attachment_prepare(
        &self,
        session_id: &str,
        attachments: Value,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::AttachmentPrepare,
            Some(json!({"session_id": session_id, "attachments": attachments})),
        )
    }

    pub fn attachment_preview(
        &self,
        uri: &str,
        max_bytes: Option<u32>,
        max_dimension: Option<u32>,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        params.insert("uri".to_string(), Value::String(uri.to_string()));
        if let Some(dimension) = max_dimension {
            params.insert("max_dimension".to_string(), Value::Number(dimension.into()));
        }
        if let Some(max_bytes) = max_bytes {
            params.insert("max_bytes".to_string(), Value::Number(max_bytes.into()));
        }
        self.request(Method::AttachmentPreview, Some(Value::Object(params)))
    }

    pub fn attachment_prepare_start(
        &self,
        session_id: &str,
        attachments: Value,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::AttachmentPrepareStart,
            Some(json!({"session_id": session_id, "attachments": attachments})),
        )
    }

    pub fn attachment_prepare_get(&self, job_id: &str) -> Result<Value, CommandError> {
        self.request(
            Method::AttachmentPrepareGet,
            Some(json!({"job_id": job_id})),
        )
    }

    pub fn attachment_prepare_cancel(&self, job_id: &str) -> Result<Value, CommandError> {
        self.request(
            Method::AttachmentPrepareCancel,
            Some(json!({"job_id": job_id})),
        )
    }

    pub fn context_get(&self, reference: &str) -> Result<Value, CommandError> {
        self.request(Method::ContextGet, Some(json!({"ref": reference})))
    }

    pub fn usage_get(&self, reference: Option<String>) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        if let Some(reference) = reference {
            params.insert("ref".to_string(), Value::String(reference));
        }
        let params = if params.is_empty() {
            None
        } else {
            Some(Value::Object(params))
        };
        self.request(Method::UsageGet, params)
    }

    // -- workflow (Phase 11) ------------------------------------------------------

    pub fn queue_add(&self, session_id: &str, message: &str) -> Result<Value, CommandError> {
        self.request(
            Method::SessionQueueAdd,
            Some(json!({"session_id": session_id, "message": message})),
        )
    }

    pub fn queue_list(&self, session_id: &str) -> Result<Value, CommandError> {
        self.request(
            Method::SessionQueueList,
            Some(json!({"session_id": session_id})),
        )
    }

    pub fn queue_clear(&self, session_id: &str) -> Result<Value, CommandError> {
        self.request(
            Method::SessionQueueClear,
            Some(json!({"session_id": session_id})),
        )
    }

    pub fn bundle_list(&self) -> Result<Value, CommandError> {
        self.request(Method::ProfileBundleList, None)
    }

    pub fn bundle_get(&self, id: &str) -> Result<Value, CommandError> {
        self.request(Method::ProfileBundleGet, Some(json!({"id": id})))
    }

    pub fn bundle_create(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::ProfileBundleCreate, Some(params))
    }

    pub fn bundle_remove(&self, id: &str) -> Result<Value, CommandError> {
        self.request(Method::ProfileBundleRemove, Some(json!({"id": id})))
    }

    pub fn bundle_apply(
        &self,
        id: &str,
        session_ref: Option<String>,
    ) -> Result<Value, CommandError> {
        let mut params = serde_json::Map::new();
        params.insert("id".to_string(), Value::String(id.to_string()));
        if let Some(session_ref) = session_ref {
            params.insert("session_ref".to_string(), Value::String(session_ref));
        }
        self.request(Method::ProfileBundleApply, Some(Value::Object(params)))
    }

    pub fn approval_resolve(
        &self,
        approval_id: &str,
        decision: &str,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::ApprovalResolve,
            Some(json!({"approval_id": approval_id, "decision": decision})),
        )
    }

    pub fn snapshot_get(&self) -> Result<Value, CommandError> {
        self.request(Method::RuntimeSnapshotGet, None)
    }

    // -- providers / models (Phase 3) --------------------------------------

    pub fn provider_list(&self) -> Result<Value, CommandError> {
        self.request(Method::ProviderList, None)
    }

    pub fn provider_create(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::ProviderCreate, Some(params))
    }

    pub fn provider_get(&self, ref_: &str) -> Result<Value, CommandError> {
        self.request(Method::ProviderGet, Some(json!({ "ref": ref_ })))
    }

    pub fn provider_update(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::ProviderUpdate, Some(params))
    }

    pub fn provider_remove(
        &self,
        ref_: &str,
        switch_to: Option<String>,
        keep_credentials: bool,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::ProviderRemove,
            Some(json!({ "ref": ref_, "switch_to": switch_to, "keep_credentials": keep_credentials })),
        )
    }

    pub fn provider_test(&self, ref_: &str) -> Result<Value, CommandError> {
        self.request(Method::ProviderTest, Some(json!({ "ref": ref_ })))
    }

    pub fn provider_discover(&self) -> Result<Value, CommandError> {
        self.request(Method::ProviderDiscover, None)
    }

    pub fn provider_use(&self, ref_: &str) -> Result<Value, CommandError> {
        self.request(Method::ProviderUse, Some(json!({ "ref": ref_ })))
    }

    pub fn model_list(&self, provider: Option<String>) -> Result<Value, CommandError> {
        self.request(Method::ModelList, Some(json!({ "provider": provider })))
    }

    pub fn model_get(&self, ref_: &str, provider: Option<String>) -> Result<Value, CommandError> {
        self.request(
            Method::ModelGet,
            Some(json!({ "ref": ref_, "provider": provider })),
        )
    }

    pub fn model_add(&self, params: Value) -> Result<Value, CommandError> {
        self.request(Method::ModelAdd, Some(params))
    }

    pub fn model_alias(
        &self,
        ref_: &str,
        new_alias: &str,
        provider: Option<String>,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::ModelAlias,
            Some(json!({ "ref": ref_, "new_alias": new_alias, "provider": provider })),
        )
    }

    pub fn model_remove(
        &self,
        ref_: &str,
        provider: Option<String>,
    ) -> Result<Value, CommandError> {
        self.request(
            Method::ModelRemove,
            Some(json!({ "ref": ref_, "provider": provider })),
        )
    }

    pub fn model_use(&self, ref_: &str, provider: Option<String>) -> Result<Value, CommandError> {
        self.request(
            Method::ModelUse,
            Some(json!({ "ref": ref_, "provider": provider })),
        )
    }

    pub fn model_discover(&self, provider: Option<String>) -> Result<Value, CommandError> {
        self.request(Method::ModelDiscover, Some(json!({ "provider": provider })))
    }

    pub fn model_discovery_start(&self, provider: Option<String>) -> Result<Value, CommandError> {
        self.request(
            Method::ModelDiscoveryStart,
            Some(json!({"provider": provider})),
        )
    }

    pub fn model_refresh(&self, provider: Option<String>) -> Result<Value, CommandError> {
        self.request(Method::ModelRefresh, Some(json!({ "provider": provider })))
    }

    pub fn model_test(&self, ref_: &str, provider: Option<String>) -> Result<Value, CommandError> {
        self.request(
            Method::ModelTest,
            Some(json!({ "ref": ref_, "provider": provider })),
        )
    }

    fn current_transport(&self) -> Result<Arc<EngineTransport>, CommandError> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| CommandError::new("ENGINE_ERROR", "lock"))?;
        if inner.state != EngineState::Ready {
            return Err(CommandError::new(
                "ENGINE_NOT_READY",
                format!("engine is {:?}, start it first", inner.state),
            ));
        }
        inner
            .transport
            .clone()
            .ok_or_else(|| CommandError::new("ENGINE_DOWN", "no transport"))
    }

    /// Start the forward pump when a sink and a live transport are present.
    fn maybe_start_pump(&self) {
        let (transport, sink) = match self.inner.lock() {
            Ok(inner) => match (inner.transport.clone(), inner.sink.clone()) {
                (Some(transport), Some(sink)) if inner.pump.is_none() => (transport, sink),
                _ => return,
            },
            Err(_) => return,
        };
        self.start_pump(transport, sink);
    }

    fn start_pump(&self, transport: Arc<EngineTransport>, sink: EventSink) {
        // Only called with inner.pump == None (see maybe_start_pump).
        let pump = thread::Builder::new()
            .name("engine-event-pump".to_string())
            .spawn(move || {
                loop {
                    match transport.try_recv_event() {
                        Some(event) => sink(event),
                        None => thread::sleep(Duration::from_millis(20)),
                    }
                    // Exit when a newer pump replaced us; transport shutdown
                    // also ends the stream (reader EOF drains pending).
                    if Arc::strong_count(&transport) == 1 {
                        // Only our own Arc left: supervisor dropped it.
                        // Drain once more, then exit.
                        while let Some(event) = transport.try_recv_event() {
                            sink(event);
                        }
                        break;
                    }
                }
            })
            .expect("spawn event pump");
        if let Ok(mut inner) = self.inner.lock() {
            inner.pump = Some(pump);
        }
    }
}

#[cfg(debug_assertions)]
fn dev_engine_checkout(manifest_dir: &std::path::Path) -> Option<PathBuf> {
    let app_root = manifest_dir.parent()?;
    let candidates = [
        app_root.join("..").join("Rinari-CLI"),
        app_root.join("..").join("..").join("Rinari-CLI"),
    ];
    candidates.into_iter().find_map(|candidate| {
        let resolved = candidate.canonicalize().ok()?;
        resolved
            .join("pyproject.toml")
            .is_file()
            .then_some(resolved)
    })
}

impl Default for EngineSupervisor {
    fn default() -> Self {
        Self::new()
    }
}

/// Bundled sidecar entry: `<resource_dir>/engine-dist/python(.exe)`
/// running the installed `rinari` package. Pure so unit tests cover the
/// layout without spawning anything.
fn sidecar_command(resource_dir: &std::path::Path) -> Option<(String, Vec<String>)> {
    #[cfg(windows)]
    let python = resource_dir.join("engine-dist").join("python.exe");
    #[cfg(not(windows))]
    let python = resource_dir.join("engine-dist").join("python");
    if !python.is_file() {
        return None;
    }
    Some((
        python.to_string_lossy().into_owned(),
        vec![
            "-m".to_string(),
            "rinari".to_string(),
            "engine".to_string(),
            "--stdio".to_string(),
        ],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_state_is_stopped() {
        let supervisor = EngineSupervisor::new();
        let status = supervisor.status();
        assert_eq!(status.state, EngineState::Stopped);
        assert!(status.engine_version.is_none());
    }

    #[test]
    fn failure_detail_reports_the_reason_not_the_step() {
        // Every path into Failed goes through Handshaking, which parks
        // "spawning <program>" in the same field. Reporting that instead of
        // the error turned "the engine refused its own database" into a
        // message about uv.
        let supervisor = EngineSupervisor::new();
        let error = supervisor
            .start_with("rinari-engine-that-does-not-exist", &[], None)
            .expect_err("must fail to spawn");
        let status = supervisor.status();
        assert_eq!(status.state, EngineState::Failed);
        let detail = status.detail.expect("a failure states its reason");
        assert!(
            !detail.starts_with("spawning"),
            "detail still reports the step, not the reason: {detail}"
        );
        assert!(
            detail.contains(&error.message) || error.message.contains(&detail),
            "detail ({detail}) and error ({}) disagree",
            error.message
        );
    }

    #[test]
    fn request_without_engine_is_not_ready() {
        let supervisor = EngineSupervisor::new();
        let error = supervisor
            .request(Method::SessionList, None)
            .expect_err("must refuse");
        assert_eq!(error.code, "ENGINE_NOT_READY");
    }

    #[test]
    fn shutdown_is_idempotent_from_stopped() {
        let supervisor = EngineSupervisor::new();
        assert_eq!(supervisor.shutdown().state, EngineState::Stopped);
        assert_eq!(supervisor.shutdown().state, EngineState::Stopped);
    }

    #[test]
    fn sidecar_missing_without_engine_dist() {
        let dir = std::env::temp_dir().join("rinari-no-sidecar-probe");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("probe dir");
        assert!(sidecar_command(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sidecar_resolves_packaged_layout() {
        let dir = std::env::temp_dir().join("rinari-sidecar-probe");
        let _ = std::fs::remove_dir_all(&dir);
        let dist = dir.join("engine-dist");
        std::fs::create_dir_all(&dist).expect("probe dist");
        #[cfg(windows)]
        let python = dist.join("python.exe");
        #[cfg(not(windows))]
        let python = dist.join("python");
        std::fs::write(&python, b"stub").expect("probe python");
        let (program, args) = sidecar_command(&dir).expect("sidecar present");
        assert_eq!(program, python.to_string_lossy());
        assert_eq!(args, vec!["-m", "rinari", "engine", "--stdio"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[ignore = "requires the packaged Python engine; uses an isolated temporary home"]
    fn packaged_engine_browser_catalog_roundtrip() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let (program, _) = sidecar_command(root).expect("package the engine first");
        let image_path =
            std::env::temp_dir().join(format!("rinari-image-bridge-{}.png", std::process::id()));
        let code = concat!(
            "import os,runpy,sys,tempfile\n",
            "from PIL import Image\n",
            "Image.new('RGB',(1800,1000),'purple').save(sys.argv[1])\n",
            "with tempfile.TemporaryDirectory(prefix='rinari-agent-browser-bridge-') as home:\n",
            " os.environ['RINARI_HOME']=home\n",
            " os.environ['RINARI_KEYRING']='0'\n",
            " sys.argv=['rinari','engine','--stdio']\n",
            " runpy.run_module('rinari',run_name='__main__')\n"
        );
        let supervisor = EngineSupervisor::new();
        supervisor
            .start_with(
                &program,
                &[
                    "-c".into(),
                    code.into(),
                    image_path.to_string_lossy().into_owned(),
                ],
                None,
            )
            .expect("real packaged engine handshake");
        let result = supervisor.request(Method::ToolList, None);
        let agents = supervisor
            .request(Method::AgentList, None)
            .expect("packaged agent registry");
        assert!(agents["agents"]
            .as_array()
            .unwrap()
            .iter()
            .all(|agent| agent["profile"] == "inherit"));
        supervisor.request(Method::ProviderCreate, Some(serde_json::json!({"alias": "bridge-test", "type": "openai", "endpoint": "http://127.0.0.1:9/v1", "secret": "test-not-a-real-key"}))).expect("temporary provider");
        supervisor.request(Method::ModelAdd, Some(serde_json::json!({"provider": "bridge-test", "provider_model_id": "test", "alias": "test"}))).expect("temporary model");
        supervisor
            .request(
                Method::ProviderUse,
                Some(serde_json::json!({"ref": "bridge-test"})),
            )
            .expect("select temporary provider");
        let created = supervisor
            .request(
                Method::SessionCreate,
                Some(serde_json::json!({"chat": true})),
            )
            .expect("temporary session");
        let visual = supervisor
            .request(
                Method::VisionSettingsSet,
                Some(serde_json::json!({
                    "mode": "conversation", "model_id": null, "confirm_unknown": false,
                    "execution": {"max_concurrency": 8, "providers": {}, "models": {},
                        "timeouts": {"first_byte": 240, "idle": 90, "total": 1200}}
                })),
            )
            .expect("visual settings bridge");
        assert_eq!(visual["mode"], "conversation");
        assert_eq!(visual["execution"]["timeouts"]["first_byte"], 240);
        let restored_visual = supervisor
            .request(Method::VisionSettingsGet, None)
            .expect("visual settings persisted");
        assert_eq!(restored_visual, visual);
        let support = supervisor
            .request(
                Method::SessionImageSupport,
                Some(serde_json::json!({
                    "session_id": created["session"]["id"]
                })),
            )
            .expect("visual route support");
        assert_eq!(support["route"], "conversation");
        let frame = supervisor
            .request(
                Method::BrowserViewGet,
                Some(serde_json::json!({"session_id": created["session"]["id"]})),
            )
            .expect("browser view bridge");
        assert_eq!(frame["state"], "disconnected");
        let processes = supervisor
            .request(
                Method::WorkspaceProcessList,
                Some(serde_json::json!({"session_id": created["session"]["id"]})),
            )
            .expect("process panel bridge");
        assert!(processes["processes"].as_array().unwrap().is_empty());
        let imported = supervisor
            .request(
                Method::ArtifactReceiveImage,
                Some(serde_json::json!({
                    "session_id": created["session"]["id"], "path": image_path.to_string_lossy()
                })),
            )
            .expect("image import through packaged engine");
        let uri = imported["attachment"]["uri"]
            .as_str()
            .expect("image artifact reference");
        std::fs::remove_file(&image_path).expect("remove original image");
        let preview = supervisor
            .attachment_preview(uri, Some(524288), Some(2048))
            .expect("large image preview through Rust bridge");
        assert_eq!(preview["width"], 1800);
        assert!(preview["data_url"]
            .as_str()
            .unwrap()
            .starts_with("data:image/jpeg;base64,"));
        supervisor.shutdown();
        let tools = result.expect("real tool catalog");
        let rows = tools["tools"].as_array().expect("tool rows");
        for name in [
            "fs.read_image",
            "browser.launch",
            "browser.connect",
            "browser.status",
            "browser.screenshot",
        ] {
            assert!(rows.iter().any(|row| row["name"] == name), "missing {name}");
        }
    }
}
