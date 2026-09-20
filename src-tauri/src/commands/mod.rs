//! Tauri command bridge: thin typed handlers per domain. Path per call:
//! Tauri command → EngineSupervisor → EngineTransport → Engine Protocol.
//! No harness logic here; every handler delegates to the supervisor.

use tauri::State;

use rinari_agent_lib::engine::{CommandError, EngineSupervisor};

/// Execute a blocking engine request away from Tauri's window/event thread.
///
/// The stdio transport intentionally uses blocking channels. Commands exposed
/// to the WebView must therefore cross this boundary before waiting for an
/// engine response, otherwise a slow provider or Git probe freezes Windows.
pub(crate) async fn run_engine<T, F>(
    supervisor: State<'_, EngineSupervisor>,
    task: F,
) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce(EngineSupervisor) -> Result<T, CommandError> + Send + 'static,
{
    let owned = supervisor.inner().clone();
    tauri::async_runtime::spawn_blocking(move || task(owned))
        .await
        .map_err(|error| CommandError::from(format!("engine worker failed: {error}")))?
}

pub mod agents;
pub mod desktop;
pub mod ecosystem;
pub mod engine;
pub mod migration;
pub mod models;
pub mod peers;
pub mod projects;
pub mod providers;
pub mod sessions;
pub mod souls;
pub mod workflow;
pub mod workspace;
