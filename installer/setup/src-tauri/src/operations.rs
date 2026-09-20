use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    env,
    error::Error,
    fmt,
    fs::{self, File},
    io::{self, Cursor, Read, Write},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};
use uuid::Uuid;

include!(concat!(env!("OUT_DIR"), "/embedded_payload.rs"));

const APP_ID: &str = "com.rinari.agent";
const PRODUCT: &str = "Rinari Agent";
const SETUP_VERSION: &str = env!("CARGO_PKG_VERSION");
const MARKER: &str = ".rinari-install.json";
const LOG_NAME: &str = "install.log";
static CANCELLED: AtomicBool = AtomicBool::new(false);
static OPERATION_ACTIVE: AtomicBool = AtomicBool::new(false);
static COMMIT_STARTED: AtomicBool = AtomicBool::new(false);
static ELEVATED_WORKER_ACTIVE: AtomicBool = AtomicBool::new(false);

struct OperationGuard;

impl OperationGuard {
    fn acquire() -> Result<Self> {
        OPERATION_ACTIVE
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| SetupError("Another setup operation is already running".into()))?;
        CANCELLED.store(false, Ordering::SeqCst);
        COMMIT_STARTED.store(false, Ordering::SeqCst);
        ELEVATED_WORKER_ACTIVE.store(false, Ordering::SeqCst);
        Ok(Self)
    }
}

impl Drop for OperationGuard {
    fn drop(&mut self) {
        COMMIT_STARTED.store(false, Ordering::SeqCst);
        ELEVATED_WORKER_ACTIVE.store(false, Ordering::SeqCst);
        OPERATION_ACTIVE.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug)]
pub struct SetupError(String);

impl fmt::Display for SetupError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}
impl Error for SetupError {}
impl From<io::Error> for SetupError {
    fn from(error: io::Error) -> Self {
        Self(error.to_string())
    }
}
impl From<serde_json::Error> for SetupError {
    fn from(error: serde_json::Error) -> Self {
        Self(error.to_string())
    }
}

type Result<T> = std::result::Result<T, SetupError>;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InstallScope {
    User,
    Machine,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SetupOperation {
    Install,
    Update,
    Repair,
    Modify,
    Uninstall,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct InstallOptions {
    pub install_dir: String,
    pub scope: InstallScope,
    pub start_menu: bool,
    pub desktop: bool,
    pub cli_path: bool,
    pub remove_cache: bool,
    pub remove_shortcuts: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SetupPlan {
    pub operation: SetupOperation,
    pub options: InstallOptions,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SetupProgress {
    pub operation: SetupOperation,
    pub phase: String,
    pub detail: String,
    pub completed: u64,
    pub total: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct SetupStatus {
    pub installed: bool,
    pub legacy_install: bool,
    pub version: Option<String>,
    pub available_version: String,
    pub update_available: bool,
    pub install_dir: String,
    pub scope: InstallScope,
    pub start_menu: bool,
    pub desktop: bool,
    pub cli_path: bool,
    pub required_bytes: u64,
    pub available_bytes: u64,
    pub conflicting_cli: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct InstallRecord {
    app_id: String,
    version: String,
    install_dir: String,
    scope: InstallScope,
    start_menu: bool,
    desktop: bool,
    cli_path: bool,
    cli_entry: Option<String>,
    #[serde(default)]
    alias_hard_link: bool,
}

#[derive(Clone, Debug)]
struct LegacyInstall {
    display_name: String,
    version: Option<String>,
    install_dir: String,
    scope: InstallScope,
    uninstall_string: Option<String>,
    modify_path: Option<String>,
    display_icon: Option<String>,
    publisher: Option<String>,
    estimated_size: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct PayloadManifest {
    version: String,
    files: BTreeMap<String, ManifestFile>,
}

#[derive(Debug, Deserialize)]
struct ManifestFile {
    sha256: String,
    size: u64,
}

enum PayloadSource {
    Embedded(&'static [u8]),
    Directory(PathBuf),
    Archive(PathBuf),
}

pub fn request_cancel() {
    if operation_cancellable() {
        CANCELLED.store(true, Ordering::SeqCst);
    }
}

pub fn operation_active() -> bool {
    OPERATION_ACTIVE.load(Ordering::SeqCst)
}

pub fn operation_cancellable() -> bool {
    operation_active()
        && !COMMIT_STARTED.load(Ordering::SeqCst)
        && !ELEVATED_WORKER_ACTIVE.load(Ordering::SeqCst)
}

fn emit<F: FnMut(SetupProgress)>(
    callback: &mut F,
    operation: SetupOperation,
    phase: &str,
    detail: impl Into<String>,
    completed: u64,
    total: u64,
) {
    callback(SetupProgress {
        operation,
        phase: phase.into(),
        detail: detail.into(),
        completed,
        total,
    });
}

fn check_cancelled() -> Result<()> {
    if CANCELLED.load(Ordering::SeqCst) {
        Err(SetupError("Operation cancelled before commit".into()))
    } else {
        Ok(())
    }
}

fn verify_digest(bytes: &[u8], expected_sha256: &str) -> Result<()> {
    let actual_sha256 = hex::encode(Sha256::digest(bytes));
    if actual_sha256 == expected_sha256.to_ascii_lowercase() {
        Ok(())
    } else {
        Err(SetupError(
            "Elevated setup plan changed after authorization".into(),
        ))
    }
}

fn local_app_data() -> PathBuf {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
}

fn default_dir(scope: InstallScope) -> PathBuf {
    match scope {
        InstallScope::User => local_app_data().join("Programs").join(PRODUCT),
        InstallScope::Machine => env::var_os("ProgramFiles")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"))
            .join(PRODUCT),
    }
}

fn read_record_at(path: &Path) -> Option<InstallRecord> {
    let value = fs::read(path.join(MARKER)).ok()?;
    let record: InstallRecord = serde_json::from_slice(&value).ok()?;
    (record.app_id == APP_ID && Path::new(&record.install_dir).eq_ignore_ascii_case(path))
        .then_some(record)
}

fn installed_record() -> Option<InstallRecord> {
    #[cfg(windows)]
    if let Some(record) = registry::read_record() {
        return Some(record);
    }
    for scope in [InstallScope::User, InstallScope::Machine] {
        if let Some(record) = read_record_at(&default_dir(scope)) {
            return Some(record);
        }
    }
    None
}

fn legacy_install() -> Option<LegacyInstall> {
    #[cfg(windows)]
    {
        registry::legacy_install()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn payload_source() -> Result<PayloadSource> {
    if let Some(path) = env::var_os("RINARI_SETUP_PAYLOAD") {
        let path = PathBuf::from(path);
        return if path.is_dir() {
            Ok(PayloadSource::Directory(path))
        } else if path.is_file() {
            Ok(PayloadSource::Archive(path))
        } else {
            Err(SetupError("RINARI_SETUP_PAYLOAD does not exist".into()))
        };
    }
    if let Some(bytes) = EMBEDDED_PAYLOAD {
        return Ok(PayloadSource::Embedded(bytes));
    }
    let adjacent = env::current_exe()?.with_file_name("Rinari-Agent-Payload.zip");
    if adjacent.is_file() {
        return Ok(PayloadSource::Archive(adjacent));
    }
    Err(SetupError(
        "The verified Rinari Agent payload is not embedded or adjacent to setup".into(),
    ))
}

fn source_manifest(source: &PayloadSource) -> Result<PayloadManifest> {
    match source {
        PayloadSource::Directory(path) => Ok(serde_json::from_slice(&fs::read(
            path.join("payload-manifest.json"),
        )?)?),
        PayloadSource::Archive(path) => manifest_from_zip(File::open(path)?),
        PayloadSource::Embedded(bytes) => manifest_from_zip(Cursor::new(*bytes)),
    }
}

fn manifest_from_zip<R: Read + io::Seek>(reader: R) -> Result<PayloadManifest> {
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|error| SetupError(error.to_string()))?;
    let mut entry = archive
        .by_name("payload-manifest.json")
        .map_err(|_| SetupError("payload-manifest.json is missing".into()))?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn required_size() -> u64 {
    payload_source()
        .ok()
        .and_then(|source| source_manifest(&source).ok())
        .map(|manifest| manifest.files.values().map(|item| item.size).sum())
        .unwrap_or(0)
}

fn available_space(path: &Path) -> u64 {
    let anchor = path
        .ancestors()
        .find(|candidate| candidate.exists())
        .unwrap_or_else(|| Path::new(r"C:\"));
    fs2::available_space(anchor).unwrap_or(0)
}

pub fn status() -> Result<SetupStatus> {
    let record = installed_record();
    let legacy = record.is_none().then(legacy_install).flatten();
    let scope = record
        .as_ref()
        .map(|item| item.scope)
        .or_else(|| legacy.as_ref().map(|item| item.scope))
        .unwrap_or(InstallScope::User);
    let install_dir = record
        .as_ref()
        .map(|item| item.install_dir.clone())
        .or_else(|| legacy.as_ref().map(|item| item.install_dir.clone()))
        .unwrap_or_else(|| default_dir(scope).to_string_lossy().into_owned());
    let version = record
        .as_ref()
        .map(|item| item.version.clone())
        .or_else(|| legacy.as_ref().and_then(|item| item.version.clone()));
    Ok(SetupStatus {
        installed: record.is_some(),
        legacy_install: legacy.is_some(),
        update_available: version
            .as_deref()
            .is_some_and(|current| version_cmp(SETUP_VERSION, current).is_gt()),
        version,
        available_version: SETUP_VERSION.into(),
        required_bytes: required_size(),
        available_bytes: available_space(Path::new(&install_dir)),
        conflicting_cli: find_cli_conflict(&install_dir),
        start_menu: record.as_ref().map(|item| item.start_menu).unwrap_or(true),
        desktop: record.as_ref().map(|item| item.desktop).unwrap_or(true),
        cli_path: record.as_ref().map(|item| item.cli_path).unwrap_or(false),
        install_dir,
        scope,
    })
}

fn find_cli_conflict(install_dir: &str) -> Option<String> {
    let output = Command::new("where.exe")
        .arg("rinari")
        .creation_flags_no_window()
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let own = Path::new(install_dir).join("cli").join("rinari.cmd");
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !Path::new(line).eq_ignore_ascii_case(&own))
        .map(str::to_owned)
}

trait WindowsCommandExt {
    fn creation_flags_no_window(&mut self) -> &mut Self;
}
impl WindowsCommandExt for Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(0x08000000);
        }
        self
    }
}

pub fn execute<F: FnMut(SetupProgress)>(plan: SetupPlan, mut callback: F) -> Result<()> {
    let _guard = OperationGuard::acquire()?;
    validate_plan(&plan)?;
    #[cfg(windows)]
    if plan.options.scope == InstallScope::Machine && !registry::is_elevated() {
        emit(
            &mut callback,
            plan.operation,
            "elevation",
            "Waiting for administrator permission",
            3,
            100,
        );
        return registry::run_elevated(&plan, &mut callback);
    }
    execute_inner(plan, &mut callback)
}

pub fn silent_plan(operation: SetupOperation, install_dir: String) -> SetupPlan {
    let scope = if operation == SetupOperation::Uninstall {
        read_record_at(Path::new(&install_dir))
            .map(|record| record.scope)
            .unwrap_or(InstallScope::User)
    } else {
        InstallScope::User
    };
    SetupPlan {
        operation,
        options: InstallOptions {
            install_dir,
            scope,
            start_menu: false,
            desktop: false,
            cli_path: false,
            remove_cache: false,
            remove_shortcuts: operation == SetupOperation::Uninstall,
        },
    }
}

pub fn execute_plan_file(path: PathBuf, expected_sha256: &str) -> Result<()> {
    let _guard = OperationGuard::acquire()?;
    let bytes = fs::read(&path)?;
    verify_digest(&bytes, expected_sha256)?;
    let plan: SetupPlan = serde_json::from_slice(&bytes)?;
    let progress_path = path.with_extension("progress.json");
    let result = validate_plan(&plan).and_then(|_| {
        execute_inner(plan, &mut |progress| {
            if let Ok(bytes) = serde_json::to_vec(&progress) {
                let _ = fs::write(&progress_path, bytes);
            }
        })
    });
    let result_path = path.with_extension("result.json");
    let body = match &result {
        Ok(()) => serde_json::json!({"ok": true}),
        Err(error) => serde_json::json!({"ok": false, "error": error.to_string()}),
    };
    let _ = fs::write(result_path, serde_json::to_vec(&body)?);
    result
}

pub fn verify_payload(destination: PathBuf) -> Result<()> {
    let _guard = OperationGuard::acquire()?;
    if !destination.is_absolute()
        || destination
            .components()
            .any(|part| matches!(part, Component::ParentDir))
        || destination.parent().is_none()
    {
        return Err(SetupError("Unsafe payload verification directory".into()));
    }
    if destination.exists() && fs::read_dir(&destination)?.next().is_some() {
        return Err(SetupError(
            "Payload verification directory must be empty".into(),
        ));
    }
    let source = payload_source()?;
    let manifest = source_manifest(&source)?;
    fs::create_dir_all(&destination)?;
    let result = extract_source(
        &source,
        &manifest,
        &destination,
        SetupOperation::Install,
        &mut |_| {},
    )
    .and_then(|_| verify_tree(&destination, &manifest));
    let _ = fs::remove_dir_all(&destination);
    result
}

fn execute_inner<F: FnMut(SetupProgress)>(plan: SetupPlan, callback: &mut F) -> Result<()> {
    match plan.operation {
        SetupOperation::Install | SetupOperation::Update | SetupOperation::Repair => {
            install_payload(&plan, callback)
        }
        SetupOperation::Modify => modify_installation(&plan, callback),
        SetupOperation::Uninstall => uninstall(&plan, callback),
    }
}

fn validate_plan(plan: &SetupPlan) -> Result<()> {
    let path = PathBuf::from(&plan.options.install_dir);
    if !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir))
    {
        return Err(SetupError(
            "Installation directory must be an absolute path without parent traversal".into(),
        ));
    }
    if path.parent().is_none()
        || path == Path::new(r"C:\")
        || env::var_os("USERPROFILE").is_some_and(|home| path.as_os_str() == home.as_os_str())
    {
        return Err(SetupError(
            "Refusing an unsafe installation directory".into(),
        ));
    }
    if matches!(
        plan.operation,
        SetupOperation::Update
            | SetupOperation::Repair
            | SetupOperation::Modify
            | SetupOperation::Uninstall
    ) && read_record_at(&path).is_none()
    {
        return Err(SetupError(
            "The target is not an owned Rinari Agent installation".into(),
        ));
    }
    if plan.operation == SetupOperation::Install && read_record_at(&path).is_some() {
        return Err(SetupError(
            "An owned installation already exists; use update, repair, or modify".into(),
        ));
    }
    let legacy = legacy_install().filter(|item| {
        Path::new(&item.install_dir).eq_ignore_ascii_case(&path) && item.scope == plan.options.scope
    });
    if plan.operation == SetupOperation::Install
        && path.exists()
        && fs::read_dir(&path)?.next().is_some()
        && legacy.is_none()
    {
        return Err(SetupError(
            "The selected directory is not empty and is not an owned Rinari Agent installation"
                .into(),
        ));
    }
    Ok(())
}

fn install_payload<F: FnMut(SetupProgress)>(plan: &SetupPlan, callback: &mut F) -> Result<()> {
    let target = PathBuf::from(&plan.options.install_dir);
    let parent = target
        .parent()
        .ok_or_else(|| SetupError("Invalid installation directory".into()))?;
    fs::create_dir_all(parent)?;
    let source = payload_source()?;
    let manifest = source_manifest(&source)?;
    let previous = read_record_at(&target);
    let legacy = legacy_install().filter(|item| {
        Path::new(&item.install_dir).eq_ignore_ascii_case(&target)
            && item.scope == plan.options.scope
    });
    if let Some(installed) = previous.as_ref() {
        match plan.operation {
            SetupOperation::Update
                if !version_cmp(&manifest.version, &installed.version).is_gt() =>
            {
                return Err(SetupError(
                    "Update payload must be newer than the installed version".into(),
                ))
            }
            SetupOperation::Repair if manifest.version != installed.version => {
                return Err(SetupError(
                    "Repair requires a payload matching the installed version".into(),
                ))
            }
            _ => {}
        }
        ensure_agent_closed()?;
    }
    if legacy.is_some() {
        ensure_agent_closed()?;
    }
    let required: u64 = manifest.files.values().map(|file| file.size).sum();
    if available_space(parent) < required.saturating_mul(2) {
        return Err(SetupError(
            "Not enough free space for staging and rollback".into(),
        ));
    }
    let stage = parent.join(format!(".rinari-stage-{}", Uuid::new_v4()));
    let backup = parent.join(format!(".rinari-rollback-{}", Uuid::new_v4()));
    fs::create_dir_all(&stage)?;
    emit(
        callback,
        plan.operation,
        "validate",
        format!("Payload {} validated", manifest.version),
        5,
        100,
    );
    check_cancelled()?;
    let mut activated = false;
    let result = (|| {
        extract_source(&source, &manifest, &stage, plan.operation, callback)?;
        check_cancelled()?;
        emit(
            callback,
            plan.operation,
            "verify",
            "Verifying staged files",
            74,
            100,
        );
        verify_tree(&stage, &manifest)?;
        let alias_hard_link = ensure_compatibility_alias(&stage)?;
        let setup = env::current_exe()?;
        fs::copy(setup, stage.join("Rinari-Setup.exe"))?;
        let record = InstallRecord {
            app_id: APP_ID.into(),
            version: manifest.version.clone(),
            install_dir: target.to_string_lossy().into_owned(),
            scope: plan.options.scope,
            start_menu: plan.options.start_menu,
            desktop: plan.options.desktop,
            cli_path: plan.options.cli_path,
            cli_entry: plan
                .options
                .cli_path
                .then(|| target.join("cli").to_string_lossy().into_owned()),
            alias_hard_link,
        };
        fs::write(stage.join(MARKER), serde_json::to_vec_pretty(&record)?)?;
        write_log(
            &stage,
            &format!("Staged {} {}\n", PRODUCT, manifest.version),
        )?;
        check_cancelled()?;
        COMMIT_STARTED.store(true, Ordering::SeqCst);
        emit(
            callback,
            plan.operation,
            "commit",
            "Activating installation atomically",
            84,
            100,
        );
        if target.exists() {
            fs::rename(&target, &backup)?;
        }
        if let Err(error) = fs::rename(&stage, &target) {
            if backup.exists() {
                let _ = fs::rename(&backup, &target);
            }
            return Err(SetupError(format!(
                "Could not activate installation: {error}"
            )));
        }
        activated = true;
        emit(
            callback,
            plan.operation,
            "integrations",
            "Applying shortcuts and optional CLI",
            92,
            100,
        );
        apply_integrations(&record)?;
        #[cfg(windows)]
        {
            registry::write_record(&record)?;
            if let Some(legacy) = legacy.as_ref() {
                registry::remove_legacy_shortcuts(legacy)?;
            }
        }
        write_log(&target, "Installation committed and verified\n")?;
        if backup.exists() {
            let _ = fs::remove_dir_all(&backup);
        }
        emit(
            callback,
            plan.operation,
            "commit",
            "Rinari Agent is ready",
            100,
            100,
        );
        Ok(())
    })();
    if stage.exists() {
        let _ = fs::remove_dir_all(stage);
    }
    if result.is_err() && activated && target.exists() && target.join(MARKER).is_file() {
        if let Some(current) = read_record_at(&target) {
            let _ = remove_integrations(&current, true);
        }
        let _ = fs::remove_dir_all(&target);
    }
    if result.is_err() && backup.exists() {
        let _ = fs::rename(&backup, &target);
        if let Some(previous) = previous.as_ref() {
            let _ = apply_integrations(previous);
            #[cfg(windows)]
            let _ = registry::write_record(previous);
        } else {
            #[cfg(windows)]
            if let Some(legacy) = legacy.as_ref() {
                let _ = registry::restore_legacy(legacy);
            }
        }
    }
    result
}

fn extract_source<F: FnMut(SetupProgress)>(
    source: &PayloadSource,
    manifest: &PayloadManifest,
    stage: &Path,
    operation: SetupOperation,
    callback: &mut F,
) -> Result<()> {
    match source {
        PayloadSource::Directory(root) => {
            let mut completed = 0u64;
            for (relative, expected) in &manifest.files {
                check_cancelled()?;
                let relative_path = safe_relative(relative)?;
                let source_path = root.join(&relative_path);
                let destination = stage.join(&relative_path);
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(&source_path, &destination)?;
                verify_file(&destination, expected)?;
                completed += expected.size;
                emit(
                    callback,
                    operation,
                    "files",
                    relative,
                    10 + completed.saturating_mul(60)
                        / manifest.files.values().map(|f| f.size).sum::<u64>().max(1),
                    100,
                );
            }
        }
        PayloadSource::Archive(path) => {
            extract_zip(File::open(path)?, manifest, stage, operation, callback)?
        }
        PayloadSource::Embedded(bytes) => {
            extract_zip(Cursor::new(*bytes), manifest, stage, operation, callback)?
        }
    }
    Ok(())
}

fn extract_zip<R: Read + io::Seek, F: FnMut(SetupProgress)>(
    reader: R,
    manifest: &PayloadManifest,
    stage: &Path,
    operation: SetupOperation,
    callback: &mut F,
) -> Result<()> {
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|error| SetupError(error.to_string()))?;
    let mut entries = BTreeMap::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| SetupError(error.to_string()))?;
        let normalized = entry.name().replace('\\', "/");
        if normalized == "payload-manifest.json" {
            continue;
        }
        safe_relative(&normalized)?;
        if entries.insert(normalized.clone(), index).is_some() {
            return Err(SetupError(format!(
                "Duplicate normalized payload path: {normalized}"
            )));
        }
    }
    let total = manifest
        .files
        .values()
        .map(|file| file.size)
        .sum::<u64>()
        .max(1);
    let mut completed = 0u64;
    for (relative, expected) in &manifest.files {
        check_cancelled()?;
        let relative_path = safe_relative(relative)?;
        let index = entries
            .get(relative)
            .copied()
            .ok_or_else(|| SetupError(format!("Payload file missing: {relative}")))?;
        let mut entry = archive
            .by_index(index)
            .map_err(|error| SetupError(error.to_string()))?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(SetupError(format!(
                "Symlinks are not accepted in payload: {relative}"
            )));
        }
        let destination = stage.join(relative_path);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut output = File::create(&destination)?;
        io::copy(&mut entry, &mut output)?;
        drop(output);
        verify_file(&destination, expected)?;
        completed += expected.size;
        emit(
            callback,
            operation,
            "files",
            relative,
            10 + completed.saturating_mul(60) / total,
            100,
        );
    }
    Ok(())
}

fn safe_relative(value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(SetupError(format!("Unsafe payload path: {value}")));
    }
    Ok(path.to_path_buf())
}

fn verify_tree(root: &Path, manifest: &PayloadManifest) -> Result<()> {
    for (relative, expected) in &manifest.files {
        verify_file(&root.join(safe_relative(relative)?), expected)?;
    }
    Ok(())
}

fn verify_file(path: &Path, expected: &ManifestFile) -> Result<()> {
    let metadata = fs::metadata(path)?;
    if metadata.len() != expected.size {
        return Err(SetupError(format!("Size mismatch: {}", path.display())));
    }
    let mut input = File::open(path)?;
    let mut hash = Sha256::new();
    io::copy(&mut input, &mut hash)?;
    if hex::encode(hash.finalize()) != expected.sha256.to_ascii_lowercase() {
        return Err(SetupError(format!("SHA-256 mismatch: {}", path.display())));
    }
    Ok(())
}

fn ensure_compatibility_alias(root: &Path) -> Result<bool> {
    let primary = root.join("rinari-agent.exe");
    let alias = root.join("rinari-code.exe");
    if !primary.is_file() {
        return Err(SetupError(
            "The payload does not contain rinari-agent.exe".into(),
        ));
    }
    if alias.exists() {
        fs::remove_file(&alias)?;
    }
    match fs::hard_link(&primary, &alias) {
        Ok(()) => Ok(true),
        Err(_) => {
            fs::copy(&primary, &alias)?;
            Ok(false)
        }
    }
}

fn modify_installation<F: FnMut(SetupProgress)>(plan: &SetupPlan, callback: &mut F) -> Result<()> {
    let target = PathBuf::from(&plan.options.install_dir);
    let old =
        read_record_at(&target).ok_or_else(|| SetupError("Installation marker missing".into()))?;
    emit(
        callback,
        plan.operation,
        "validate",
        "Owned installation confirmed",
        15,
        100,
    );
    let record = InstallRecord {
        scope: plan.options.scope,
        start_menu: plan.options.start_menu,
        desktop: plan.options.desktop,
        cli_path: plan.options.cli_path,
        cli_entry: plan
            .options
            .cli_path
            .then(|| target.join("cli").to_string_lossy().into_owned()),
        ..old.clone()
    };
    if record.scope != old.scope {
        return Err(SetupError(
            "Changing installation scope requires a reinstall".into(),
        ));
    }
    COMMIT_STARTED.store(true, Ordering::SeqCst);
    let result = (|| {
        remove_integrations(&old, true)?;
        apply_integrations(&record)?;
        fs::write(target.join(MARKER), serde_json::to_vec_pretty(&record)?)?;
        #[cfg(windows)]
        registry::write_record(&record)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = remove_integrations(&record, true);
        let _ = apply_integrations(&old);
        let _ = fs::write(target.join(MARKER), serde_json::to_vec_pretty(&old)?);
        #[cfg(windows)]
        let _ = registry::write_record(&old);
        return Err(error);
    }
    emit(
        callback,
        plan.operation,
        "commit",
        "Installation options updated",
        100,
        100,
    );
    Ok(())
}

fn uninstall<F: FnMut(SetupProgress)>(plan: &SetupPlan, callback: &mut F) -> Result<()> {
    let target = PathBuf::from(&plan.options.install_dir);
    let record =
        read_record_at(&target).ok_or_else(|| SetupError("Installation marker missing".into()))?;
    ensure_agent_closed()?;
    emit(
        callback,
        plan.operation,
        "validate",
        "Owned installation confirmed",
        15,
        100,
    );
    remove_integrations(&record, plan.options.remove_shortcuts)?;
    #[cfg(windows)]
    registry::remove_record(record.scope)?;
    if plan.options.remove_cache {
        remove_cache()?;
    }
    emit(
        callback,
        plan.operation,
        "files",
        "Removing program files",
        65,
        100,
    );
    let current = env::current_exe()?;
    if current.starts_with(&target) {
        for entry in fs::read_dir(&target)? {
            let path = entry?.path();
            if path != current {
                if path.is_dir() {
                    fs::remove_dir_all(path)?;
                } else {
                    fs::remove_file(path)?;
                }
            }
        }
        schedule_self_cleanup(&target, &current)?;
    } else {
        fs::remove_dir_all(&target)?;
    }
    emit(
        callback,
        plan.operation,
        "commit",
        "Rinari Agent removed; user data preserved",
        100,
        100,
    );
    Ok(())
}

fn write_log(root: &Path, line: &str) -> Result<()> {
    use std::fs::OpenOptions;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join(LOG_NAME))?;
    file.write_all(line.as_bytes())?;
    Ok(())
}

fn directory_size(root: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(root) else {
        return 0;
    };
    entries
        .filter_map(std::result::Result::ok)
        .map(|entry| {
            let path = entry.path();
            match entry.metadata() {
                Ok(metadata) if metadata.is_file() => metadata.len(),
                Ok(metadata) if metadata.is_dir() => directory_size(&path),
                _ => 0,
            }
        })
        .sum()
}

fn apply_integrations(record: &InstallRecord) -> Result<()> {
    let root = PathBuf::from(&record.install_dir);
    let executable = root.join("rinari-agent.exe");
    let setup = root.join("Rinari-Setup.exe");
    if record.cli_path {
        let cli = root.join("cli");
        fs::create_dir_all(&cli)?;
        fs::write(cli.join("rinari.cmd"), format!("@echo off\r\nsetlocal\r\nset \"RINARI_AGENT_BIN={}\"\r\n\"{}\" -m rinari %*\r\nexit /b %ERRORLEVEL%\r\n", executable.display(), root.join("resources/engine-dist/python.exe").display()))?;
        #[cfg(windows)]
        registry::set_path_entry(record.scope, &cli, true)?;
    }
    #[cfg(windows)]
    {
        if record.desktop {
            registry::set_shortcut(record.scope, "desktop", &executable, true)?;
        }
        if record.start_menu {
            registry::set_shortcut(record.scope, "start", &executable, true)?;
        }
        registry::register_uninstaller(record, &setup)?;
    }
    Ok(())
}

fn remove_integrations(record: &InstallRecord, remove_shortcuts: bool) -> Result<()> {
    let root = PathBuf::from(&record.install_dir);
    let executable = root.join("rinari-agent.exe");
    if let Some(entry) = &record.cli_entry {
        #[cfg(windows)]
        registry::set_path_entry(record.scope, Path::new(entry), false)?;
    }
    #[cfg(windows)]
    if remove_shortcuts {
        registry::set_shortcut(record.scope, "desktop", &executable, false)?;
        registry::set_shortcut(record.scope, "start", &executable, false)?;
    }
    Ok(())
}

fn remove_cache() -> Result<()> {
    let base = env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(local_app_data)
        .join(PRODUCT);
    for name in ["Cache", "Code Cache", "GPUCache"] {
        let path = base.join(name);
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        }
    }
    Ok(())
}

fn schedule_self_cleanup(target: &Path, current: &Path) -> Result<()> {
    let script = "$id=[int]$env:RINARI_SETUP_PID;Wait-Process -Id $id -ErrorAction SilentlyContinue;Remove-Item -LiteralPath $env:RINARI_SETUP_SELF -Force -ErrorAction SilentlyContinue;Remove-Item -LiteralPath $env:RINARI_SETUP_DIR -Recurse -Force -ErrorAction SilentlyContinue";
    Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            script,
        ])
        .env("RINARI_SETUP_PID", std::process::id().to_string())
        .env("RINARI_SETUP_SELF", current)
        .env("RINARI_SETUP_DIR", target)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    Ok(())
}

fn version_cmp(left: &str, right: &str) -> std::cmp::Ordering {
    fn parts(value: &str) -> Vec<u64> {
        value
            .split(|ch: char| !ch.is_ascii_digit())
            .filter(|part| !part.is_empty())
            .take(4)
            .map(|part| part.parse().unwrap_or(0))
            .collect()
    }
    let mut left = parts(left);
    let mut right = parts(right);
    let length = left.len().max(right.len());
    left.resize(length, 0);
    right.resize(length, 0);
    left.cmp(&right)
}

fn ensure_agent_closed() -> Result<()> {
    #[cfg(windows)]
    {
        for executable in ["rinari-agent.exe", "rinari-code.exe"] {
            let output = Command::new("tasklist.exe")
                .args([
                    "/FI",
                    &format!("IMAGENAME eq {executable}"),
                    "/FO",
                    "CSV",
                    "/NH",
                ])
                .creation_flags_no_window()
                .output()?;
            if output.status.success()
                && String::from_utf8_lossy(&output.stdout)
                    .to_ascii_lowercase()
                    .contains(executable)
            {
                return Err(SetupError(
                    "Close Rinari Agent or Rinari Code before changing the installation".into(),
                ));
            }
        }
    }
    Ok(())
}

pub fn open_install_directory() -> Result<()> {
    open_path(&PathBuf::from(status()?.install_dir))
}
pub fn open_install_log() -> Result<()> {
    open_path(&PathBuf::from(status()?.install_dir).join(LOG_NAME))
}
pub fn launch_agent() -> Result<()> {
    Command::new(PathBuf::from(status()?.install_dir).join("rinari-agent.exe")).spawn()?;
    Ok(())
}
fn open_path(path: &Path) -> Result<()> {
    Command::new("explorer.exe").arg(path).spawn()?;
    Ok(())
}

trait PathEq {
    fn eq_ignore_ascii_case(&self, other: &Path) -> bool;
}
impl PathEq for Path {
    fn eq_ignore_ascii_case(&self, other: &Path) -> bool {
        self.to_string_lossy()
            .eq_ignore_ascii_case(&other.to_string_lossy())
    }
}

#[cfg(windows)]
mod registry {
    use super::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };
    use winreg::{enums::*, RegKey, RegValue};

    const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\rinari-code";

    fn hive(scope: InstallScope) -> RegKey {
        match scope {
            InstallScope::User => RegKey::predef(HKEY_CURRENT_USER),
            InstallScope::Machine => RegKey::predef(HKEY_LOCAL_MACHINE),
        }
    }
    pub fn read_record() -> Option<InstallRecord> {
        for scope in [InstallScope::User, InstallScope::Machine] {
            if let Ok(key) =
                hive(scope).open_subkey_with_flags(UNINSTALL_KEY, KEY_READ | KEY_WOW64_64KEY)
            {
                if let Ok(path) = key.get_value::<String, _>("InstallLocation") {
                    if let Some(record) = read_record_at(Path::new(&path)) {
                        return Some(record);
                    }
                }
            }
        }
        None
    }

    pub fn legacy_install() -> Option<LegacyInstall> {
        for scope in [InstallScope::User, InstallScope::Machine] {
            let Ok(key) =
                hive(scope).open_subkey_with_flags(UNINSTALL_KEY, KEY_READ | KEY_WOW64_64KEY)
            else {
                continue;
            };
            let Ok(display_name) = key.get_value::<String, _>("DisplayName") else {
                continue;
            };
            if !["rinari-code", "Rinari Code", "Rinari Agent"]
                .iter()
                .any(|known| display_name.eq_ignore_ascii_case(known))
            {
                continue;
            }
            let Ok(raw_path) = key.get_value::<String, _>("InstallLocation") else {
                continue;
            };
            let path = PathBuf::from(raw_path.trim().trim_matches('"'));
            if read_record_at(&path).is_some()
                || (!path.join("rinari-code.exe").is_file()
                    && !path.join("rinari-agent.exe").is_file())
            {
                continue;
            }
            return Some(LegacyInstall {
                display_name,
                version: key.get_value::<String, _>("DisplayVersion").ok(),
                install_dir: path.to_string_lossy().into_owned(),
                scope,
                uninstall_string: key.get_value::<String, _>("UninstallString").ok(),
                modify_path: key.get_value::<String, _>("ModifyPath").ok(),
                display_icon: key.get_value::<String, _>("DisplayIcon").ok(),
                publisher: key.get_value::<String, _>("Publisher").ok(),
                estimated_size: key.get_value::<u32, _>("EstimatedSize").ok(),
            });
        }
        None
    }

    pub fn write_record(record: &InstallRecord) -> Result<()> {
        let (key, _) = hive(record.scope)
            .create_subkey_with_flags(UNINSTALL_KEY, KEY_WRITE | KEY_WOW64_64KEY)
            .map_err(|e| SetupError(e.to_string()))?;
        key.set_value("DisplayName", &PRODUCT)
            .map_err(|e| SetupError(e.to_string()))?;
        key.set_value("DisplayVersion", &record.version)
            .map_err(|e| SetupError(e.to_string()))?;
        key.set_value("Publisher", &"Xainner")
            .map_err(|e| SetupError(e.to_string()))?;
        key.set_value("InstallLocation", &record.install_dir)
            .map_err(|e| SetupError(e.to_string()))?;
        let setup = Path::new(&record.install_dir).join("Rinari-Setup.exe");
        let agent = Path::new(&record.install_dir).join("rinari-agent.exe");
        key.set_value("DisplayIcon", &format!("\"{}\",0", agent.display()))
            .map_err(|e| SetupError(e.to_string()))?;
        let estimated_kib = directory_size(Path::new(&record.install_dir))
            .saturating_sub(
                record
                    .alias_hard_link
                    .then(|| {
                        fs::metadata(Path::new(&record.install_dir).join("rinari-code.exe")).ok()
                    })
                    .flatten()
                    .map(|metadata| metadata.len())
                    .unwrap_or(0),
            )
            .div_ceil(1024)
            .min(u32::MAX as u64) as u32;
        key.set_value("EstimatedSize", &estimated_kib)
            .map_err(|e| SetupError(e.to_string()))?;
        key.set_value(
            "UninstallString",
            &format!("\"{}\" --maintenance", setup.display()),
        )
        .map_err(|e| SetupError(e.to_string()))?;
        key.set_value(
            "QuietUninstallString",
            &format!(
                "\"{}\" --silent-uninstall \"{}\"",
                setup.display(),
                record.install_dir
            ),
        )
        .map_err(|e| SetupError(e.to_string()))?;
        key.set_value(
            "ModifyPath",
            &format!("\"{}\" --maintenance", setup.display()),
        )
        .map_err(|e| SetupError(e.to_string()))?;
        key.set_value("NoModify", &0u32)
            .map_err(|e| SetupError(e.to_string()))?;
        key.set_value("NoRepair", &0u32)
            .map_err(|e| SetupError(e.to_string()))?;
        Ok(())
    }

    pub fn restore_legacy(legacy: &LegacyInstall) -> Result<()> {
        let _ = hive(legacy.scope).delete_subkey_all(UNINSTALL_KEY);
        let (key, _) = hive(legacy.scope)
            .create_subkey_with_flags(UNINSTALL_KEY, KEY_WRITE | KEY_WOW64_64KEY)
            .map_err(|error| SetupError(error.to_string()))?;
        key.set_value("DisplayName", &legacy.display_name)
            .map_err(|error| SetupError(error.to_string()))?;
        key.set_value("InstallLocation", &legacy.install_dir)
            .map_err(|error| SetupError(error.to_string()))?;
        for (name, value) in [
            ("DisplayVersion", legacy.version.as_ref()),
            ("UninstallString", legacy.uninstall_string.as_ref()),
            ("ModifyPath", legacy.modify_path.as_ref()),
            ("DisplayIcon", legacy.display_icon.as_ref()),
            ("Publisher", legacy.publisher.as_ref()),
        ] {
            if let Some(value) = value {
                key.set_value(name, value)
                    .map_err(|error| SetupError(error.to_string()))?;
            }
        }
        if let Some(value) = legacy.estimated_size {
            key.set_value("EstimatedSize", &value)
                .map_err(|error| SetupError(error.to_string()))?;
        }
        Ok(())
    }

    pub fn register_uninstaller(record: &InstallRecord, _setup: &Path) -> Result<()> {
        write_record(record)
    }

    pub fn remove_record(scope: InstallScope) -> Result<()> {
        let _ = hive(scope).delete_subkey_all(UNINSTALL_KEY);
        Ok(())
    }

    pub fn is_elevated() -> bool {
        Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", "if(([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 0}else{exit 1}"])
            .creation_flags_no_window().status().is_ok_and(|status| status.success())
    }

    pub fn run_elevated<F: FnMut(SetupProgress)>(plan: &SetupPlan, callback: &mut F) -> Result<()> {
        let token = Uuid::new_v4().to_string();
        let path = env::temp_dir().join(format!("rinari-plan-{token}.json"));
        let bytes = serde_json::to_vec(plan)?;
        let digest = hex::encode(Sha256::digest(&bytes));
        fs::write(&path, bytes)?;
        let exe = env::current_exe()?;
        let script = "$p=Start-Process -FilePath $env:RINARI_SETUP_EXE -ArgumentList @('--worker',$env:RINARI_SETUP_PLAN,$env:RINARI_SETUP_PLAN_SHA256) -Verb RunAs -Wait -PassThru;exit $p.ExitCode";
        ELEVATED_WORKER_ACTIVE.store(true, Ordering::SeqCst);
        let mut child = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("RINARI_SETUP_EXE", exe)
            .env("RINARI_SETUP_PLAN", &path)
            .env("RINARI_SETUP_PLAN_SHA256", digest)
            .spawn()?;
        let progress_path = path.with_extension("progress.json");
        let mut last_progress = Vec::new();
        let status = loop {
            if let Ok(bytes) = fs::read(&progress_path) {
                if bytes != last_progress {
                    if let Ok(progress) = serde_json::from_slice::<SetupProgress>(&bytes) {
                        callback(progress);
                        last_progress = bytes;
                    }
                }
            }
            if let Some(status) = child.try_wait()? {
                break status;
            }
            thread::sleep(Duration::from_millis(100));
        };
        ELEVATED_WORKER_ACTIVE.store(false, Ordering::SeqCst);
        let result_path = path.with_extension("result.json");
        let result: serde_json::Value = fs::read(&result_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_else(
                || serde_json::json!({"ok": false, "error": "Elevated worker produced no result"}),
            );
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(result_path);
        let _ = fs::remove_file(progress_path);
        if status.success() && result.get("ok").and_then(|v| v.as_bool()) == Some(true) {
            Ok(())
        } else {
            Err(SetupError(
                result
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Elevation cancelled")
                    .into(),
            ))
        }
    }

    pub fn set_path_entry(scope: InstallScope, entry: &Path, add: bool) -> Result<()> {
        let (hive, key_path, value) = match scope {
            InstallScope::User => (RegKey::predef(HKEY_CURRENT_USER), r"Environment", "Path"),
            InstallScope::Machine => (
                RegKey::predef(HKEY_LOCAL_MACHINE),
                r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
                "Path",
            ),
        };
        let (key, _) = hive
            .create_subkey_with_flags(key_path, KEY_READ | KEY_WRITE | KEY_WOW64_64KEY)
            .map_err(|e| SetupError(e.to_string()))?;
        let current: String = key.get_value(value).unwrap_or_default();
        let raw = key.get_raw_value(value).ok();
        let wanted = entry.to_string_lossy();
        let Some(updated) = update_path_value(&current, &wanted, add) else {
            return Ok(());
        };
        let value_type = raw
            .as_ref()
            .map(|stored| stored.vtype.clone())
            .filter(|kind| matches!(kind, REG_SZ | REG_EXPAND_SZ))
            .unwrap_or(REG_EXPAND_SZ);
        let bytes = updated
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        key.set_raw_value(
            value,
            &RegValue {
                bytes,
                vtype: value_type,
            },
        )
        .map_err(|e| SetupError(e.to_string()))?;
        broadcast_environment_change();
        Ok(())
    }

    fn broadcast_environment_change() {
        let environment: Vec<u16> = "Environment\0".encode_utf16().collect();
        let mut result = 0usize;
        unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                0,
                environment.as_ptr() as isize,
                SMTO_ABORTIFHUNG,
                5_000,
                &mut result,
            );
        }
    }

    pub fn set_shortcut(
        scope: InstallScope,
        kind: &str,
        target: &Path,
        create: bool,
    ) -> Result<()> {
        let base = shortcut_base(scope, kind);
        fs::create_dir_all(&base)?;
        update_shortcut(&base.join("Rinari Agent.lnk"), target, create)
    }

    fn shortcut_base(scope: InstallScope, kind: &str) -> PathBuf {
        match (scope, kind) {
            (InstallScope::User, "desktop") => env::var_os("USERPROFILE")
                .map(PathBuf::from)
                .unwrap_or_default()
                .join("Desktop"),
            (InstallScope::Machine, "desktop") => env::var_os("PUBLIC")
                .map(PathBuf::from)
                .unwrap_or_default()
                .join("Desktop"),
            (InstallScope::User, _) => env::var_os("APPDATA")
                .map(PathBuf::from)
                .unwrap_or_default()
                .join(r"Microsoft\Windows\Start Menu\Programs"),
            (InstallScope::Machine, _) => env::var_os("PROGRAMDATA")
                .map(PathBuf::from)
                .unwrap_or_default()
                .join(r"Microsoft\Windows\Start Menu\Programs"),
        }
    }

    fn update_shortcut(link: &Path, target: &Path, create: bool) -> Result<()> {
        let script = if create {
            "$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut($env:RINARI_LINK);$s.TargetPath=$env:RINARI_TARGET;$s.WorkingDirectory=(Split-Path -LiteralPath $env:RINARI_TARGET);$s.Save()"
        } else {
            "$w=New-Object -ComObject WScript.Shell;if(Test-Path -LiteralPath $env:RINARI_LINK){$s=$w.CreateShortcut($env:RINARI_LINK);if($s.TargetPath -ieq $env:RINARI_TARGET){Remove-Item -LiteralPath $env:RINARI_LINK -Force}}"
        };
        let status = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("RINARI_LINK", link)
            .env("RINARI_TARGET", target)
            .creation_flags_no_window()
            .status()?;
        if status.success() {
            Ok(())
        } else {
            Err(SetupError("Could not update an owned shortcut".into()))
        }
    }

    pub fn remove_legacy_shortcuts(legacy: &LegacyInstall) -> Result<()> {
        let target = Path::new(&legacy.install_dir).join("rinari-code.exe");
        for kind in ["desktop", "start"] {
            let base = shortcut_base(legacy.scope, kind);
            for name in ["rinari-code.lnk", "Rinari Code.lnk"] {
                update_shortcut(&base.join(name), &target, false)?;
            }
        }
        Ok(())
    }
}

fn update_path_value(current: &str, wanted: &str, add: bool) -> Option<String> {
    let matches = |part: &str| part.trim().eq_ignore_ascii_case(wanted);
    let present = current.split(';').any(matches);
    if present == add {
        return None;
    }
    if add {
        return Some(if current.is_empty() || current.ends_with(';') {
            format!("{current}{wanted}")
        } else {
            format!("{current};{wanted}")
        });
    }
    Some(
        current
            .split(';')
            .filter(|part| !matches(part))
            .collect::<Vec<_>>()
            .join(";"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_payload_traversal() {
        assert!(safe_relative("../escape.exe").is_err());
        assert!(safe_relative("/absolute.exe").is_err());
        assert!(safe_relative("dist/rinari-agent.exe").is_ok());
    }

    #[test]
    fn record_requires_exact_app_identity() {
        let root = env::temp_dir().join(format!("rinari-record-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(MARKER), br#"{"app_id":"other","version":"1","install_dir":"x","scope":"user","start_menu":true,"desktop":true,"cli_path":false,"cli_entry":null}"#).unwrap();
        assert!(read_record_at(&root).is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn record_is_bound_to_its_exact_install_directory() {
        let root = env::temp_dir().join(format!("rinari-record-path-test-{}", Uuid::new_v4()));
        let moved = env::temp_dir().join(format!("rinari-record-moved-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&moved).unwrap();
        let record = InstallRecord {
            app_id: APP_ID.into(),
            version: "0.2.0".into(),
            install_dir: root.to_string_lossy().into_owned(),
            scope: InstallScope::User,
            start_menu: false,
            desktop: false,
            cli_path: false,
            cli_entry: None,
            alias_hard_link: false,
        };
        let marker = serde_json::to_vec(&record).unwrap();
        fs::write(root.join(MARKER), &marker).unwrap();
        fs::write(moved.join(MARKER), marker).unwrap();
        assert!(read_record_at(&root).is_some());
        assert!(read_record_at(&moved).is_none());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(moved).unwrap();
    }

    #[test]
    fn versions_compare_numerically() {
        assert!(version_cmp("0.2.1", "0.2.0").is_gt());
        assert!(version_cmp("0.10.0", "0.2.9").is_gt());
        assert!(version_cmp("0.2", "0.2.0").is_eq());
    }

    #[test]
    fn elevated_plan_digest_is_bound_to_exact_bytes() {
        let bytes = br#"{"operation":"install"}"#;
        let digest = hex::encode(Sha256::digest(bytes));
        assert!(verify_digest(bytes, &digest).is_ok());
        assert!(verify_digest(br#"{"operation":"uninstall"}"#, &digest).is_err());
    }

    #[test]
    fn compatibility_alias_prefers_a_hard_link() {
        let root = env::temp_dir().join(format!("rinari-alias-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("rinari-agent.exe"), b"fake executable").unwrap();
        let linked = ensure_compatibility_alias(&root).unwrap();
        assert_eq!(
            fs::read(root.join("rinari-code.exe")).unwrap(),
            b"fake executable"
        );
        #[cfg(windows)]
        assert!(linked);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn silent_uninstall_keeps_the_recorded_scope() {
        let root = env::temp_dir().join(format!("rinari-silent-scope-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let record = InstallRecord {
            app_id: APP_ID.into(),
            version: "0.2.0".into(),
            install_dir: root.to_string_lossy().into_owned(),
            scope: InstallScope::Machine,
            start_menu: true,
            desktop: true,
            cli_path: false,
            cli_entry: None,
            alias_hard_link: true,
        };
        fs::write(root.join(MARKER), serde_json::to_vec(&record).unwrap()).unwrap();
        let plan = silent_plan(
            SetupOperation::Uninstall,
            root.to_string_lossy().into_owned(),
        );
        assert_eq!(plan.options.scope, InstallScope::Machine);
        assert!(plan.options.remove_shortcuts);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn file_verification_detects_corruption() {
        let root = env::temp_dir().join(format!("rinari-hash-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("payload.bin");
        fs::write(&file, b"verified payload").unwrap();
        let expected = ManifestFile {
            sha256: hex::encode(Sha256::digest(b"verified payload")),
            size: 16,
        };
        assert!(verify_file(&file, &expected).is_ok());
        fs::write(&file, b"tampered payload").unwrap();
        assert!(verify_file(&file, &expected).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn path_update_preserves_unrelated_content() {
        let current = r"%USERPROFILE%\bin;C:\Tools\Other;";
        assert_eq!(
            update_path_value(current, r"C:\Rinari Agent\cli", true),
            Some(r"%USERPROFILE%\bin;C:\Tools\Other;C:\Rinari Agent\cli".into())
        );
        assert_eq!(
            update_path_value(current, r"C:\Tools\Other", false),
            Some(r"%USERPROFILE%\bin;".into())
        );
    }

    #[test]
    fn path_update_is_exact_case_insensitive_and_idempotent() {
        let current = r"C:\Tools;C:\Rinari Agent\CLI;C:\Tools\Rinari";
        assert_eq!(
            update_path_value(current, r"c:\rinari agent\cli", true),
            None
        );
        assert_eq!(update_path_value(current, r"C:\Rinari", false), None);
        assert_eq!(
            update_path_value(current, r"c:\rinari agent\cli", false),
            Some(r"C:\Tools;C:\Tools\Rinari".into())
        );
    }
}
