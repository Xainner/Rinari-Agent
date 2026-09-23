"""Seed isolated provenance; then serve the real CLI Engine over real stdio.

Requires the M03 CLI environment. No provider call is made by this fixture.
"""
import hashlib
import os
from pathlib import Path

from rinari.application.context import build_app_context
from rinari.application.provider_service import AddProviderInput
from rinari.application.services import build_services
from rinari.engine_protocol.server import EngineServer
from rinari.engine_protocol.transports.stdio import run_stdio
from rinari.storage.records import SessionRecord

root = Path(os.environ["M03_PROFILE"])
workspace = root / "workspace"
workspace.mkdir()
target = root / "external" / "preview.md"
target.parent.mkdir()
target.write_text("# External version one\n", encoding="utf-8")
os.environ["RINARI_KEYRING"] = "0"
ctx = build_app_context(home=root / "engine-home")
services = build_services(ctx, user_home=root / "user-home")
provider = services.providers.add(AddProviderInput(
    alias="fixture", provider_type="openai", endpoint="http://127.0.0.1:9/v1",
    secret="fixture-not-a-credential",
))
model = services.models.add("fixture", "fixture", "fixture")
now = "2026-01-01T00:00:00Z"
ctx.session_repo.insert(SessionRecord(
    id="ses_primary", kind="CHAT", title="File fixture", project_id=None,
    project_root_snapshot=None, created_cwd=str(workspace), current_cwd=str(workspace),
    provider_id=provider.id, model_id=model.id, profile_id="default", mode="build",
    state="active", compact_state=None, created_at=now, updated_at=now,
    last_active_at=now, permission_profile="workspace",
))
ctx.turn_change_repo.insert({
    "id": "chg_fixture", "turn_id": "turn_fixture", "session_id": "ses_primary",
    "project_id": None, "roots": [], "created_at": now, "completed_at": now,
    "additions": 1, "deletions": 0, "undoable": False,
    "attribution_complete": False, "warnings": [], "status": "completed",
}, [{
    "path": str(target), "absolute_path": str(target.resolve()), "previous_path": None,
    "kind": "created", "additions": 1, "deletions": 0, "before_exists": False,
    "after_exists": True, "before_hash": None,
    "after_hash": hashlib.sha256(target.read_bytes()).hexdigest(),
    "before_size": None, "after_size": target.stat().st_size,
    "ownership": "agent", "confidence": "exact", "binary": False, "sensitive": False,
    "diff": None, "diff_truncated": False, "undoable": False,
    "conflict_reason": None, "before_blob_ref": None,
}])
server = EngineServer(services, user_home=root / "user-home")
try:
    run_stdio(server)
finally:
    server.close()
    ctx.close()
