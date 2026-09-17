use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

pub fn build(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let item =
        |id, label, shortcut: Option<&str>| MenuItem::with_id(app, id, label, true, shortcut);
    let file = Submenu::with_items(
        app,
        "Archivo",
        true,
        &[
            &item("new-chat", "Nueva conversación", Some("CmdOrCtrl+N"))?,
            &item("open-folder", "Abrir carpeta…", Some("CmdOrCtrl+O"))?,
            &item("close-session", "Cerrar sesión", Some("CmdOrCtrl+W"))?,
            &item("settings", "Configuración…", Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", "Salir", Some("Alt+F4"))?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Editar",
        true,
        &[
            &item("undo", "Deshacer", None)?,
            &item("redo", "Rehacer", None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Cortar"))?,
            &PredefinedMenuItem::copy(app, Some("Copiar"))?,
            &PredefinedMenuItem::paste(app, Some("Pegar"))?,
            &PredefinedMenuItem::select_all(app, Some("Seleccionar todo"))?,
        ],
    )?;
    let view = Submenu::with_items(
        app,
        "Ver",
        true,
        &[
            // Vistas de trabajo: selección idempotente. Sin acelerador nativo a
            // propósito: el atajo configurable (Ctrl+Shift+B) lo gestiona el
            // frontend y un acelerador duplicado dispararía la acción dos veces.
            &item("view-normal", "Normal", None)?,
            &item("view-boards", "Boards", None)?,
            &PredefinedMenuItem::separator(app)?,
            &item("sidebar", "Barra lateral", Some("CmdOrCtrl+B"))?,
            &item("files", "Panel de archivos", Some("CmdOrCtrl+Shift+E"))?,
            &item("commands", "Paleta de comandos", Some("CmdOrCtrl+K"))?,
            &item("zoom-in", "Acercar", Some("CmdOrCtrl+Plus"))?,
            &item("zoom-out", "Alejar", Some("CmdOrCtrl+-"))?,
            &item("zoom-reset", "Tamaño real", Some("CmdOrCtrl+0"))?,
        ],
    )?;
    let help = Submenu::with_items(
        app,
        "Ayuda",
        true,
        &[
            &item("about", "Acerca de Rinari Agent", None)?,
            &item("engine", "Estado del motor", None)?,
            &item("updates", "Buscar actualizaciones", None)?,
        ],
    )?;
    Menu::with_items(app, &[&file, &edit, &view, &help])
}

pub fn handle(app: &tauri::AppHandle, id: &str) {
    if id == "quit" {
        app.exit(0);
        return;
    }
    if id.starts_with("zoom-") {
        if let Some(window) = app.get_webview_window("main") {
            // One main window; native zoom does not alter application layout state.
            static ZOOM: std::sync::Mutex<f64> = std::sync::Mutex::new(1.0);
            if let Ok(mut zoom) = ZOOM.lock() {
                *zoom = match id {
                    "zoom-in" => (*zoom + 0.1).min(2.0),
                    "zoom-out" => (*zoom - 0.1).max(0.5),
                    _ => 1.0,
                };
                let _ = window.set_zoom(*zoom);
            }
        }
    } else {
        let _ = app.emit("rinari-menu-action", id);
    }
}
