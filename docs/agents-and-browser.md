# Agent activity and the engine browser

Agents inherit the spawning session's tool catalog and permission ceiling.
This includes dynamically registered SSH, MCP and plugin tools. A child never
gets a broader permission profile than its parent. Session grants are shared;
new consent requests appear in the parent conversation with the agent's name.
Cancelling a child invalidates its pending consent request.

Explicit restrictions remain available in trusted project agent definitions:

```markdown
---
name: reviewer
description: Inspect this repository
profile: read-only
tools:
  - fs.read
  - search.*
---
Review the requested changes and return findings.
```

Store this as `.rinari/agents/reviewer.md`. Omit `profile` and `tools` to inherit.
Role objectives, budgets, concurrency limits and cancellation still apply.
Parent-bound delegation and channel delivery closures are not copied to children.
Child processes and browser profiles have separate ownership and are closed when
the child finishes. This change does not enable recursive delegation.

In Code, expand **Ver actividad** on an agent card to inspect its objective,
effective permissions, working directory, commands, visible model messages and
result. Child activity is correlated and persisted under the parent turn and is
rebuilt when conversation history reloads. It is not private model reasoning.

The **Navegador** surface lives in the session dock (`SessionWorkspace`, shared
by Normal and board panes), never as a floating global panel. It shows periodic
captures of the exact CDP page the agent uses, supports choosing a page and can
be hidden with the dock; a newly connected engine browser is revealed only when
that session is focused and its dock is closed, otherwise the tab shows an
indicator. It is an observation surface labelled as a preview: manual
interaction is available through **Abrir fuera**. It does not run a duplicate
iframe page or expose host commands to web content. Polling runs at capture
cadence only while the surface is visible and at a low background cadence for
the indicator.

The browser survives individual turns and closes with the session or engine.
`browser.view.get` is read-only: polling never launches or navigates a browser.
Disconnected states and capture failures are shown without claiming success.
The HTML file preview remains a separate feature for manually playing a local
game inside Code.

New capabilities: `agent_inheritance_v1`, `agent_activity_v1`, `browser_view_v1`.
Update the packaged engine and restart `npm run desktop:dev` to load the new
Electron host command and protocol. No publication is implied by this step.

## Subagents vs. peers of a session

Subagents (`agent.spawn`) run inside the owner turn, inherit a narrowed
context and report back as evidence. **Peers** are other top-level sessions
on the same board: their messages arrive as separate turns marked
`origin.kind = "peer"`, never inherit anything from the sender and are
untrusted data for the receiver. A peer-originated turn cannot spawn
subagents either; the owner forwards the message as their own task when it
should become work. See `docs/interactive-workspace.md` › "Boards: mensajería
entre paneles".
