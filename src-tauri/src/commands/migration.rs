use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

const SCHEMA: &str = "rinari.desktop-preferences.v1";
const MAX_ENTRIES: usize = 32;
const MAX_VALUE_BYTES: usize = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 8 * 1024 * 1024;
const ALLOWED_KEYS: &[&str] = &[
    "rinari.board.v1",
    "rinari.board.attention.v1",
    "rinari.sessionUi.v1",
    "rinari.sessionDock.v1",
    "rinari.composer.drafts.v1",
    "rinari.profile.v1",
    "rinari.lang",
    "rinari.sidebarCollapsed",
    "rinari.shortcutBindings",
    "rinari.enterToSend",
    "rinari.autoFollow",
    "rinari.showSuggestions",
    "rinari.showTechnicalActivityNames",
    "rinari.theme",
    "rinari.accent",
    "rinari.reduceMotion",
    "rinari.provider-wizard.v1",
    "rinari.files.width",
];

#[derive(Serialize)]
struct ExportManifest {
    schema: &'static str,
    export_id: String,
    source: &'static str,
    source_version: &'static str,
    engine_namespace: String,
    created_at: String,
    checksum: String,
    preferences: BTreeMap<String, String>,
}

#[derive(Serialize)]
pub(crate) struct MigrationStatus {
    state: &'static str,
    pending: bool,
    export_id: String,
    source_version: &'static str,
}

fn migration_directory() -> Result<PathBuf, String> {
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "LOCALAPPDATA is unavailable".to_owned())?;
    #[cfg(not(windows))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
        .ok_or_else(|| "local data directory is unavailable".to_owned())?;
    Ok(base.join("Rinari").join("migration"))
}

fn checksum(preferences: &BTreeMap<String, String>) -> Result<String, String> {
    let canonical = serde_json::to_vec(preferences).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(canonical)))
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) fn migration_export(
    preferences: BTreeMap<String, String>,
) -> Result<MigrationStatus, String> {
    if preferences.len() > MAX_ENTRIES {
        return Err("too many preference entries".to_owned());
    }
    let allowed: HashSet<&str> = ALLOWED_KEYS.iter().copied().collect();
    let mut total = 0usize;
    for (key, value) in &preferences {
        if !allowed.contains(key.as_str()) {
            return Err(format!("preference key is not allowed: {key}"));
        }
        if value.len() > MAX_VALUE_BYTES {
            return Err(format!("preference value is too large: {key}"));
        }
        total = total.saturating_add(key.len()).saturating_add(value.len());
        if total > MAX_TOTAL_BYTES {
            return Err("preference export is too large".to_owned());
        }
    }

    let digest = checksum(&preferences)?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let export_id = format!("tauri-{now}-{}", &digest[..12]);
    let manifest = ExportManifest {
        schema: SCHEMA,
        export_id: export_id.clone(),
        source: "tauri",
        source_version: env!("CARGO_PKG_VERSION"),
        engine_namespace: std::env::var("RINARI_HOME").unwrap_or_else(|_| "default".to_owned()),
        created_at: now.to_string(),
        checksum: digest,
        preferences,
    };

    let directory = migration_directory()?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let target = directory.join("tauri-to-electron-v1.json");
    let temporary = directory.join(format!("tauri-to-electron-v1.{}.tmp", std::process::id()));
    let body = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    fs::write(&temporary, body).map_err(|error| error.to_string())?;
    if target.exists() {
        fs::remove_file(&target).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, &target).map_err(|error| error.to_string())?;

    Ok(MigrationStatus {
        state: "verified",
        pending: true,
        export_id,
        source_version: env!("CARGO_PKG_VERSION"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_is_stable_for_key_order() {
        let mut first = BTreeMap::new();
        first.insert("rinari.lang".to_owned(), "es".to_owned());
        first.insert("rinari.theme".to_owned(), "dark".to_owned());
        let mut second = BTreeMap::new();
        second.insert("rinari.theme".to_owned(), "dark".to_owned());
        second.insert("rinari.lang".to_owned(), "es".to_owned());
        assert_eq!(checksum(&first).unwrap(), checksum(&second).unwrap());
    }
}
