# Narrative activity timeline

Rinari Agent presents observable work as a chronological narrative attached to each turn. It never presents provider-private reasoning, scratchpads, hidden prompts, credentials, or raw policy internals.

| Event family | Default view | Technical names enabled | Notes |
| --- | --- | --- | --- |
| `model.content.completed` (`progress`) | Visible prose | Same | Normal provider-visible content before an action. |
| `model.content.completed` (`final`) | Normal assistant response | Same | Rendered with the standard Markdown message renderer. |
| `model.started`, deltas, `model.completed` | Waiting/stream state only | Same | Token deltas are not separate rows or aria announcements. |
| `usage.updated` | Compact turn token counter | Same | Aggregate metadata, not an activity row. Estimates and mixed totals use `~`; reconciliation may decrease the value. |
| `tool.*` | Semantic narrative label | Adds the protocol tool name | Arguments and sanitized results stay collapsed. |
| `approval.*` | Inline controls/state | Same | One logical row evolves through request, resolution, or expiry. |
| `agent.*` | Visible lifecycle milestone | Same | Start and terminal phases remain separate chronological events. |
| `governor.compact` | Visible context milestone | Same | Internal governor telemetry stays hidden. |
| `verification.*` | Visible verification milestone | Same | Success and failure use restrained status color. |
| `turn.preparing`, routine governor telemetry | Hidden | Hidden | Used only to drive state and recovery. |
| turn failure/cancellation/stop | Visible terminal state | Same | A compact summary appears for exceptional endings. |

The desktop consumes `session.timeline`, `runtime.snapshot.get`, and live events through one reducer. Stable protocol identifiers reconcile the same logical item, so reconnecting or opening history cannot create duplicate rows.

Turn usage adds input and output exactly once across calls. Cached input and reasoning
are subsets, displayed only in the breakdown. No prices or billing estimates are shown.
The counter remains in terminal metadata, including short and cancelled turns. Usage
revisions deduplicate snapshots, history and live events; content deltas still do not
create rows or announcements. Session totals (`usage.get`) remain independent.
An Engine without `turn_token_usage_v1` falls back to `model.completed.usage`,
deduplicated per agent and model call. The full breakdown is visually hidden text
next to the compact number, outside any live region.
