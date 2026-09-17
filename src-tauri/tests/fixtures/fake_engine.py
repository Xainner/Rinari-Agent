"""Scripted fake Rinari engine for hermetic desktop-client tests.

Speaks just enough of Engine Protocol v1 over stdio (hello, response
envelopes, async events) with canned answers: no model, no network, no
credentials, deterministic timing. Run by Rust integration tests in
src-tauri/tests/engine_roundtrip.rs — never by production code.

Usage:
    python fake_engine.py --scenario stream|slow|approval|die

Scenarios (all keyed off session.turn.start):
    stream    3 content deltas, then turn.completed.
    slow      200 deltas 50ms apart; honours session.turn.cancel.
    approval  1 delta, then approval.requested; waits for approval.resolve
              (or EOF) before approval.resolved + turn.completed.
    die       turn.started + 1 delta, then exits abruptly (crash path).
"""

import json
import os
import sys
import threading
import time

def _manifest_capabilities():
    """Capacidades que el manifest declara para un engine real.

    El supervisor exige las mismas que `engine-manifest.json`; derivarlas evita
    que este fixture quede desactualizado cada vez que el gate crece.
    """
    import json as _json
    from pathlib import Path as _Path

    manifest_path = _Path(__file__).resolve().parents[3] / "engine-manifest.json"
    try:
        manifest = _json.loads(manifest_path.read_text(encoding="utf-8"))
    except OSError:
        return {}
    keys = list(manifest.get("required_capabilities", []))
    keys += list(manifest.get("optional_capabilities", []))
    return {key: True for key in keys}


_MANIFEST_CAPABILITIES = _manifest_capabilities()

CAPABILITIES = {
    "chat": True,
    "projects": True,
    "browser": True,
    "mcp": True,
    "plugins": True,
    "subagents": True,
    "artifacts": True,
    "checkpoints": True,
    "terminal": True,
    "desktop_turn_runtime_v3": True,
    "activity_timeline_v1": True,
    "permission_profiles_v2": True,
    "turn_changeset_v1": True,
    # Gate del supervisor = capacidades del manifest (requeridas + opcionales).
    **_MANIFEST_CAPABILITIES,
}

DECISIONS = ["allow_once", "allow_session", "deny"]


def emit(name, payload):
    sys.stdout.write(json.dumps({"type": "event", "event": name, "payload": payload}) + "\n")
    sys.stdout.flush()


def respond(req_id, ok=True, result=None, error=None):
    message = {"id": req_id, "ok": ok}
    if ok:
        message["result"] = result if result is not None else {}
    else:
        message["error"] = error
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def fail(req_id, code, message):
    respond(req_id, ok=False, error={"code": code, "message": message,
                                    "retryable": False, "details": {}})


class FakeEngine:
    def __init__(self, scenario):
        self.scenario = scenario
        self.lock = threading.Lock()
        self.sessions = {}
        self.session_seq = 0
        self.turn_seq = 0
        self.cancelled = set()
        self.approved = {}
        self.providers = {}
        self.provider_seq = 0
        self.active_provider = None
        self.models = []
        self.model_seq = 0
        self.transcripts = {}
        self.pending_turns = {}
        self.timelines = {}
        self.agent_configs = {}
        self.souls = {}
        self.active_soul = None
        self.mcp_servers = {}
        self.fake_plugin_enabled = True
        self.queue = []
        self.bundles = {}

    def session_list(self, req_id, _params):
        respond(req_id, result={"sessions": list(self.sessions.values())})

    def session_create(self, req_id, params):
        params = params or {}
        self.session_seq += 1
        session_id = f"ses_fake{self.session_seq}"
        kind = "PROJECT" if not params.get("chat", True) else "CHAT"
        record = {"id": session_id,
                  "kind": kind,
                  "title": params.get("title") or "fake",
                  "mode": params.get("mode") or "build",
                  "permission_profile": params.get("permission_profile") or "workspace",
                  "effective_permission_profile": params.get("permission_profile") or "workspace",
                  "state": "active",
                  "project_root": None,
                  "current_cwd": "/fake/work",
                  "updated_at": "2026-01-01T00:00:00Z"}
        self.sessions[session_id] = record
        self.transcripts[session_id] = []
        respond(req_id, result={"session_id": session_id, "created": True,
                               "session": record})

    def session_open(self, req_id, params):
        session_id = (params or {}).get("ref", "")
        record = self.sessions.get(session_id)
        if record is None:
            fail(req_id, "NOT_FOUND", f"Session {session_id} not found.")
            return
        respond(req_id, result={"session": record, "created": False, "warnings": []})

    def session_mode_set(self, req_id, params):
        params = params or {}
        session_id = params.get("ref", "")
        record = self.sessions.get(session_id)
        if record is None:
            fail(req_id, "NOT_FOUND", f"Session {session_id} not found.")
            return
        mode = params.get("mode", "")
        if mode not in ("plan", "build", "review"):
            fail(req_id, "INVALID_USAGE",
                 f"Unknown session mode: {mode!r}. Valid modes: plan, build, review.")
            return
        record["mode"] = mode
        respond(req_id, result={"session": record})
        emit("session.mode.changed", {"session_id": session_id, "mode": mode})

    def session_permission_set(self, req_id, params):
        params = params or {}
        session_id = params.get("ref", "")
        record = self.sessions.get(session_id)
        if record is None:
            fail(req_id, "NOT_FOUND", f"Session {session_id} not found.")
            return
        profile = params.get("permission_profile", "")
        if profile not in ("read-only", "workspace", "full-access"):
            fail(req_id, "INVALID_USAGE", f"Unknown permission profile: {profile!r}.")
            return
        record["permission_profile"] = profile
        record["effective_permission_profile"] = (
            profile if record["mode"] == "build" else "read-only"
        )
        respond(req_id, result={"session": record})

    def session_permission_get(self, req_id, params):
        session_id = (params or {}).get("ref", "")
        record = self.sessions.get(session_id)
        if record is None:
            fail(req_id, "NOT_FOUND", f"Session {session_id} not found.")
            return
        respond(req_id, result={"session": record})

    def _changeset(self, turn_id):
        return {
            "id": "chg_fake1", "turn_id": turn_id, "session_id": "ses_fake1",
            "project_id": None, "additions": 1, "deletions": 0,
            "undoable": True, "attribution_complete": True, "warnings": [],
            "status": "active", "files": [{
                "path": "src/main.ts", "absolute_path": "/fake/work/src/main.ts",
                "previous_path": None, "kind": "modified", "additions": 1,
                "deletions": 0, "ownership": "agent", "confidence": "exact",
                "binary": False, "sensitive": False, "diff": "+const ok = true",
                "diff_truncated": False, "undoable": True, "conflict_reason": None,
            }],
        }

    def turn_changes_get(self, req_id, params):
        respond(req_id, result=self._changeset((params or {}).get("turn_id", "turn_fake1")))

    def turn_changes_review(self, req_id, params):
        changeset = self._changeset((params or {}).get("turn_id", "turn_fake1"))
        respond(req_id, result={"changeset_id": changeset["id"],
                               "turn_id": changeset["turn_id"],
                               "files": changeset["files"]})

    def turn_changes_undo_preview(self, req_id, params):
        turn_id = (params or {}).get("turn_id", "turn_fake1")
        respond(req_id, result={"changeset_id": "chg_fake1", "turn_id": turn_id,
                               "operations": [{"path": "src/main.ts",
                                               "absolute_path": "/fake/work/src/main.ts",
                                               "action": "restore", "safe": True}],
                               "conflicts": []})

    def turn_changes_undo(self, req_id, params):
        turn_id = (params or {}).get("turn_id", "turn_fake1")
        respond(req_id, result={"changeset_id": "chg_fake1", "turn_id": turn_id,
                               "operations": [], "conflicts": [], "status": "undone",
                               "applied": ["src/main.ts"], "skipped": []})

    def session_model_set(self, req_id, params):
        params = params or {}
        record = self.sessions.get(params.get("ref", ""))
        model = next((item for item in self.models if item["id"] == params.get("model")), None)
        if record is None or model is None:
            fail(req_id, "NOT_FOUND", "Session or model not found.")
            return
        record["provider_id"] = model["provider_id"]
        record["model_id"] = model["id"]
        respond(req_id, result={"session": record, "model": self._model_view(model)})

    def workspace_file_search(self, req_id, params):
        query = (params or {}).get("query", "")
        respond(req_id, result={"root": "/fake/work", "files": [
            {"path": "/fake/work/src/main.ts", "relative_path": "src/main.ts",
             "name": "main.ts"}
        ] if "main" in query else []})

    # -- workspace reads (Phase 6): canned, path-echoing shapes -------------

    def task_tree(self, req_id, params):
        if not (params or {}).get("path"):
            fail(req_id, "INVALID_PARAMS", "Param 'path' must be a non-empty string.")
            return
        tasks = [{"id": "tsk_fake1", "title": "Fake task",
                  "status": "in_progress", "depends_on": ""},
                 {"id": "tsk_fake2", "title": "Fake child",
                  "status": "pending", "depends_on": "tsk_fake1"}]
        respond(req_id, result={"tasks": tasks,
                               "depths": {"tsk_fake1": 0, "tsk_fake2": 1}})

    def task_get(self, req_id, params):
        params = params or {}
        if not params.get("path"):
            fail(req_id, "INVALID_PARAMS", "Param 'path' must be a non-empty string.")
            return
        if params.get("task_id") != "tsk_fake1":
            fail(req_id, "NOT_FOUND", "Task not found: %s." % params.get("task_id"))
            return
        respond(req_id, result={"task": {"id": "tsk_fake1", "title": "Fake task",
                                        "status": "in_progress",
                                        "done_when": {"done": False,
                                                     "blockers": ["tsk_fake2"]}}})

    def verification_latest(self, req_id, params):
        if not (params or {}).get("path"):
            fail(req_id, "INVALID_PARAMS", "Param 'path' must be a non-empty string.")
            return
        respond(req_id, result={"records": [
            {"id": "val_fake1", "kind": "test", "command": "pytest -q",
             "result": "pass", "summary": "3 passed",
             "created_at": "2026-01-01T00:00:00Z"}]})

    def verification_plan(self, req_id, params):
        params = params or {}
        if not params.get("path"):
            fail(req_id, "INVALID_PARAMS", "Param 'path' must be a non-empty string.")
            return
        changed = params.get("changed_files", [])
        if not isinstance(changed, list):
            fail(req_id, "INVALID_PARAMS", "Param 'changed_files' must be a list of strings.")
            return
        respond(req_id, result={"plan": {"changed": changed, "tests": ["pytest -q"],
                                        "targeted": [], "adjacent": [], "broader": [],
                                        "test_commands": ["pytest -q"], "lint_commands": [],
                                        "typecheck_commands": [], "build_commands": [],
                                        "sources": ["fake"], "risk": "low", "reasons": []}})

    def checkpoint_list(self, req_id, _params):
        respond(req_id, result={"checkpoints": [
            {"id": "chk_fake1", "label": "fake point",
             "created_at": "2026-01-01T00:00:00Z"}]})

    def checkpoint_show(self, req_id, params):
        if (params or {}).get("checkpoint_id") != "chk_fake1":
            fail(req_id, "INVALID_USAGE", "Checkpoint not found: %s."
                 % (params or {}).get("checkpoint_id"))
            return
        respond(req_id, result={"checkpoint": {"id": "chk_fake1", "label": "fake point",
                                              "files": [{"path": "a.txt",
                                                        "status": "modified"}]}})

    def checkpoint_restore(self, req_id, params):
        params = params or {}
        if not params.get("path"):
            fail(req_id, "INVALID_PARAMS", "Param 'path' must be a non-empty string.")
            return
        respond(req_id, result={"result": {"restored": ["a.txt"],
                                          "preview": bool(params.get("preview"))}})

    def project_changes(self, req_id, params):
        if not (params or {}).get("path"):
            fail(req_id, "INVALID_PARAMS", "Param 'path' must be a non-empty string.")
            return
        respond(req_id, result={"available": True, "branch": "main", "head": "abc123",
                               "dirty": True,
                               "files": [{"path": "a.txt", "staged": None,
                                         "unstaged": "M"}]})

    def project_diff(self, req_id, params):
        params = params or {}
        if not params.get("path"):
            fail(req_id, "INVALID_PARAMS", "Param 'path' must be a non-empty string.")
            return
        diff = "diff --git a/a.txt b/a.txt\n+fake line\n"
        respond(req_id, result={"diff": diff, "truncated": False, "binary": False,
                               "chars": len(diff)})

    # -- agents (Phase 7): canned registry + assignments ---------------------

    def agent_list(self, req_id, _params):
        agents = []
        for name in ("explore", "reviewer", "debugger", "researcher",
                     "implementer", "verifier"):
            saved = self.agent_configs.get(name, {})
            agents.append({"name": name, "description": f"fake {name}",
                          "profile": "read-only", "provenance": "builtin",
                          "tool_allowlist": [],
                          "budget": {"max_model_calls": 12, "max_tool_calls": 48,
                                    "max_wall_time_s": 600.0},
                          "assignment": {"model": saved.get("model"),
                                        "fallback": saved.get("fallback"),
                                        "enabled": saved.get("enabled", True)}})
        respond(req_id, result={"agents": agents})

    def agent_config_get(self, req_id, params):
        name = (params or {}).get("agent", "")
        if name not in ("explore", "reviewer", "debugger", "researcher",
                        "implementer", "verifier"):
            fail(req_id, "NOT_FOUND", f"Unknown agent: {name}.")
            return
        saved = self.agent_configs.get(name, {})
        respond(req_id, result={"agent": {"name": name, "description": f"fake {name}",
                                         "profile": "read-only", "provenance": "builtin",
                                         "tool_allowlist": [],
                                         "budget": {"max_model_calls": 12,
                                                   "max_tool_calls": 48,
                                                   "max_wall_time_s": 600.0},
                                         "assignment": {"model": saved.get("model"),
                                                       "fallback": saved.get("fallback"),
                                                       "enabled": saved.get("enabled", True)}}})

    def agent_config_set(self, req_id, params):
        params = params or {}
        name = params.get("agent", "")
        if name not in ("explore", "reviewer", "debugger", "researcher",
                        "implementer", "verifier"):
            fail(req_id, "NOT_FOUND", f"Unknown agent: {name}.")
            return
        if params.get("clear") is True:
            self.agent_configs.pop(name, None)
        else:
            saved = self.agent_configs.setdefault(name, {})
            if params.get("model") is not None:
                saved["model"] = params.get("model")
            if params.get("fallback") is not None:
                saved["fallback"] = params.get("fallback")
            if params.get("enabled") is not None:
                saved["enabled"] = params.get("enabled")
        self.agent_config_get(req_id, {"agent": name})

    def session_events(self, req_id, params):
        params = params or {}
        session_id = params.get("ref", "")
        if session_id not in self.sessions:
            fail(req_id, "NOT_FOUND", f"Session {session_id} not found.")
            return
        events = [{"id": "evt_fake1", "seq": 1, "type": "SubagentStart",
                  "payload": {"agent": "explore", "state": "running"},
                  "created_at": "2026-01-01T00:00:00Z"}]
        respond(req_id, result={"session_id": session_id, "events": events,
                               "has_more": False})

    # -- souls (Phase 8): canned registry ------------------------------------

    def soul_list(self, req_id, _params):
        souls = [{"id": "rinari-default", "name": "Rinari", "version": "3.0",
                 "description": "fake default", "source": "bundled"}]
        for soul_id, saved in sorted(self.souls.items()):
            souls.append({"id": soul_id, "name": saved.get("name", soul_id),
                         "version": saved.get("version", "1.0"),
                         "description": saved.get("description", ""),
                         "source": "custom"})
        respond(req_id, result={"souls": souls, "active_id": self.active_soul})

    def _soul_detail(self, soul_id):
        if soul_id == "rinari-default":
            return {"id": "rinari-default", "name": "Rinari", "version": "3.0",
                   "description": "fake default", "source": "bundled",
                   "identity": "You are Rinari, a fake soul."}
        saved = self.souls.get(soul_id)
        if saved is None:
            return None
        return {"id": soul_id, "name": saved.get("name", soul_id),
               "version": saved.get("version", "1.0"),
               "description": saved.get("description", ""), "source": "custom",
               "identity": saved.get("identity", "")}

    def soul_get(self, req_id, params):
        detail = self._soul_detail((params or {}).get("id", ""))
        if detail is None:
            fail(req_id, "NOT_FOUND", "Unknown soul: %s." % (params or {}).get("id"))
            return
        respond(req_id, result={"soul": detail})

    def soul_create(self, req_id, params):
        params = params or {}
        soul_id = params.get("id", "")
        if not soul_id or soul_id == "rinari-default" or soul_id in self.souls:
            fail(req_id, "INVALID_PARAMS" if soul_id == "rinari-default" or not soul_id else "CONFLICT",
                 f"Cannot create soul: {soul_id!r}.")
            return
        if not params.get("name") or not params.get("identity"):
            fail(req_id, "INVALID_PARAMS", "Params 'name'/'identity' are required.")
            return
        self.souls[soul_id] = {"name": params.get("name"),
                              "identity": params.get("identity"),
                              "description": params.get("description") or "",
                              "version": params.get("version") or "1.0"}
        self.soul_get(req_id, {"id": soul_id})

    def soul_update(self, req_id, params):
        params = params or {}
        soul_id = params.get("id", "")
        if soul_id == "rinari-default" or soul_id not in self.souls:
            fail(req_id, "INVALID_USAGE" if soul_id == "rinari-default" else "NOT_FOUND",
                 f"Cannot update soul: {soul_id!r}.")
            return
        saved = self.souls[soul_id]
        for key in ("name", "identity", "description", "version"):
            if params.get(key) is not None:
                saved[key] = params.get(key)
        self.soul_get(req_id, {"id": soul_id})

    def soul_remove(self, req_id, params):
        soul_id = (params or {}).get("id", "")
        if soul_id == "rinari-default" or soul_id not in self.souls:
            fail(req_id, "INVALID_USAGE" if soul_id == "rinari-default" else "NOT_FOUND",
                 f"Cannot remove soul: {soul_id!r}.")
            return
        del self.souls[soul_id]
        if self.active_soul == soul_id:
            self.active_soul = None
        respond(req_id, result={"removed": {"id": soul_id}})

    def soul_activate(self, req_id, params):
        soul_id = (params or {}).get("id", "")
        if soul_id != "rinari-default" and soul_id not in self.souls:
            fail(req_id, "NOT_FOUND", f"Unknown soul: {soul_id}.")
            return
        self.active_soul = soul_id
        detail = self._soul_detail(soul_id)
        respond(req_id, result={"soul": {k: v for k, v in detail.items() if k != "identity"}})

    # -- ecosystem (Phase 9): canned MCP/plugins ---------------------------------

    def mcp_list(self, req_id, _params):
        servers = []
        for name in sorted(self.mcp_servers):
            saved = self.mcp_servers[name]
            servers.append({"name": name, "transport": "stdio",
                           "command": saved["command"], "scope": "global",
                           "enabled": saved["enabled"],
                           "connected": False, "updated_at": None})
        respond(req_id, result={"servers": servers})

    def mcp_create(self, req_id, params):
        params = params or {}
        name = params.get("name", "")
        command = params.get("command", [])
        if not name or not isinstance(command, list) or not command:
            fail(req_id, "INVALID_PARAMS", "Params 'name'/'command' are required.")
            return
        if name in self.mcp_servers:
            fail(req_id, "CONFLICT", f"MCP server exists: {name}.")
            return
        self.mcp_servers[name] = {"command": " ".join(command), "enabled": True}
        respond(req_id, result={"server": {"name": name, "transport": "stdio",
                "command": " ".join(command), "scope": "global", "enabled": True,
                "connected": False, "updated_at": None}})

    def mcp_remove(self, req_id, params):
        name = (params or {}).get("name", "")
        if name not in self.mcp_servers:
            fail(req_id, "NOT_FOUND", f"Unknown MCP server: {name}.")
            return
        del self.mcp_servers[name]
        respond(req_id, result={"removed": {"name": name}})

    def mcp_enable(self, req_id, params):
        self._mcp_set_enabled(req_id, params, True)

    def mcp_disable(self, req_id, params):
        self._mcp_set_enabled(req_id, params, False)

    def _mcp_set_enabled(self, req_id, params, enabled):
        params = params or {}
        name = params.get("name", "")
        if name not in self.mcp_servers:
            fail(req_id, "NOT_FOUND", f"Unknown MCP server: {name}.")
            return
        self.mcp_servers[name]["enabled"] = enabled
        saved = self.mcp_servers[name]
        respond(req_id, result={"server": {"name": name, "transport": "stdio",
                "command": saved["command"], "scope": "global",
                "enabled": saved["enabled"], "connected": False, "updated_at": None}})

    def mcp_test(self, req_id, params):
        name = (params or {}).get("name", "")
        if name not in self.mcp_servers:
            respond(req_id, result={"test": {"ok": False, "error": "MCP_NOT_FOUND",
                    "message": f"unknown MCP server: {name}", "tools": 0}})
            return
        respond(req_id, result={"test": {"ok": False, "error": "MCP_NOT_CONNECTED",
                "message": "fake server never connects", "tools": 0}})

    def plugin_list(self, req_id, _params):
        respond(req_id, result={"plugins": [
            {"name": "fake-plugin", "version": "0.1.0", "source": "user",
             "scope": "global", "enabled": self.fake_plugin_enabled,
             "path": "/fake/plugins/fake-plugin", "capabilities": ["tools"],
             "diagnostics": [{"code": "OK", "message": "fake plugin loads cleanly"}]}
        ]})

    def plugin_enable(self, req_id, params):
        self._plugin_set_enabled(req_id, params, True)

    def plugin_disable(self, req_id, params):
        self._plugin_set_enabled(req_id, params, False)

    def _plugin_set_enabled(self, req_id, params, enabled):
        params = params or {}
        if params.get("name") != "fake-plugin":
            fail(req_id, "NOT_FOUND", "Unknown plugin.")
            return
        self.fake_plugin_enabled = enabled
        respond(req_id, result={"plugin": {
            "name": "fake-plugin", "version": "0.1.0", "source": "user",
            "scope": "global", "enabled": self.fake_plugin_enabled,
            "path": "/fake/plugins/fake-plugin", "capabilities": ["tools"],
            "diagnostics": [{"code": "OK", "message": "fake plugin loads cleanly"}]}})

    def plugin_diagnostics(self, req_id, _params):
        respond(req_id, result={"reports": [
            {"name": "fake-plugin", "source": "user",
             "diagnostics": [{"code": "OK", "message": "fake plugin loads cleanly"}]}
        ]})

    def tool_list(self, req_id, _params):
        respond(req_id, result={"tools": [
            {"name": "artifact.read", "description": "fake", "capabilities": None,
             "permissions": None, "risk": "low", "side_effects": "none",
             "namespace": "artifact", "always_loaded": True}
        ]})

    def policy_get(self, req_id, _params):
        respond(req_id, result={"mode_profile": {
            "plan": "READ_ONLY", "build": "WORKSPACE", "review": "READ_ONLY"},
            "note": "fake policy mapping"})

    # -- observability (Phase 10): canned artifacts/context/usage ------------------

    def artifact_list(self, req_id, params):
        respond(req_id, result={"artifacts": [self._fake_artifact()]})

    def _fake_artifact(self):
        return {"uri": "artifact://fake/notes/plan.md", "id": "art-1",
               "session": "fake", "project_root": "", "namespace": "notes",
               "name": "plan.md", "content_type": "text/plain",
               "sha256": "deadbeef", "byte_count": 11, "summary": "fake",
               "provenance": "fake", "retention": "session",
               "created_at": "2026-01-01T00:00:00Z"}

    def artifact_read(self, req_id, params):
        uri = (params or {}).get("uri", "")
        if uri != "artifact://fake/notes/plan.md":
            fail(req_id, "NOT_FOUND", f"Artifact not found: {uri}.")
            return
        respond(req_id, result={"artifact": self._fake_artifact(),
                "text": "hello fake", "truncated": False, "max_bytes": 65536})

    def context_get(self, req_id, params):
        respond(req_id, result={"context": {
            "session_id": (params or {}).get("ref", ""),
            "compacted": False, "compacted_at": "", "goal": "",
            "provider_model": "",
            "counts": {"tasks_completed": 0, "tasks_active": 0,
                      "tasks_blocked": 0, "changed_files": 0,
                      "validations": 0, "approvals": 0, "artifacts": 1}}})

    def usage_get(self, req_id, params):
        respond(req_id, result={"usage": {
            "session_id": (params or {}).get("ref"),
            "model_calls": 0,
            "tokens": {"input": 0, "output": 0, "cached": 0, "reasoning": 0},
            "tool_calls": {"total": 0, "ok": 0, "error": 0}, "cost": None}})

    # -- workflow (Phase 11): canned queue + bundles ------------------------------

    def queue_add(self, req_id, params):
        params = params or {}
        message = (params.get("message") or "").strip()
        if not message:
            fail(req_id, "INVALID_PARAMS", "Queued message is empty.")
            return
        self.queue.append(message)
        respond(req_id, result={"session_id": params.get("session_id", ""),
                "position": len(self.queue), "pending": len(self.queue)})

    def queue_list(self, req_id, params):
        respond(req_id, result={"session_id": (params or {}).get("session_id", ""),
                "queue": list(self.queue), "pending": len(self.queue)})

    def queue_clear(self, req_id, params):
        removed = len(self.queue)
        self.queue.clear()
        respond(req_id, result={"session_id": (params or {}).get("session_id", ""),
                "removed": removed})

    def bundle_list(self, req_id, _params):
        respond(req_id, result={"profiles": [
            {"id": key, "name": val["name"], "description": val.get("description", ""),
             "soul_id": val.get("soul_id"), "mode": val.get("mode"),
             "agents": val.get("agents", {})}
            for key, val in sorted(self.bundles.items())]})

    def bundle_create(self, req_id, params):
        params = params or {}
        bundle_id = params.get("id", "")
        if not bundle_id:
            fail(req_id, "INVALID_PARAMS", "Param 'id' is required.")
            return
        if bundle_id in self.bundles:
            fail(req_id, "CONFLICT", f"Profile exists: {bundle_id}.")
            return
        if not params.get("name"):
            fail(req_id, "INVALID_PARAMS", "Param 'name' is required.")
            return
        self.bundles[bundle_id] = {"name": params.get("name"),
            "description": params.get("description") or "",
            "soul_id": params.get("soul_id"), "mode": params.get("mode"),
            "agents": params.get("agents") or {}}
        respond(req_id, result={"profile": {"id": bundle_id, **self.bundles[bundle_id]}})

    def bundle_remove(self, req_id, params):
        bundle_id = (params or {}).get("id", "")
        if bundle_id not in self.bundles:
            fail(req_id, "NOT_FOUND", f"Unknown profile: {bundle_id}.")
            return
        del self.bundles[bundle_id]
        respond(req_id, result={"removed": {"id": bundle_id}})

    def bundle_apply(self, req_id, params):
        bundle_id = (params or {}).get("id", "")
        if bundle_id not in self.bundles:
            fail(req_id, "NOT_FOUND", f"Unknown profile: {bundle_id}.")
            return
        respond(req_id, result={"applied": {"profile_id": bundle_id,
                "soul_id": self.bundles[bundle_id].get("soul_id"),
                "session_id": (params or {}).get("session_ref")}})

    def session_history(self, req_id, params):
        params = params or {}
        session_id = params.get("ref", "")
        rows = self.transcripts.get(session_id)
        if rows is None:
            fail(req_id, "NOT_FOUND", f"Session {session_id} not found.")
            return
        limit = params.get("limit", 200)
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 500:
            fail(req_id, "INVALID_PARAMS", "Param 'limit' must be an int in 1..500.")
            return
        window = rows[-limit:] if len(rows) > limit else rows
        respond(req_id, result={"session_id": session_id, "messages": window,
                               "total": len(rows), "has_more": len(rows) > len(window)})

    def session_timeline(self, req_id, params):
        params = params or {}
        session_id = params.get("ref", "")
        if session_id not in self.sessions:
            fail(req_id, "NOT_FOUND", f"Session {session_id} not found.")
            return
        turns = [turn for turn in self.timelines.values()
                 if turn["session_id"] == session_id]
        limit = params.get("limit", 30)
        before = params.get("before_turn_index")
        if before is not None:
            turns = [turn for turn in turns if turn["turn_index"] < before]
        has_more = len(turns) > limit
        turns = turns[-limit:]
        respond(req_id, result={"session_id": session_id, "turns": turns,
                               "has_more": has_more,
                               "next_before_turn_index": turns[0]["turn_index"] if has_more and turns else None})

    def _append_transcript(self, session_id, role, content, turn_id=None):
        rows = self.transcripts.setdefault(session_id, [])
        rows.append({"id": f"msg_fake{len(rows) + 1}", "seq": len(rows) + 1,
                    "role": role, "content": content, "tool_calls": None,
                    "tool_call_id": None, "name": None,
                    "created_at": "2026-01-01T00:00:00Z", "turn_id": turn_id})

    def turn_start(self, req_id, params):
        params = params or {}
        session_id = params.get("session_id", "")
        if session_id not in self.sessions:
            fail(req_id, "NOT_FOUND", f"Session {session_id} not found.")
            return
        self.turn_seq += 1
        turn_id = f"turn_fake{self.turn_seq}"
        with self.lock:
            self.pending_turns[turn_id] = (session_id, params.get("message", ""))
            self.timelines[turn_id] = {"turn_id": turn_id, "session_id": session_id,
                "turn_index": self.turn_seq - 1, "status": "running",
                "started_at": "2026-01-01T00:00:00Z", "completed_at": None,
                "user_message": params.get("message", ""), "items": [],
                "final_response": ""}
        respond(req_id, result={"status": "started", "turn_id": turn_id,
                               "session_id": session_id,
                               "reasoning_effort": params.get("reasoning_effort"),
                               "attachments": params.get("attachments", []),
                               "allow_unconfirmed_vision": params.get("allow_unconfirmed_vision", False)})
        worker = threading.Thread(target=self._run_scenario,
                                  args=(turn_id, session_id), daemon=True)
        worker.start()

    def turn_cancel(self, req_id, params):
        session_id = (params or {}).get("session_id", "")
        with self.lock:
            self.cancelled.add(session_id)
        respond(req_id, result={"status": "cancelled", "session_id": session_id})

    def approval_resolve(self, req_id, params):
        params = params or {}
        approval_id = params.get("approval_id", "")
        decision = params.get("decision", "")
        if decision not in DECISIONS:
            fail(req_id, "INVALID_PARAMS",
                 f"Param 'decision' must be one of {', '.join(DECISIONS)}.")
            return
        with self.lock:
            event = self.approved.setdefault(approval_id, threading.Event())
            self.approved[approval_id + ":decision"] = decision
            event.set()
        respond(req_id, result={"status": "resolved", "approval_id": approval_id,
                               "decision": decision})

    def snapshot_get(self, req_id, _params):
        respond(req_id, result={"sessions": list(self.sessions.values()),
                               "engine": {"version": "fake-1.0"}})

    def engine_info(self, req_id, _params):
        respond(req_id, result={"protocol": "rinari-engine", "protocol_version": 1,
                               "engine_version": "fake-1.0",
                               "capabilities": CAPABILITIES})

    def provider_list(self, req_id, _params):
        respond(req_id, result={"providers": [{"alias": "fake", "kind": "fake"}],
                               "active_alias": "fake"})

    def model_list(self, req_id, _params):
        respond(req_id, result={"models": [{"alias": "fake-one",
                                           "provider": "fake"}]})

    def _run_scenario(self, turn_id, session_id):
        scenario = self.scenario
        emit("turn.started", {"turn_id": turn_id, "session_id": session_id})
        if scenario == "die":
            emit("model.content.delta", {"turn_id": turn_id,
                                         "session_id": session_id,
                                         "delta": "bye"})
            sys.stdout.flush()
            os._exit(1)
        if scenario == "approval":
            self._run_approval(turn_id, session_id)
            return
        deltas = (["Hola, ", "soy ", "Rinari."]
                  if scenario == "stream" else [f"tick{i} " for i in range(200)])
        pace = 0.01 if scenario == "stream" else 0.05
        for delta in deltas:
            with self.lock:
                stop = session_id in self.cancelled
            if stop:
                break
            emit("model.content.delta", {"turn_id": turn_id,
                                         "session_id": session_id,
                                         "delta": delta})
            time.sleep(pace)
        with self.lock:
            was_cancelled = session_id in self.cancelled
            self.cancelled.discard(session_id)
        if was_cancelled:
            self.timelines[turn_id]["status"] = "cancelled"
            emit("turn.cancelled", {"turn_id": turn_id, "session_id": session_id})
        else:
            self.timelines[turn_id].update({"status": "completed",
                "completed_at": "2026-01-01T00:00:01Z",
                "final_response": "".join(deltas),
                "items": [{"event": "model.content.completed", "turn_id": turn_id,
                    "session_id": session_id, "model_call_id": "model_fake1",
                    "activity_seq": 1, "occurred_at": "2026-01-01T00:00:01Z",
                    "output_kind": "final", "content": "".join(deltas)}]})
            emit("turn.completed", {"turn_id": turn_id, "session_id": session_id,
                                   "kind": "done", "content": "".join(deltas)})
        with self.lock:
            pending = self.pending_turns.pop(turn_id, None)
        if pending is not None and scenario in ("stream", "slow"):
            session_id, message = pending
            if scenario == "stream" or not was_cancelled:
                self._append_transcript(session_id, "user", message, turn_id)
                self._append_transcript(session_id, "assistant", "".join(deltas), turn_id)

    def _run_approval(self, turn_id, session_id):
        emit("model.content.delta", {"turn_id": turn_id, "session_id": session_id,
                                     "delta": "necesito permiso"})
        approval_id = "apr_fake1"
        with self.lock:
            event = self.approved.setdefault(approval_id, threading.Event())
        emit("approval.requested", {
            "approval_id": approval_id, "session_id": session_id,
            "turn_id": turn_id, "tool": "shell.exec",
            "capability": "shell.exec", "target": "echo hi", "risk": "low",
            "description": "fake approval", "choices": DECISIONS})
        decided = event.wait(timeout=30.0)
        with self.lock:
            decision = self.approved.get(approval_id + ":decision", "deny")
        if not decided:
            emit("approval.expired", {"approval_id": approval_id,
                                      "session_id": session_id})
            emit("turn.completed", {"turn_id": turn_id, "session_id": session_id,
                                   "kind": "done", "content": "denied by timeout"})
            return
        emit("approval.resolved", {"approval_id": approval_id,
                                   "session_id": session_id, "decision": decision})
        emit("turn.completed", {"turn_id": turn_id, "session_id": session_id,
                               "kind": "done", "content": f"went ahead ({decision})"})

    def _provider_view(self, record):
        view = dict(record)
        view["active"] = record["alias"] == self.active_provider
        return view

    def _model_view(self, model):
        view = dict(model)
        view["provider"] = self.providers.get(model["provider_id"], {}).get("alias")
        return view

    def _active_model_id(self):
        for model in self.models:
            if model.get("active"):
                return model["id"]
        return None

    def provider_list(self, req_id, _params):
        respond(req_id, result={
            "providers": [self._provider_view(r) for r in self.providers.values()],
            "active_alias": self.active_provider,
        })

    def provider_create(self, req_id, params):
        params = params or {}
        alias = params.get("alias") or ""
        provider_type = params.get("type") or ""
        if not alias or not provider_type:
            fail(req_id, "INVALID_PARAMS", "Param 'alias'/'type' must be non-empty.")
            return
        if alias in self.providers:
            fail(req_id, "CONFLICT", f"Provider alias already exists: {alias}.")
            return
        self.provider_seq += 1
        record = {
            "id": f"prov_fake{self.provider_seq}",
            "alias": alias,
            "type": provider_type,
            "auth_method": params.get("auth_method") or "api-key",
            "account_hint": params.get("account_hint"),
            "endpoint": params.get("endpoint"),
            "settings": params.get("settings") or {},
            "status_connected": None,
            "status_checked_at": None,
            "default_model_id": None,
            "last_used_model_id": None,
            "has_credential": bool(params.get("secret") or params.get("secret_env")),
        }
        self.providers[alias] = record
        if self.active_provider is None:
            self.active_provider = alias
        respond(req_id, result={"provider": self._provider_view(record)})

    def provider_get(self, req_id, params):
        record = self.providers.get((params or {}).get("ref", ""))
        if record is None:
            fail(req_id, "NOT_FOUND", "Provider not found.")
            return
        respond(req_id, result={"provider": self._provider_view(record)})

    def provider_update(self, req_id, params):
        params = params or {}
        record = self.providers.get(params.get("ref", ""))
        if record is None:
            fail(req_id, "NOT_FOUND", "Provider not found.")
            return
        changed = False
        if "alias" in params and params["alias"]:
            new_alias = params["alias"]
            if new_alias != record["alias"] and new_alias in self.providers:
                fail(req_id, "CONFLICT", "Alias already exists.")
                return
            del self.providers[record["alias"]]
            record["alias"] = new_alias
            self.providers[new_alias] = record
            if self.active_provider not in self.providers:
                self.active_provider = new_alias
            changed = True
        for key in ("endpoint", "account_hint", "settings"):
            if key in params:
                record[key] = params[key]
                changed = True
        if "secret" in params or "secret_env" in params:
            record["has_credential"] = True
            changed = True
        if not changed:
            fail(req_id, "INVALID_PARAMS", "Nothing to update.")
            return
        respond(req_id, result={"provider": self._provider_view(record)})

    def provider_remove(self, req_id, params):
        params = params or {}
        record = self.providers.get(params.get("ref", ""))
        if record is None:
            fail(req_id, "NOT_FOUND", "Provider not found.")
            return
        was_active = record["alias"] == self.active_provider
        switch_to = params.get("switch_to")
        if was_active and not switch_to:
            fail(req_id, "INVALID_USAGE", "Provider is active. Select another first.")
            return
        if was_active and switch_to not in self.providers:
            fail(req_id, "NOT_FOUND", "Switch target not found.")
            return
        del self.providers[record["alias"]]
        self.models = [m for m in self.models if m["provider_id"] != record["id"]]
        if was_active:
            self.active_provider = switch_to
        respond(req_id, result={"removed": {"id": record["id"], "alias": record["alias"]}})

    def provider_test(self, req_id, params):
        record = self.providers.get((params or {}).get("ref", ""))
        if record is None:
            fail(req_id, "NOT_FOUND", "Provider not found.")
            return
        record["status_connected"] = True
        respond(req_id, result={
            "connected": True,
            "detail": "2 model(s) discovered",
            "models_discovered": 2,
            "models": [
                {"provider_model_id": "mx-1", "capabilities": None, "availability": "available"},
                {"provider_model_id": "mx-2", "capabilities": None, "availability": "available"},
            ],
        })

    def provider_discover(self, req_id, _params):
        respond(req_id, result={"candidates": []})

    def provider_use(self, req_id, params):
        record = self.providers.get((params or {}).get("ref", ""))
        if record is None:
            fail(req_id, "NOT_FOUND", "Provider not found.")
            return
        self.active_provider = record["alias"]
        active_model = next((m for m in self.models if m.get("active")), None)
        respond(req_id, result={
            "provider": self._provider_view(record),
            "model": self._model_view(active_model) if active_model else None,
        })

    def model_list(self, req_id, params):
        alias = (params or {}).get("provider")
        models = self.models
        if alias:
            ids = {r["id"] for r in self.providers.values() if r["alias"] == alias}
            models = [m for m in models if m["provider_id"] in ids]
        respond(req_id, result={"models": [self._model_view(m) for m in models]})

    def model_get(self, req_id, params):
        params = params or {}
        model = next((m for m in self.models
                      if m["id"] == params.get("ref") or m["alias"] == params.get("ref")),
                     None)
        if model is None:
            fail(req_id, "NOT_FOUND", "Model not found.")
            return
        respond(req_id, result={"model": self._model_view(model)})

    def model_add(self, req_id, params):
        params = params or {}
        record = self.providers.get(params.get("provider", ""))
        if record is None:
            fail(req_id, "NOT_FOUND", "Provider not found.")
            return
        if not params.get("provider_model_id") or not params.get("alias"):
            fail(req_id, "INVALID_PARAMS", "Model id/alias must be non-empty.")
            return
        self.model_seq += 1
        model = {
            "id": f"mdl_fake{self.model_seq}",
            "alias": params["alias"],
            "provider_id": record["id"],
            "provider_model_id": params["provider_model_id"],
            "capabilities": params.get("capabilities"),
            "availability": "unknown",
            "settings": params.get("settings") or {},
            "active": self._active_model_id() is None,
        }
        self.models.append(model)
        respond(req_id, result={"model": self._model_view(model)})

    def model_alias(self, req_id, params):
        params = params or {}
        model = next((m for m in self.models
                      if m["id"] == params.get("ref") or m["alias"] == params.get("ref")),
                     None)
        if model is None:
            fail(req_id, "NOT_FOUND", "Model not found.")
            return
        if params.get("new_alias"):
            model["alias"] = params["new_alias"]
        respond(req_id, result={"model": self._model_view(model)})

    def model_remove(self, req_id, params):
        params = params or {}
        for i, model in enumerate(self.models):
            if model["id"] == params.get("ref") or model["alias"] == params.get("ref"):
                del self.models[i]
                respond(req_id, result={"removed": {"id": model["id"], "alias": model["alias"]}})
                return
        fail(req_id, "NOT_FOUND", "Model not found.")

    def model_use(self, req_id, params):
        params = params or {}
        model = next((m for m in self.models
                      if m["id"] == params.get("ref") or m["alias"] == params.get("ref")),
                     None)
        if model is None:
            fail(req_id, "NOT_FOUND", "Model not found.")
            return
        for m in self.models:
            m["active"] = m["id"] == model["id"]
        record = next(r for r in self.providers.values() if r["id"] == model["provider_id"])
        self.active_provider = record["alias"]
        respond(req_id, result={
            "model": self._model_view(model),
            "provider": self._provider_view(record),
            "switched_provider": True,
        })

    def model_discover(self, req_id, _params):
        respond(req_id, result={"providers": {"fake": [
            {"provider_model_id": "mx-1", "capabilities": None, "availability": "available"},
            {"provider_model_id": "mx-2", "capabilities": None, "availability": "available"},
        ]}})

    def model_refresh(self, req_id, _params):
        respond(req_id, result={"providers": {"fake": {
            "saved": len(self.models), "still_available": len(self.models),
            "marked_unavailable": 0, "discovered": 2, "error": None}}})

    def model_test(self, req_id, params):
        params = params or {}
        model = next((m for m in self.models
                      if m["id"] == params.get("ref") or m["alias"] == params.get("ref")),
                     None)
        if model is None:
            fail(req_id, "NOT_FOUND", "Model not found.")
            return
        respond(req_id, result={"ok": True, "detail": "present in catalog",
                               "model": self._model_view(model)})

    def dispatch(self, message):
        req_id = message.get("id")
        method = message.get("method", "")
        params = message.get("params") or {}
        handler = {
            "engine.info": self.engine_info,
            "session.list": self.session_list,
            "session.create": self.session_create,
            "session.open": self.session_open,
            "session.mode.set": self.session_mode_set,
            "session.model.set": self.session_model_set,
            "session.permission.get": self.session_permission_get,
            "session.permission.set": self.session_permission_set,
            "turn.changes.get": self.turn_changes_get,
            "turn.changes.review": self.turn_changes_review,
            "turn.changes.undo.preview": self.turn_changes_undo_preview,
            "turn.changes.undo": self.turn_changes_undo,
            "workspace.file.search": self.workspace_file_search,
            "task.tree": self.task_tree,
            "task.get": self.task_get,
            "verification.latest": self.verification_latest,
            "verification.plan": self.verification_plan,
            "checkpoint.list": self.checkpoint_list,
            "checkpoint.show": self.checkpoint_show,
            "checkpoint.restore": self.checkpoint_restore,
            "project.changes": self.project_changes,
            "project.diff": self.project_diff,
            "agent.list": self.agent_list,
            "agent.config.get": self.agent_config_get,
            "agent.config.set": self.agent_config_set,
            "session.events": self.session_events,
            "soul.list": self.soul_list,
            "soul.get": self.soul_get,
            "soul.create": self.soul_create,
            "soul.update": self.soul_update,
            "soul.remove": self.soul_remove,
            "soul.activate": self.soul_activate,
            "mcp.list": self.mcp_list,
            "mcp.get": self.mcp_list,
            "mcp.create": self.mcp_create,
            "mcp.remove": self.mcp_remove,
            "mcp.enable": self.mcp_enable,
            "mcp.disable": self.mcp_disable,
            "mcp.test": self.mcp_test,
            "plugin.list": self.plugin_list,
            "plugin.get": self.plugin_list,
            "plugin.enable": self.plugin_enable,
            "plugin.disable": self.plugin_disable,
            "plugin.diagnostics": self.plugin_diagnostics,
            "tool.list": self.tool_list,
            "policy.get": self.policy_get,
            "artifact.list": self.artifact_list,
            "artifact.read": self.artifact_read,
            "context.get": self.context_get,
            "usage.get": self.usage_get,
            "session.queue.add": self.queue_add,
            "session.queue.list": self.queue_list,
            "session.queue.clear": self.queue_clear,
            "profile_bundle.list": self.bundle_list,
            "profile_bundle.get": self.bundle_list,
            "profile_bundle.create": self.bundle_create,
            "profile_bundle.remove": self.bundle_remove,
            "profile_bundle.apply": self.bundle_apply,
            "session.history": self.session_history,
            "session.timeline": self.session_timeline,
            "session.turn.start": self.turn_start,
            "session.turn.cancel": self.turn_cancel,
            "approval.resolve": self.approval_resolve,
            "runtime.snapshot.get": self.snapshot_get,
            "provider.list": self.provider_list,
            "provider.create": self.provider_create,
            "provider.get": self.provider_get,
            "provider.update": self.provider_update,
            "provider.remove": self.provider_remove,
            "provider.test": self.provider_test,
            "provider.discover": self.provider_discover,
            "provider.use": self.provider_use,
            "model.list": self.model_list,
            "model.get": self.model_get,
            "model.add": self.model_add,
            "model.alias": self.model_alias,
            "model.remove": self.model_remove,
            "model.use": self.model_use,
            "model.discover": self.model_discover,
            "model.refresh": self.model_refresh,
            "model.test": self.model_test,
        }.get(method)
        if handler is None:
            fail(req_id, "UNKNOWN_METHOD", f"Unknown method: {method}.")
            return
        handler(req_id, params)


def main(argv):
    scenario = "stream"
    for arg in argv[1:]:
        if arg.startswith("--scenario="):
            scenario = arg.split("=", 1)[1]
    if scenario not in ("stream", "slow", "approval", "die", "legacy"):
        raise SystemExit(f"unknown scenario: {scenario}")
    if scenario == "legacy":
        CAPABILITIES.pop("interactive_questions_v1")
    hello = {
        "type": "hello", "protocol": "rinari-engine", "protocol_version": 1,
        "engine_version": "fake-1.0", "capabilities": CAPABILITIES}
    # The legacy scenario also predates home_id: the host must tolerate its absence.
    if scenario != "legacy":
        hello["home_id"] = "fakehome00000001"
    sys.stdout.write(json.dumps(hello) + "\n")
    sys.stdout.flush()
    engine = FakeEngine(scenario)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        engine.dispatch(message)


if __name__ == "__main__":
    main(sys.argv)
