#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod operations;

use operations::{SetupOperation, SetupPlan, SetupProgress, SetupStatus};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Emitter, Manager, WindowEvent};

#[tauri::command]
fn setup_status() -> Result<SetupStatus, String> {
    operations::status().map_err(|error| error.to_string())
}

#[tauri::command]
fn choose_install_directory(
    window: tauri::Window,
    current: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let selected = window
        .dialog()
        .file()
        .set_directory(PathBuf::from(current))
        .blocking_pick_folder();
    Ok(selected.map(|path| path.to_string()))
}

#[tauri::command]
async fn execute_plan(app: tauri::AppHandle, plan: SetupPlan) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        operations::execute(plan, |progress: SetupProgress| {
            let _ = app.emit("setup-progress", progress);
        })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_operation() {
    operations::request_cancel();
}

#[derive(serde::Serialize)]
struct OperationState {
    active: bool,
    cancellable: bool,
}

#[tauri::command]
fn setup_operation_state() -> OperationState {
    OperationState {
        active: operations::operation_active(),
        cancellable: operations::operation_cancellable(),
    }
}

#[tauri::command]
fn open_install_directory() -> Result<(), String> {
    operations::open_install_directory().map_err(|error| error.to_string())
}

#[tauri::command]
fn open_install_log() -> Result<(), String> {
    operations::open_install_log().map_err(|error| error.to_string())
}

#[tauri::command]
fn launch_agent() -> Result<(), String> {
    operations::launch_agent().map_err(|error| error.to_string())
}

fn silent_plan(args: &[String]) -> Option<Result<SetupPlan, String>> {
    let operation = match args.get(1).map(String::as_str) {
        Some("--silent-install") => SetupOperation::Install,
        Some("--silent-uninstall") => SetupOperation::Uninstall,
        _ => return None,
    };
    let install_dir = match args.get(2) {
        Some(path) => path.clone(),
        None => {
            return Some(Err(
                "silent operation requires an installation directory".into()
            ))
        }
    };
    Some(Ok(operations::silent_plan(operation, install_dir)))
}

fn updater_request(args: &[String]) -> Option<bool> {
    args.iter()
        .any(|arg| arg.eq_ignore_ascii_case("--updated"))
        .then(|| {
            args.iter()
                .any(|arg| arg.eq_ignore_ascii_case("--force-run"))
        })
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--worker") {
        let (Some(path), Some(expected_sha256)) = (args.get(2), args.get(3)) else {
            std::process::exit(2)
        };
        std::process::exit(
            match operations::execute_plan_file(PathBuf::from(path), expected_sha256) {
                Ok(()) => 0,
                Err(error) => {
                    eprintln!("{error}");
                    1
                }
            },
        );
    }
    if args.get(1).map(String::as_str) == Some("--verify-payload") {
        let Some(path) = args.get(2) else {
            std::process::exit(2)
        };
        std::process::exit(match operations::verify_payload(PathBuf::from(path)) {
            Ok(()) => 0,
            Err(error) => {
                eprintln!("{error}");
                1
            }
        });
    }
    if let Some(force_run) = updater_request(&args) {
        let result = operations::wait_for_agent_closed(Duration::from_secs(45))
            .and_then(|_| operations::updater_plan())
            .and_then(|plan| operations::execute(plan, |_| {}));
        let code = match result {
            Ok(()) => {
                if force_run {
                    if let Err(error) = operations::launch_agent() {
                        eprintln!("{error}");
                        std::process::exit(1);
                    }
                }
                0
            }
            Err(error) => {
                eprintln!("{error}");
                1
            }
        };
        std::process::exit(code);
    }
    if let Some(plan) = silent_plan(&args) {
        let code = match plan
            .and_then(|plan| operations::execute(plan, |_| {}).map_err(|error| error.to_string()))
        {
            Ok(()) => 0,
            Err(error) => {
                eprintln!("{error}");
                1
            }
        };
        std::process::exit(code);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Rinari Agent Setup");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if operations::operation_active() {
                    if operations::operation_cancellable() {
                        operations::request_cancel();
                    }
                    api.prevent_close();
                    let _ = window.emit("setup-close-deferred", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            setup_status,
            choose_install_directory,
            execute_plan,
            cancel_operation,
            setup_operation_state,
            open_install_directory,
            open_install_log,
            launch_agent,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Rinari Setup");
}
