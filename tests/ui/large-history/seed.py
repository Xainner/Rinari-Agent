"""Seed a conversation of ~10 000 stored events for the `large-history` scenario.

Runs with the Engine's own Python before the app starts (plan 0.4.0 #91):

    uv run --project <Rinari-CLI> python seed.py <RINARI_HOME>

435 turns, each with ten commands (request and end) and its final answer:
23 events per turn. Outputs vary as in a real session, from a line to 20 000
characters (the page carries 4 000 of each; the rest is «Ver completo»). The user and assistant
messages go to the history too, as a real turn leaves them.
"""

from __future__ import annotations

import sys
from pathlib import Path

from rinari.application.context import build_app_context
from rinari.application.provider_service import AddProviderInput
from rinari.application.services import build_services
from rinari.storage.records import SessionEventRecord, SessionMessageRecord

TURNS = 435
TOOLS_PER_TURN = 10
#: Characters of output of each command of a turn: mostly short, two long.
OUTPUT_SIZES = (120, 300, 800, 2_500, 120, 400, 6_000, 150, 900, 20_000)


def main(home: Path) -> None:
    ctx = build_app_context(home)
    services = build_services(ctx, user_home=home.parent)
    services.providers.add(
        AddProviderInput(
            alias="semilla",
            provider_type="custom",
            auth_method="none",
            endpoint="http://127.0.0.1:9/v1",
        )
    )
    services.models.add("semilla", "semilla", "semilla")
    services.providers.use("semilla")
    workspace = home / "workspaces" / "grande"
    workspace.mkdir(parents=True, exist_ok=True)
    record = services.sessions.new(workspace, title="Grande", forced_chat=True, mode="build")
    events: list[SessionEventRecord] = []
    messages: list[SessionMessageRecord] = []
    seq = 0
    for turn in range(TURNS):
        turn_id = f"turn-grande-{turn:04d}"
        at = f"2026-10-17T10:{turn // 60 % 60:02d}:{turn % 60:02d}Z"
        rows = [("turn.started", {"message": f"Pregunta {turn + 1}", "mode": "build"})]
        for index in range(TOOLS_PER_TURN):
            call = f"call-{turn}-{index}"
            rows.append(
                (
                    "tool.requested",
                    {"tool_call_id": call, "tool": "shell.exec", "arguments": '{"argv": ["build"]}'},
                )
            )
            rows.append(
                (
                    "tool.completed",
                    {
                        "tool_call_id": call,
                        "tool": "shell.exec",
                        "ok": True,
                        "duration_ms": 120,
                        "observation": "o" * OUTPUT_SIZES[index],
                        "presentation": {
                            "kind": "command",
                            "command": "build",
                            "exit_code": 0,
                            "status": "success",
                            "stdout": f"paso {index}\n" + "x" * OUTPUT_SIZES[index],
                        },
                    },
                )
            )
        rows.append(
            (
                "model.content.completed",
                {"content": f"Respuesta {turn + 1}", "output_kind": "final", "model_call_id": f"m-{turn}"},
            )
        )
        rows.append(("turn.completed", {"occurred_at": at}))
        for activity, (kind, payload) in enumerate(rows):
            seq += 1
            events.append(
                SessionEventRecord(
                    id=f"evt-grande-{seq}",
                    session_id=record.id,
                    seq=seq + 10,
                    type=kind,
                    payload={**payload, "turn_id": turn_id, "session_id": record.id},
                    created_at=at,
                    turn_id=turn_id,
                    activity_seq=activity + 1,
                )
            )
        for role, content in (("user", f"Pregunta {turn + 1}"), ("assistant", f"Respuesta {turn + 1}")):
            messages.append(
                SessionMessageRecord(
                    id=f"msg-grande-{turn}-{role}",
                    session_id=record.id,
                    seq=len(messages) + 1,
                    role=role,
                    content=content,
                    created_at=at,
                    turn_id=turn_id,
                )
            )
    with ctx.db.transaction():
        for event in events:
            ctx.event_repo.insert(event)
    ctx.message_repo.append_many(record.id, messages)
    print(f"seeded {record.id} {len(events)} events {len(messages)} messages")
    ctx.close()


if __name__ == "__main__":
    main(Path(sys.argv[1]))
