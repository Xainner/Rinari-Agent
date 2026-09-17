//! Hermetic Engine Protocol roundtrips against a scripted fake engine.
//!
//! No provider, network, or credentials needed: each test spawns
//! `tests/fixtures/fake_engine.py --scenario=…` through the real
//! EngineSupervisor and asserts the client-side contract (streaming order,
//! cancel terminality, approval roundtrip, crash surfacing). Explicit binary
//! paths are used (`start_with`), so tests stay parallel-safe: no process
//! env is mutated.
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use rinari_agent_lib::engine::{methods::Method, protocol::EngineEvent, EngineSupervisor};

fn fixture() -> String {
    format!(
        "{}/tests/fixtures/fake_engine.py",
        env!("CARGO_MANIFEST_DIR")
    )
}

/// Interprete del fixture. Los runners de CI exponen `python3` y no `python`
/// (macOS y la mayoria de Linux); Windows usa `python`. Se resuelve una vez.
fn python() -> &'static str {
    static PYTHON: OnceLock<String> = OnceLock::new();
    PYTHON.get_or_init(|| {
        for candidate in ["python3", "python"] {
            if let Ok(output) = Command::new(candidate)
                .arg("--version")
                .stdin(Stdio::null())
                .output()
            {
                let text = format!(
                    "{}{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
                if output.status.success() && text.contains("Python") {
                    return candidate.to_string();
                }
            }
        }
        panic!("no Python interpreter found for the engine fixture (tried: python3, python)");
    })
}

struct Harness {
    supervisor: EngineSupervisor,
    events: Arc<Mutex<Vec<EngineEvent>>>,
}

fn start_fake(scenario: &str) -> Harness {
    let supervisor = EngineSupervisor::new();
    let events: Arc<Mutex<Vec<EngineEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let sink_events = Arc::clone(&events);
    supervisor.set_sink(Arc::new(move |event: EngineEvent| {
        sink_events.lock().expect("events lock").push(event);
    }));
    let status = supervisor
        .start_with(
            python(),
            &[fixture(), format!("--scenario={scenario}")],
            None,
        )
        .expect("fake engine starts and handshakes");
    assert_eq!(format!("{:?}", status.state), "Ready");
    Harness { supervisor, events }
}

fn create_session(harness: &Harness) -> String {
    let created = harness
        .supervisor
        .session_create(None, true, Some("roundtrip".to_string()))
        .expect("session.create");
    created["session_id"]
        .as_str()
        .expect("created.session_id")
        .to_string()
}

fn wait_for(
    harness: &Harness,
    timeout: Duration,
    mut matches: impl FnMut(&EngineEvent) -> bool,
) -> EngineEvent {
    let start = Instant::now();
    loop {
        if let Some(found) = harness
            .events
            .lock()
            .expect("events lock")
            .iter()
            .find(|event| matches(event))
            .cloned()
        {
            return found;
        }
        assert!(
            start.elapsed() < timeout,
            "timed out waiting for engine event"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn is(name: &str) -> impl Fn(&EngineEvent) -> bool + '_ {
    move |event: &EngineEvent| event.event == name
}

#[test]
fn status_carries_the_stable_home_identity_from_the_hello() {
    let harness = start_fake("stream");
    let status = harness.supervisor.status();
    assert_eq!(status.home_id.as_deref(), Some("fakehome00000001"));
    assert!(harness.supervisor.shutdown().home_id.is_none());
}

#[test]
fn history_grows_with_turns_and_rejects_unknown_sessions() {
    let harness = start_fake("stream");
    let session_id = create_session(&harness);

    let empty = harness
        .supervisor
        .session_history(&session_id, None)
        .expect("session.history");
    assert_eq!(empty["total"], serde_json::json!(0));
    assert_eq!(empty["has_more"], serde_json::json!(false));

    harness
        .supervisor
        .turn_start(&session_id, "hola rinari")
        .expect("session.turn.start");
    wait_for(&harness, Duration::from_secs(10), is("turn.completed"));

    // Transcript rows land just after the terminal event; poll briefly.
    let start = Instant::now();
    let history = loop {
        let history = harness
            .supervisor
            .session_history(&session_id, None)
            .expect("session.history");
        if history["total"].as_u64().unwrap_or(0) >= 2 {
            break history;
        }
        assert!(
            start.elapsed() < Duration::from_secs(10),
            "history must persist"
        );
        std::thread::sleep(Duration::from_millis(20));
    };
    let roles: Vec<&str> = history["messages"]
        .as_array()
        .expect("messages array")
        .iter()
        .map(|m| m["role"].as_str().unwrap_or_default())
        .collect();
    assert_eq!(roles, vec!["user", "assistant"]);
    assert_eq!(
        history["messages"][0]["content"].as_str(),
        Some("hola rinari")
    );
    assert_eq!(
        history["messages"][1]["content"].as_str(),
        Some("Hola, soy Rinari.")
    );

    let opened = harness
        .supervisor
        .session_open(&session_id)
        .expect("session.open");
    assert_eq!(opened["session"]["kind"], serde_json::json!("CHAT"));

    let error = harness
        .supervisor
        .session_history("ses_missing", None)
        .expect_err("unknown session must fail");
    assert_eq!(error.code, "NOT_FOUND");

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn narrative_timeline_roundtrip_keeps_turn_and_model_identity() {
    let harness = start_fake("stream");
    let session_id = create_session(&harness);
    let started = harness
        .supervisor
        .turn_start(&session_id, "hola timeline")
        .expect("session.turn.start");
    wait_for(&harness, Duration::from_secs(10), is("turn.completed"));
    let timeline = harness
        .supervisor
        .session_timeline(&session_id, None, Some(30))
        .expect("session.timeline");
    assert_eq!(timeline["turns"][0]["turn_id"], started["turn_id"]);
    assert_eq!(
        timeline["turns"][0]["items"][0]["model_call_id"],
        serde_json::json!("model_fake1")
    );
    assert_eq!(
        timeline["turns"][0]["items"][0]["output_kind"],
        serde_json::json!("final")
    );
    harness.supervisor.shutdown();
}

#[test]
fn mode_set_roundtrip_emits_change_and_rejects_unknown() {
    let harness = start_fake("stream");
    let session_id = create_session(&harness);

    let updated = harness
        .supervisor
        .session_mode_set(&session_id, "plan")
        .expect("session.mode.set");
    assert_eq!(updated["session"]["mode"], serde_json::json!("plan"));

    let changed = wait_for(&harness, Duration::from_secs(10), |event: &EngineEvent| {
        event.event == "session.mode.changed"
            && event.payload["session_id"].as_str() == Some(session_id.as_str())
    });
    assert_eq!(changed.payload["mode"], serde_json::json!("plan"));

    let error = harness
        .supervisor
        .session_mode_set(&session_id, "yolo")
        .expect_err("unknown mode must fail");
    assert_eq!(error.code, "INVALID_USAGE");

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn workspace_reads_cover_tasks_verification_checkpoints_and_diff() {
    let harness = start_fake("stream");

    let tree = harness
        .supervisor
        .task_tree("/fake/work")
        .expect("task.tree");
    assert_eq!(tree["tasks"].as_array().map(Vec::len), Some(2));
    assert_eq!(tree["depths"]["tsk_fake2"], serde_json::json!(1));

    let detail = harness
        .supervisor
        .task_get("/fake/work", "tsk_fake1")
        .expect("task.get");
    assert_eq!(detail["task"]["title"], serde_json::json!("Fake task"));

    let missing = harness
        .supervisor
        .task_get("/fake/work", "tsk_nope")
        .expect_err("unknown task must fail");
    assert_eq!(missing.code, "NOT_FOUND");

    let latest = harness
        .supervisor
        .verification_latest("/fake/work", None, None)
        .expect("verification.latest");
    assert_eq!(latest["records"].as_array().map(Vec::len), Some(1));

    let plan = harness
        .supervisor
        .verification_plan("/fake/work", vec!["a.txt".to_string()])
        .expect("verification.plan");
    assert_eq!(
        plan["plan"]["test_commands"],
        serde_json::json!(["pytest -q"])
    );

    let points = harness
        .supervisor
        .checkpoint_list(Some("/fake/work".to_string()))
        .expect("checkpoint.list");
    assert_eq!(points["checkpoints"].as_array().map(Vec::len), Some(1));

    let preview = harness
        .supervisor
        .checkpoint_restore(serde_json::json!({
            "path": "/fake/work",
            "checkpoint_id": "chk_fake1",
            "preview": true,
            "allow_mixed": false,
        }))
        .expect("checkpoint.restore");
    assert_eq!(preview["result"]["preview"], serde_json::json!(true));

    let changes = harness
        .supervisor
        .project_changes("/fake/work")
        .expect("changes");
    assert_eq!(changes["dirty"], serde_json::json!(true));
    assert_eq!(changes["files"][0]["path"], serde_json::json!("a.txt"));

    let diff = harness
        .supervisor
        .project_diff("/fake/work", Some("a.txt".to_string()), None)
        .expect("project.diff");
    assert_eq!(diff["truncated"], serde_json::json!(false));
    assert!(diff["diff"]
        .as_str()
        .unwrap_or_default()
        .contains("+fake line"));

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn agent_routing_roundtrip_with_validation_and_events() {
    let harness = start_fake("stream");

    let list = harness.supervisor.agent_list().expect("agent.list");
    let names: Vec<&str> = list["agents"]
        .as_array()
        .expect("agents array")
        .iter()
        .map(|a| a["name"].as_str().unwrap_or_default())
        .collect();
    assert!(names.contains(&"explore"));
    assert!(names.contains(&"verifier"));

    let set = harness
        .supervisor
        .agent_config_set(serde_json::json!({
            "agent": "explore",
            "model": "fake-one",
            "fallback": null,
            "enabled": null,
            "clear": false,
        }))
        .expect("agent.config.set");
    assert_eq!(
        set["agent"]["assignment"]["model"],
        serde_json::json!("fake-one")
    );

    let get = harness
        .supervisor
        .agent_config_get("explore")
        .expect("agent.config.get");
    assert_eq!(
        get["agent"]["assignment"]["model"],
        serde_json::json!("fake-one")
    );

    let cleared = harness
        .supervisor
        .agent_config_set(serde_json::json!({
            "agent": "explore",
            "model": null,
            "fallback": null,
            "enabled": null,
            "clear": true,
        }))
        .expect("agent.config.set clear");
    assert_eq!(
        cleared["agent"]["assignment"]["model"],
        serde_json::Value::Null
    );

    let unknown = harness
        .supervisor
        .agent_config_get("nope")
        .expect_err("unknown agent must fail");
    assert_eq!(unknown.code, "NOT_FOUND");

    let session_id = create_session(&harness);
    let events = harness
        .supervisor
        .session_events(&session_id, None, None)
        .expect("session.events");
    assert_eq!(
        events["events"][0]["type"],
        serde_json::json!("SubagentStart")
    );
    assert_eq!(events["has_more"], serde_json::json!(false));

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn soul_crud_roundtrip_with_activation() {
    let harness = start_fake("stream");

    let list = harness.supervisor.soul_list().expect("soul.list");
    let ids: Vec<&str> = list["souls"]
        .as_array()
        .expect("souls array")
        .iter()
        .map(|s| s["id"].as_str().unwrap_or_default())
        .collect();
    assert!(ids.contains(&"rinari-default"));

    let created = harness
        .supervisor
        .soul_create(serde_json::json!({
            "id": "mio",
            "name": "Mio",
            "identity": "You are Mio.",
            "description": null,
            "version": null,
        }))
        .expect("soul.create");
    assert_eq!(created["soul"]["name"], serde_json::json!("Mio"));

    harness
        .supervisor
        .soul_activate("mio")
        .expect("soul.activate");
    let relisted = harness.supervisor.soul_list().expect("soul.list");
    assert_eq!(relisted["active_id"], serde_json::json!("mio"));

    harness.supervisor.soul_remove("mio").expect("soul.remove");
    let missing = harness
        .supervisor
        .soul_get("mio")
        .expect_err("removed soul must fail");
    assert_eq!(missing.code, "NOT_FOUND");

    let bundled = harness
        .supervisor
        .soul_remove("rinari-default")
        .expect_err("bundled soul is read-only");
    assert_eq!(bundled.code, "INVALID_USAGE");

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn ecosystem_roundtrip_mcp_plugins_tools_policy() {
    let harness = start_fake("stream");

    let empty = harness.supervisor.mcp_list().expect("mcp.list");
    assert_eq!(empty["servers"].as_array().unwrap().len(), 0);

    let created = harness
        .supervisor
        .mcp_create("demo", vec!["npx".to_string(), "-y".to_string()])
        .expect("mcp.create");
    assert_eq!(created["server"]["name"], serde_json::json!("demo"));

    // mcp.enable sends {name} only — the fake must enable, not read a flag.
    let enabled = harness.supervisor.mcp_enable("demo").expect("mcp.enable");
    assert_eq!(enabled["server"]["enabled"], serde_json::json!(true));
    let disabled = harness.supervisor.mcp_disable("demo").expect("mcp.disable");
    assert_eq!(disabled["server"]["enabled"], serde_json::json!(false));

    let test = harness.supervisor.mcp_test("demo").expect("mcp.test");
    assert_eq!(test["test"]["ok"], serde_json::json!(false));

    harness.supervisor.mcp_remove("demo").expect("mcp.remove");
    let missing = harness.supervisor.mcp_get("demo").expect("mcp.get");
    assert_eq!(missing["servers"].as_array().unwrap().len(), 0);

    let plugins = harness.supervisor.plugin_list().expect("plugin.list");
    assert_eq!(plugins["plugins"].as_array().unwrap().len(), 1);
    let toggled = harness
        .supervisor
        .plugin_disable("fake-plugin")
        .expect("plugin.disable");
    assert_eq!(toggled["plugin"]["enabled"], serde_json::json!(false));

    let diags = harness
        .supervisor
        .plugin_diagnostics()
        .expect("plugin.diagnostics");
    assert_eq!(
        diags["reports"][0]["diagnostics"][0]["code"],
        serde_json::json!("OK")
    );

    let tools = harness.supervisor.tool_list().expect("tool.list");
    assert_eq!(
        tools["tools"][0]["name"],
        serde_json::json!("artifact.read")
    );

    let policy = harness.supervisor.policy_get().expect("policy.get");
    assert_eq!(
        policy["mode_profile"]["build"],
        serde_json::json!("WORKSPACE")
    );

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn observability_roundtrip_artifacts_context_usage() {
    let harness = start_fake("stream");

    let listed = harness
        .supervisor
        .artifact_list(Some("fake".to_string()))
        .expect("artifact.list");
    assert_eq!(listed["artifacts"].as_array().unwrap().len(), 1);
    assert_eq!(
        listed["artifacts"][0]["uri"],
        serde_json::json!("artifact://fake/notes/plan.md")
    );

    let read = harness
        .supervisor
        .artifact_read("artifact://fake/notes/plan.md", None)
        .expect("artifact.read");
    assert_eq!(read["text"], serde_json::json!("hello fake"));
    assert_eq!(read["truncated"], serde_json::json!(false));

    let missing = harness
        .supervisor
        .artifact_read("artifact://fake/notes/nope.md", None)
        .expect_err("unknown artifact must fail");
    assert_eq!(missing.code, "NOT_FOUND");

    let context = harness.supervisor.context_get("fake").expect("context.get");
    assert_eq!(context["context"]["compacted"], serde_json::json!(false));

    let usage = harness
        .supervisor
        .usage_get(Some("fake".to_string()))
        .expect("usage.get");
    assert_eq!(usage["usage"]["cost"], serde_json::Value::Null);

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn provider_create_roundtrip_with_nulls() {
    // Payload tal cual lo arma main.rs: clave `type`, nulls explícitos.
    let harness = start_fake("stream");

    let created = harness
        .supervisor
        .provider_create(serde_json::json!({
            "alias": "demo",
            "type": "openai",
            "auth_method": null,
            "endpoint": null,
            "account_hint": null,
            "secret": "s",
            "secret_env": null,
            "settings": null,
        }))
        .expect("provider.create");
    assert_eq!(created["provider"]["alias"], serde_json::json!("demo"));

    let missing = harness
        .supervisor
        .provider_create(serde_json::json!({"alias": "demo2"}))
        .expect_err("missing type must fail");
    assert_eq!(missing.code, "INVALID_PARAMS");

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn workflow_roundtrip_queue_and_bundles() {
    let harness = start_fake("stream");

    let added = harness
        .supervisor
        .queue_add("s1", "second")
        .expect("queue.add");
    assert_eq!(added["position"], serde_json::json!(1));
    let empty = harness
        .supervisor
        .queue_add("s1", "   ")
        .expect_err("empty queue message must fail");
    assert_eq!(empty.code, "INVALID_PARAMS");

    let listed = harness.supervisor.queue_list("s1").expect("queue.list");
    assert_eq!(listed["pending"], serde_json::json!(1));
    let cleared = harness.supervisor.queue_clear("s1").expect("queue.clear");
    assert_eq!(cleared["removed"], serde_json::json!(1));

    let created = harness
        .supervisor
        .bundle_create(serde_json::json!({
            "id": "foco", "name": "Foco",
            "description": null, "soul_id": null, "mode": "plan",
        }))
        .expect("bundle.create");
    assert_eq!(created["profile"]["mode"], serde_json::json!("plan"));

    let dup = harness
        .supervisor
        .bundle_create(serde_json::json!({"id": "foco", "name": "Dup"}))
        .expect_err("duplicate bundle must fail");
    assert_eq!(dup.code, "CONFLICT");

    let applied = harness
        .supervisor
        .bundle_apply("foco", Some("s1".to_string()))
        .expect("bundle.apply");
    assert_eq!(applied["applied"]["profile_id"], serde_json::json!("foco"));

    harness
        .supervisor
        .bundle_remove("foco")
        .expect("bundle.remove");
    let missing = harness
        .supervisor
        .bundle_apply("foco", None)
        .expect_err("removed bundle must fail");
    assert_eq!(missing.code, "NOT_FOUND");

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

fn deltas(harness: &Harness) -> Vec<String> {
    harness
        .events
        .lock()
        .expect("events lock")
        .iter()
        .filter(|event| event.event == "model.content.delta")
        .map(|event| {
            event.payload["delta"]
                .as_str()
                .unwrap_or_default()
                .to_string()
        })
        .collect()
}

#[test]
fn streams_turn_to_completion_in_order() {
    let harness = start_fake("stream");
    let session_id = create_session(&harness);

    let accept = harness
        .supervisor
        .turn_start(&session_id, "hola")
        .expect("turn accepted");
    let turn_id = accept["turn_id"].as_str().expect("accept.turn_id");
    assert_eq!(accept["session_id"].as_str(), Some(session_id.as_str()));

    let completed = wait_for(&harness, Duration::from_secs(15), is("turn.completed"));
    assert_eq!(completed.payload["turn_id"].as_str(), Some(turn_id));
    assert_eq!(
        deltas(&harness),
        vec![
            "Hola, ".to_string(),
            "soy ".to_string(),
            "Rinari.".to_string()
        ]
    );

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn turn_start_forwards_reasoning_effort() {
    let harness = start_fake("stream");
    let session_id = create_session(&harness);

    let accept = harness
        .supervisor
        .turn_start_with_effort(&session_id, "hola", Some("high"))
        .expect("turn accepted");
    assert_eq!(accept["reasoning_effort"].as_str(), Some("high"));

    let _ = wait_for(&harness, Duration::from_secs(15), is("turn.completed"));
    harness.supervisor.shutdown();
}

#[test]
fn turn_start_forwards_unconfirmed_vision() {
    let harness = start_fake("stream");
    let session_id = create_session(&harness);

    let accept = harness
        .supervisor
        .turn_start_with_vision(&session_id, "describe", Some("low"), None, true)
        .expect("turn accepted");
    assert_eq!(accept["allow_unconfirmed_vision"].as_bool(), Some(true));

    let _ = wait_for(&harness, Duration::from_secs(15), is("turn.completed"));
    harness.supervisor.shutdown();
}

#[test]
fn desktop_session_permissions_files_and_attachments_roundtrip() {
    let harness = start_fake("stream");
    let created = harness
        .supervisor
        .session_create_with_options(
            None,
            true,
            Some("desktop".into()),
            Some("build".into()),
            Some("workspace".into()),
        )
        .expect("session created");
    let session_id = created["session"]["id"].as_str().expect("session id");
    assert_eq!(created["session"]["mode"], "build");
    assert_eq!(created["session"]["permission_profile"], "workspace");

    let changed = harness
        .supervisor
        .session_permission_set(session_id, "full-access")
        .expect("permission changed");
    assert_eq!(changed["session"]["permission_profile"], "full-access");
    let persisted = harness
        .supervisor
        .session_permission_get(session_id)
        .expect("permission read");
    assert_eq!(persisted["session"]["permission_profile"], "full-access");

    let files = harness
        .supervisor
        .workspace_file_search(session_id, "main", 30)
        .expect("files searched");
    assert_eq!(files["files"][0]["relative_path"], "src/main.ts");

    let attachments = serde_json::json!([{
        "id": "att_1",
        "path": "/fake/work/src/main.ts",
        "name": "main.ts",
        "source": "workspace"
    }]);
    let accept = harness
        .supervisor
        .turn_start_with_options(session_id, "revisa", Some("low"), Some(attachments))
        .expect("turn accepted");
    assert_eq!(accept["attachments"][0]["name"], "main.ts");
    let _ = wait_for(&harness, Duration::from_secs(15), is("turn.completed"));
    harness.supervisor.shutdown();
}

#[test]
fn turn_changes_review_and_undo_roundtrip() {
    let harness = start_fake("stream");
    let changes = harness
        .supervisor
        .turn_changes_get("turn_fake1")
        .expect("turn changes");
    assert_eq!(changes["files"][0]["path"], "src/main.ts");
    assert!(changes["files"][0].get("before_blob_ref").is_none());

    let review = harness
        .supervisor
        .turn_changes_review("turn_fake1", Some("src/main.ts"))
        .expect("turn review");
    assert_eq!(review["files"][0]["diff"], "+const ok = true");

    let preview = harness
        .supervisor
        .turn_changes_undo_preview("turn_fake1", None)
        .expect("undo preview");
    assert!(preview["conflicts"].as_array().unwrap().is_empty());
    let undone = harness
        .supervisor
        .turn_changes_undo("turn_fake1", None, false)
        .expect("undo");
    assert_eq!(undone["status"], "undone");
    harness.supervisor.shutdown();
}

#[test]
fn cancel_ends_slow_turn_without_completion() {
    let harness = start_fake("slow");
    let session_id = create_session(&harness);
    harness
        .supervisor
        .turn_start(&session_id, "cuenta lento")
        .expect("turn accepted");

    std::thread::sleep(Duration::from_millis(400));
    harness
        .supervisor
        .turn_cancel(&session_id)
        .expect("cancel accepted");
    wait_for(&harness, Duration::from_secs(15), is("turn.cancelled"));

    // A cancelled turn must never complete afterwards.
    std::thread::sleep(Duration::from_millis(600));
    let completed = harness
        .events
        .lock()
        .expect("events lock")
        .iter()
        .any(|event| event.event == "turn.completed");
    assert!(!completed, "cancelled turn completed");
    assert!(
        !deltas(&harness).is_empty(),
        "expected some deltas before cancel"
    );

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn approval_roundtrip_continues_turn() {
    let harness = start_fake("approval");
    let session_id = create_session(&harness);
    harness
        .supervisor
        .turn_start(&session_id, "hazlo")
        .expect("turn accepted");

    let requested = wait_for(&harness, Duration::from_secs(15), is("approval.requested"));
    let approval_id = requested.payload["approval_id"]
        .as_str()
        .expect("requested.approval_id");
    assert_eq!(approval_id, "apr_fake1");

    let resolved = harness
        .supervisor
        .approval_resolve(approval_id, "allow_once")
        .expect("approval resolved");
    assert_eq!(resolved["decision"].as_str(), Some("allow_once"));

    let completed = wait_for(&harness, Duration::from_secs(15), is("turn.completed"));
    assert_eq!(
        completed.payload["session_id"].as_str(),
        Some(session_id.as_str())
    );
    let saw_resolved = harness
        .events
        .lock()
        .expect("events lock")
        .iter()
        .any(|event| event.event == "approval.resolved");
    assert!(saw_resolved, "expected approval.resolved before completion");

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn dead_engine_surfaces_as_error_not_hang() {
    let harness = start_fake("die");
    let session_id = create_session(&harness);
    harness
        .supervisor
        .turn_start(&session_id, "hola")
        .expect("turn accepted");
    wait_for(&harness, Duration::from_secs(15), is("turn.started"));

    // The fake exits abruptly mid-turn. Reads must fail fast (well under the
    // 60s request ceiling) and health must downgrade instead of lying Ready.
    let start = Instant::now();
    let error = harness
        .supervisor
        .request(Method::SessionList, None)
        .expect_err("dead engine must error");
    assert!(
        start.elapsed() < Duration::from_secs(15),
        "error took too long: {:?}",
        start.elapsed()
    );
    assert!(!error.code.is_empty(), "typed machine code, got {error:?}");
    assert_eq!(
        format!("{:?}", harness.supervisor.status().state),
        "Degraded"
    );

    assert_eq!(
        format!("{:?}", harness.supervisor.shutdown().state),
        "Stopped"
    );
}

#[test]
fn provider_crud_roundtrip() {
    let harness = start_fake("stream");
    let supervisor = &harness.supervisor;

    let list = supervisor.provider_list().expect("provider.list");
    assert_eq!(list["providers"].as_array().map(Vec::len), Some(0));

    let created = supervisor
        .provider_create(serde_json::json!({
            "alias": "ollama",
            "type": "custom",
            "auth_method": "none",
            "endpoint": "http://127.0.0.1:11434/v1",
        }))
        .expect("provider.create");
    assert_eq!(created["provider"]["alias"], "ollama");
    assert_eq!(created["provider"]["has_credential"], false);

    let conflict = supervisor
        .provider_create(serde_json::json!({"alias": "ollama", "type": "custom"}))
        .expect_err("duplicate alias");
    assert_eq!(conflict.code, "CONFLICT");

    let updated = supervisor
        .provider_update(serde_json::json!({"ref": "ollama", "endpoint": "http://x:9/v1"}))
        .expect("provider.update");
    assert_eq!(updated["provider"]["endpoint"], "http://x:9/v1");

    let health = supervisor.provider_test("ollama").expect("provider.test");
    assert_eq!(health["connected"], true);
    assert_eq!(health["models_discovered"], 2);

    let found = supervisor
        .model_discover(Some("ollama".to_string()))
        .expect("model.discover");
    assert_eq!(found["providers"]["fake"].as_array().map(Vec::len), Some(2));

    let added = supervisor
        .model_add(serde_json::json!({
            "provider": "ollama",
            "provider_model_id": "mx-1",
            "alias": "principal",
        }))
        .expect("model.add");
    assert_eq!(added["model"]["active"], true);

    let used = supervisor.model_use("principal", None).expect("model.use");
    assert_eq!(used["model"]["alias"], "principal");

    supervisor
        .provider_create(serde_json::json!({"alias": "b", "type": "custom"}))
        .expect("second provider");
    supervisor.provider_use("b").expect("provider.use");
    let removed = supervisor
        .provider_remove("ollama", Some("b".to_string()), false)
        .expect("provider.remove");
    assert_eq!(removed["removed"]["alias"], "ollama");
    let list = supervisor.provider_list().expect("provider.list");
    assert_eq!(list["active_alias"], "b");

    assert_eq!(format!("{:?}", supervisor.shutdown().state), "Stopped");
}

#[test]
fn legacy_engine_is_rejected_before_desktop_requests() {
    let supervisor = EngineSupervisor::new();
    let error = supervisor
        .start_with(python(), &[fixture(), "--scenario=legacy".into()], None)
        .expect_err("old engine must be rejected");
    assert_eq!(error.code, "ENGINE_INCOMPATIBLE");
}
