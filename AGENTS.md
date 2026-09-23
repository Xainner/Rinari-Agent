# Rinari Agent — Master Implementation Work Plan

> **Estado actual (entrega H, 2026-09-20):** el runtime de producto es
> exclusivamente Electron. Las secciones históricas que describen Tauri sirven
> como contexto del diseño original y no autorizan reintroducir `src-tauri`,
> `@tauri-apps/*` ni un segundo adaptador activo. El bootstrapper personalizado
> de `installer/setup` es una herramienta de distribución aislada y no es el
> host de Rinari Agent. Desarrollo, pruebas y empaquetado de la aplicación usan
> los scripts `desktop:*`, `package:*` y el contrato de `src/platform/electron.ts`.

> **Comandos e intenciones (regla vigente, 2026-09-23).** El renderer habla con
> el host por dos vías, y cada capacidad nueva elige una:
>
> - **Llamada al Engine** (sesiones, proveedores, flujos, tareas…): una fila en
>   `docs/migration/desktop-command-contract.json`, el inventario vigente de
>   comandos, y la llamada con `platform().command()`. `npm run
>   parity:inventory` regenera la allowlist y la traducción; `parity:check`
>   falla ante una llamada desconocida, un comando duplicado, una clave ajena al
>   inventario o un adaptador manual ausente, y `commandMap.test.ts` exige que
>   el método exista en el protocolo del Engine fijado. El inventario **ya no es
>   la captura de Tauri 0.1.3**: sus filas iniciales vinieron de ahí, y la foto
>   original está en el commit de `origin.introduced_in`.
> - **El host hace algo propio** (ventanas, diálogos, navegador nativo,
>   notificaciones, integración con el sistema): una intención estrecha en
>   `src/platform`, con canal propio, validación en main y test bridge.
>
> Una fila nueva lleva `command`, `module`, `args` (nombre y `optional` de cada
> parámetro del renderer), `engine_method`, `engine_params` (`key` del Engine ←
> `from` del renderer), `manual` (si es `true`, con adaptador en
> `electron/main/engine/commandAdapters.ts`), `passthrough` y `host_effects`.
> `args[].type` y `returns` son informativos, heredados de la captura. Todo va
> en `commands`: no hay listas paralelas.
>
> main valida el nombre del comando y la forma de sus parámetros; los campos
> los valida el Engine. Validarlos campo a campo en main requiere que el schema
> del Engine declare los parámetros de cada método, y es el paso siguiente.

> **Status:** Implementation blueprint / source of truth for Rinari Agent v1
> **Date:** 2026-09-08  
> **Rinari-CLI baseline:** `Xainner/Rinari-CLI` @ `110ad4ee55dbea1f5bd1565b35af4b65f049dfd2`  \
> **Luma UI baseline:** `Xainner/Luma` @ `6c58af5392abe8ebe9f703653b1b094d7353fdbd`  
> **Desktop stack guide:** `AGENTS_Tauri_Rust_Master_Expanded.md`  
> **Primary goal:** Build a polished native-feeling desktop client for the existing Rinari harness without duplicating or rewriting the agent runtime.

---

## 0. Executive decision

Rinari Agent is **not** a new agent implementation and **not** a rewrite of Rinari-CLI in Rust.

The product architecture is:

```text
Rinari Engine    → intelligence / harness / state / execution
Rinari CLI       → terminal client
Rinari Agent      → desktop client
```

The same engine must own:

- sessions;
- CHAT / PROJECT promotion;
- model/provider routing;
- tools and ToolRuntime;
- policy and approvals;
- budgets;
- context and compaction;
- memory;
- skills;
- agents and subagents;
- MCP;
- plugins;
- OpenAPI;
- browser;
- Git state;
- checkpoints;
- tasks;
- verification;
- artifacts;
- repository index;
- LSP/AST/search;
- persistent operational state.

Rinari Agent owns the **desktop experience**, native integration and presentation of engine state.

The foundational rule is:

```text
DO NOT IMPLEMENT THE RINARI HARNESS TWICE.
```

If a capability exists in Rinari-CLI, Rinari Agent must consume it through the engine contract rather than recreate its business logic in React or Rust.

---

# 1. Product vision

Rinari Agent should feel like an **agent workspace**, not merely a chat application embedded in Tauri.

The center of the product remains the conversation with Rinari, but the desktop surface makes the harness visible and controllable:

- chat;
- projects;
- modes: PLAN / BUILD / REVIEW;
- providers and models;
- per-agent model assignment;
- Soul/personality;
- tool activity;
- approvals;
- changed files and diffs;
- tasks;
- verification;
- subagents;
- artifacts;
- terminal;
- browser activity;
- MCP/plugins;
- context;
- budgets;
- usage;
- checkpoints;
- session history.

Target feeling:

```text
Linear / Raycast polish
+
Luma visual identity
+
agent-centric IDE information density
+
Rinari personality
```

Do **not** try to become a full VS Code replacement in v1.

Rinari Agent wins because it is the best interface to **Rinari**, not because it ships another general-purpose editor.

---

# 2. Non-goals for v1

Do not add the following unless a concrete requirement later justifies them:

- Monaco as a full editor workspace;
- a VS Code extension host;
- a Node backend;
- Fastify inside the desktop application;
- PostgreSQL;
- a second chat/session database;
- Redux;
- GraphQL;
- a second provider runtime;
- a second agent framework;
- a second policy engine;
- a second PTY backend;
- a second artifact store;
- a second Git ownership model;
- duplicated provider credentials in a Tauri-only database;
- arbitrary shell access directly from React;
- direct writes from React to Rinari's SQLite database.

---

# 3. Source baselines and deliberate changes

## 3.1 Rinari-CLI baseline

The selected baseline already contains the major harness hardening work needed for a desktop client, including:

- authoritative budgets;
- dynamic Tool Exposure;
- structured ToolResult envelopes;
- provider runtime v2;
- OpenAI Responses transport;
- MCP structured output;
- cancellation improvements;
- hierarchical budget accounting;
- E2E/CI release gates;
- session persistence;
- RuntimeSnapshot/rendering infrastructure;
- approvals;
- tools/skills/MCP/plugins/browser/multi-agent;
- task graph;
- verification;
- checkpoints;
- artifacts;
- context/compaction.

Rinari Agent should therefore expose the existing engine rather than rebuild those systems.

## 3.2 Luma baseline

Reuse Luma primarily as a frontend/design-system donor.

High-value reusable areas include:

```text
web/src/index.css
web/src/components/app-shell/
web/src/components/chat/
web/src/components/composer/
web/src/components/settings/
web/src/components/ui/
web/src/components/Markdown.tsx
web/src/components/MathMarkdown.tsx
web/src/components/CommandPalette.tsx
web/src/stores/ui.ts
web/src/stores/composer.ts
web/src/lib/theme.ts
web/src/lib/appearance.ts
web/src/i18n/
```

Do not migrate as product architecture:

```text
server/
Fastify API
PostgreSQL support
Luma JWT/login lifecycle
/api/chat
/api/chats CRUD
/api/config ownership
localStorage authentication token
Luma server-side provider proxy
```

## 3.3 Soul baseline — deliberate versioned change

The current Rinari Soul 2.0 is intentionally restrained:

- dry humor;
- limited personality expression;
- no kaomoji;
- no Japanese words;
- no possessiveness;
- no exclusivity;
- personality always below truth/correctness.

The desired Rinari Agent product direction intentionally changes part of that identity toward an anime-inspired, playful, teasing and mock-jealous Rinari.

This must be handled as a **versioned Soul evolution**, not as UI prompt injection.

Target:

```text
Soul 2.x   current canonical identity
Soul 3.0   new customizable Soul system + new default Rinari persona
```

Keep the following invariants from Soul 2.0:

- Rinari knows she is an AI;
- truth beats personality;
- verification status cannot be distorted;
- safety/policy is code-enforced outside Soul;
- no manipulation or guilt;
- no claims of unexecuted work;
- no fake human status;
- no personality override of permissions/security.

The new default may be mock-jealous or tsundere-like as roleplay flavor, but must not pressure the user into exclusivity or emotional dependence.

---

# 4. Repository strategy

## 4.1 Recommended repositories

Maintain two repositories:

```text
Rinari-CLI
└── engine + CLI + shared state

Rinari-Agent
└── Tauri + Rust host + React desktop UI
```

Do not copy the Python engine into Rinari-Agent.

Do not create a monorepo solely for Rinari Agent v1.

## 4.2 Cross-repository contract

Rinari-CLI owns a versioned **Engine Protocol**.

Rinari-Agent depends only on the public protocol, not internal Python imports.

This allows:

- CLI and Code to evolve independently;
- an engine upgrade without rebuilding every React feature;
- protocol compatibility checks;
- hermetic testing with a fake engine;
- future web/mobile clients if desired.

---

# 5. Target architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│                          RINARI CODE                               │
│                                                                    │
│  React 19 + TypeScript + Vite + Tailwind 4                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Chat / Projects / Changes / Tasks / Agents / Settings       │  │
│  │ Approvals / Verification / Artifacts / Terminal / Activity  │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
│                                 │ typed Tauri commands/channels    │
│  ┌──────────────────────────────▼───────────────────────────────┐  │
│  │ Rust / Tauri 2                                               │  │
│  │ EngineSupervisor                                             │  │
│  │ Protocol transport                                           │  │
│  │ Native dialogs / window / updater / OS integration          │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────┼──────────────────────────────────┘
                                  │ stdin/stdout NDJSON
                                  │ versioned Engine Protocol
                       ┌──────────▼──────────┐
                       │    Rinari Engine    │
                       │       Python        │
                       │                     │
                       │ Session Runtime     │
                       │ AgentLoop           │
                       │ ToolRuntime         │
                       │ Providers           │
                       │ Agents              │
                       │ MCP / Plugins       │
                       │ Browser             │
                       │ Tasks / Verify      │
                       │ Context / Memory    │
                       │ Artifacts / Git     │
                       └─────────────────────┘
```

---

# 6. Rinari Engine Protocol v1

This is the first implementation milestone and the most important architectural contract.

## 6.1 Command

Add a long-lived machine transport, for example:

```bash
rinari engine --stdio
```

The exact command name may differ, but the semantics must be stable.

Do not parse Rich/plain CLI output.

Do not launch one `rinari` process per tool action.

One Rinari Agent window should normally supervise one persistent engine process that can service multiple sessions.

## 6.2 Transport

Use:

```text
stdin  → NDJSON requests
stdout → NDJSON responses/events
stderr → engine diagnostics/log stream only
```

Rules:

- one JSON object per line;
- stdout is protocol-only;
- no banners on protocol stdout;
- no ANSI formatting on protocol stdout;
- every request has an ID;
- every response references a request ID;
- asynchronous events have session/turn identifiers;
- unknown fields must be ignored when safe;
- protocol version must be negotiated on startup.

## 6.3 Handshake

Example:

```json
{
  "type": "hello",
  "protocol": "rinari-engine",
  "protocol_version": 1,
  "engine_version": "0.x.y",
  "capabilities": {
    "chat": true,
    "projects": true,
    "browser": true,
    "mcp": true,
    "plugins": true,
    "subagents": true,
    "artifacts": true,
    "checkpoints": true,
    "terminal": true
  }
}
```

Rinari Agent must refuse incompatible major protocol versions with a useful upgrade message.

## 6.4 Request envelope

```json
{
  "id": "req_123",
  "method": "session.turn.start",
  "params": {}
}
```

## 6.5 Response envelope

Success:

```json
{
  "id": "req_123",
  "ok": true,
  "result": {}
}
```

Failure:

```json
{
  "id": "req_123",
  "ok": false,
  "error": {
    "code": "...",
    "message": "...",
    "retryable": false,
    "details": {}
  }
}
```

## 6.6 Core event families

Implement a stable event taxonomy.

### Lifecycle

```text
engine.ready
engine.degraded
engine.shutdown
session.opened
session.closed
session.promoted
turn.started
turn.completed
turn.failed
turn.cancelled
```

### Model

```text
model.started
model.content.delta
model.content.completed
model.usage.updated
model.completed
model.failed
```

Do not expose provider-private chain-of-thought as generic UI telemetry.

### Tools

```text
tool.requested
tool.started
tool.output.delta
tool.completed
tool.failed
```

### Approvals

```text
approval.requested
approval.resolved
approval.expired
```

### Files / Git

```text
workspace.changed
file.changed
git.status.updated
checkpoint.created
checkpoint.restored
```

### Tasks / verification

```text
task.created
task.updated
task.completed
verification.started
verification.updated
verification.completed
completion_gate.updated
```

### Agents

```text
agent.spawned
agent.started
agent.activity
agent.completed
agent.failed
```

### Context / budget

```text
context.updated
context.compacted
budget.updated
```

### Artifacts

```text
artifact.created
artifact.updated
artifact.removed
```

### Browser / processes

```text
browser.updated
process.started
process.output
process.exited
pty.output
```

## 6.7 RuntimeSnapshot

Rinari Engine should expose a full snapshot that can reconstruct the desktop UI after:

- app startup;
- app reload;
- engine restart;
- window recreation;
- reconnect;
- transient event loss.

The UI must not depend on having observed every prior event.

Suggested method:

```text
runtime.snapshot.get
```

Snapshot should include stable, presentation-safe state only.

## 6.8 Cancellation

Desktop stop action:

```text
session.turn.cancel
```

must reach Rinari's existing cancellation token and cancel the live provider stream/tool operation as supported by the engine.

The UI must distinguish:

```text
Cancel requested
Cancelled
Could not cancel yet
```

## 6.9 Approvals

Approval request event includes:

- request ID;
- session ID;
- tool/action;
- risk;
- proposed side effect;
- cwd/resource;
- affected paths where known;
- explanation;
- supported decisions.

Desktop resolves with:

```text
approval.resolve
```

Supported choices should map to engine policy, e.g.:

```text
deny
allow_once
allow_session
```

Do not invent desktop-only authorization semantics.

## 6.10 Artifacts

Large outputs must remain in Rinari Artifact Store.

Protocol sends:

```text
artifact://<session>/<namespace>/<name>
```

rather than megabytes of JSON through Tauri.

## 6.11 Protocol tests

Required before UI depends on v1:

- handshake;
- incompatible protocol;
- request success/failure;
- event ordering;
- streaming content;
- tool streaming;
- approvals;
- cancellation;
- session resume;
- engine restart + snapshot reconstruction;
- malformed input;
- unknown method;
- duplicate request ID;
- broken stdout frame;
- large artifact URI flow;
- crash during turn;
- reconnect after crash.

---

# 7. Rinari-CLI / Engine work

Create a dedicated engine transport layer rather than bloating Typer command handlers.

Suggested structure:

```text
src/rinari/engine_protocol/
├── __init__.py
├── protocol.py
├── messages.py
├── errors.py
├── dispatcher.py
├── server.py
├── events.py
├── snapshots.py
└── transports/
    └── stdio.py
```

Potential shared application boundary:

```text
src/rinari/application/
├── engine_service.py
└── ... existing services
```

CLI command:

```text
src/rinari/cli/commands/engine.py
```

Do not import desktop concepts into AgentLoop.

The protocol adapter consumes existing services/events and translates them to stable external messages.

## 7.1 Required public methods

At minimum:

```text
engine.info
runtime.snapshot.get

session.list
session.get
session.create
session.open
session.close
session.resume
session.turn.start
session.turn.cancel
session.mode.set

project.list_recent
project.open
project.status

provider.list
provider.get
provider.create
provider.update
provider.remove
provider.test
provider.discover_models
provider.use

model.list
model.get
model.use
model.capabilities

agent.list
agent.config.get
agent.config.set

soul.list
soul.get
soul.create
soul.update
soul.remove
soul.activate
soul.preview

tool.list
policy.get
policy.update
approval.resolve

mcp.list
mcp.get
mcp.create
mcp.update
mcp.remove
mcp.test

plugin.list
plugin.get
plugin.enable
plugin.disable
plugin.diagnostics

artifact.list
artifact.get
artifact.read
artifact.export

checkpoint.list
checkpoint.create
checkpoint.preview
checkpoint.restore

task.list
task.get

verification.get
verification.run

context.get
budget.get
usage.get

process.list
pty.start
pty.write
pty.resize
pty.terminate
```

Names can be adjusted, but the capability surface must be explicit and versioned.

---

# 8. Rinari Agent repository structure

Recommended initial structure:

```text
Rinari-Agent/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.ts
│   │   └── providers.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── common/
│   ├── features/
│   │   ├── chat/
│   │   ├── projects/
│   │   ├── providers/
│   │   ├── models/
│   │   ├── agents/
│   │   ├── souls/
│   │   ├── activity/
│   │   ├── approvals/
│   │   ├── changes/
│   │   ├── tasks/
│   │   ├── verification/
│   │   ├── terminal/
│   │   ├── artifacts/
│   │   ├── context/
│   │   ├── mcp/
│   │   ├── plugins/
│   │   ├── browser/
│   │   └── settings/
│   ├── hooks/
│   ├── stores/
│   ├── services/
│   ├── lib/
│   ├── types/
│   ├── config/
│   └── styles/
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/
│   │   ├── engine/
│   │   │   ├── mod.rs
│   │   │   ├── supervisor.rs
│   │   │   ├── transport.rs
│   │   │   ├── protocol.rs
│   │   │   └── events.rs
│   │   ├── services/
│   │   ├── errors.rs
│   │   └── config.rs
│   ├── capabilities/
│   ├── icons/
│   ├── binaries/
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── tests/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── AGENTS.md
└── README.md
```

Do not put engine business logic inside Tauri commands.

Preferred Rust path:

```text
Tauri command
    ↓
Desktop service
    ↓
EngineSupervisor
    ↓
Engine Protocol
```

## Toolchain baseline

Node **>= 22.12** (Electron 44 requires it) and npm **10**, as declared in
`engines` and used by CI.

The lock file must be written by npm 10. npm 11 resolves the bundled
`@emnapi/*` dependencies of `@tailwindcss/oxide-wasm32-wasi` differently and
produces a lock that `npm ci` rejects on the runner — the failure surfaces only
in CI, where every other gate then never runs. If your npm is newer:

```bash
npx --yes npm@10 install --package-lock-only
```

## Platform adapter: do not import the host directly

The renderer reaches the host only through `src/platform` (`platform()`), never
through `@tauri-apps/*` — and, once the Electron host lands, never through
`ipcRenderer` either. `src/platform/tauri.ts` is the single exception and is
deleted when Tauri goes away.

```text
component / service
    ↓
platform()            src/platform/contract.ts
    ↓
tauri.ts | electron.ts | testBridge.ts
```

`npm run parity:check` fails if a component or service imports the host, and
regenerates `docs/migration/desktop-parity.md` from the code: adding a
`#[tauri::command]` without running `npm run parity:inventory` breaks CI. The
contract exposes intent (`window.clampToWorkArea()`), not host primitives, so
the Electron implementation is a new file rather than another refactor of the
consumers.

Tests use `createTestBridge()` instead of mocking the host.

---

# 9. Desktop stack

Use the uploaded Tauri/Rust guide as the preferred toolbox, not as a mandatory dependency dump.

## 9.1 Core

```text
Tauri 2
Rust
React 19
TypeScript
Vite
Tailwind CSS 4
```

## 9.2 Keep/reuse from Luma

```text
Radix UI primitives
Lucide React
Motion / framer-motion migration as appropriate
Zustand
Sonner
cmdk
Virtua
Shiki
react-markdown
remark-gfm
remark-math
rehype-katex
KaTeX
```

Do not replace working Luma primitives merely to match a preference list.

## 9.3 Add for Rinari Agent

### High priority

```text
@tanstack/react-query
react-diff-view
@xterm/xterm
@xterm/addon-fit
zod
react-hook-form
specta
tauri-specta
```

Nota (2026-09-15): `react-resizable-panels` se descartó para Boards. Esa
librería reparte porcentajes en un contenedor fijo; el board necesita N
columnas en píxeles con scroll horizontal, así que el resizer es propio
(`useDragResize` + `ResizeHandle`, extraído del visor de archivos).

### Useful when feature lands

```text
@xterm/addon-search
@xterm/addon-web-links
@xyflow/react
```

### Testing

```text
vitest
@testing-library/react
@testing-library/user-event
```

Do not add React Flow until graph visualization is implemented.

## 9.4 State ownership

Use:

```text
TanStack Query
→ external/engine state
```

Examples:

- sessions;
- providers;
- models;
- agents;
- souls;
- MCP;
- plugins;
- artifacts;
- project status;
- verification.

Use:

```text
Zustand
→ local UI state
```

Examples:

- sidebar state;
- selected pane;
- panel visibility;
- composer draft;
- local tabs;
- command palette;
- layout preferences.

Do not mirror the entire engine database into Zustand.

---

# 10. Rust/Tauri responsibilities

Rust owns desktop-native responsibilities:

- engine process lifecycle;
- sidecar discovery/start/stop/restart;
- protocol framing/parsing;
- typed Tauri bridge;
- native dialogs;
- window lifecycle;
- single-instance handling;
- updater;
- desktop notifications;
- deep links/file associations;
- app paths;
- OS integration;
- safe opener integration;
- desktop logging;
- desktop-only preferences where appropriate.

Rust does **not** own:

- provider routing rules;
- AgentLoop;
- Rinari sessions;
- ToolRuntime;
- MCP semantics;
- plugin execution;
- browser agent logic;
- verification policy;
- task graph semantics;
- Git ownership;
- context compaction;
- engine memory.

---

# 11. EngineSupervisor

Implement as a focused Rust service.

Responsibilities:

```text
locate engine
validate version
spawn engine
perform handshake
route requests
route events
track pending requests
close cleanly
restart after crash when safe
reconnect UI via snapshot
expose health
```

State machine:

```text
Stopped
Starting
Handshaking
Ready
Degraded
Restarting
Failed
```

UI should surface engine status unobtrusively.

Example:

```text
Rinari Engine ● Ready
```

or:

```text
Rinari Engine ⚠ Restarting
```

Never silently switch to a fake/local alternate engine implementation.

---

# 12. Luma UI migration plan

## 12.1 Extract, do not fork blindly

Create Rinari Agent's frontend from Luma's visual system and selected components.

Rename semantic identity from Luma to Rinari while preserving the successful visual language.

## 12.2 Reuse nearly directly

- design tokens from `index.css`;
- dark/light/accent system;
- typography strategy;
- subtle nebula background;
- grain/noise treatment;
- AppShell concept;
- sidebar collapse behavior;
- chat message rendering;
- Markdown/Shiki rendering;
- composer visual design;
- model picker visual patterns;
- reasoning/activity panel visual patterns;
- command palette;
- settings visual primitives;
- Sonner integration;
- Virtua message virtualization;
- responsive/reduced-motion patterns.

## 12.3 Replace

Replace:

```text
Luma Login
→ no login
```

Replace:

```text
Luma onboarding
→ Rinari first-run provider + engine onboarding
```

Replace:

```text
lib/api.ts HTTP calls
→ typed Tauri desktop service
```

Replace:

```text
Luma chat CRUD
→ engine sessions
```

Replace:

```text
Luma profile concept
→ Rinari Profiles + Souls
```

Replace:

```text
Luma reasoning UI
→ Rinari Activity / agent execution UI
```

## 12.4 Refactor App.tsx

Do not carry Luma's large orchestration-heavy `App.tsx` into Rinari Agent.

Split by feature/service from the beginning.

---

# 13. Main desktop information architecture

## 13.1 Start screen

```text
RINARI CODE

Recent Projects
┌─────────────────────────────┐
│ Rinari CLI                  │
│ ~/Projects/Rinari-CLI       │
│ main · 3 modified           │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Luma                        │
│ ~/Projects/Luma             │
│ main · clean                │
└─────────────────────────────┘

+ Open Folder
+ Clone Repository   [later if needed]
+ New Chat
```

No login wall.

## 13.2 Workspace shell

```text
┌──────────────────────────────────────────────────────────────────────┐
│ titlebar / project / branch / model / mode / engine status          │
├────────────┬─────────────────────────────────┬───────────────────────┤
│ Sidebar    │ Main conversation               │ Inspector             │
│            │                                 │ Changes               │
│ Projects   │                                 │ Tasks                 │
│ Sessions   │                                 │ Verification          │
│            │                                 │ Agents                │
│            │                                 │ Context               │
├────────────┴─────────────────────────────────┴───────────────────────┤
│ Terminal | Tests | Problems | Output | Trace                         │
└──────────────────────────────────────────────────────────────────────┘
```

Use resizable panels.

Persist panel sizes.

## 13.3 Main sidebar

```text
RINARI

+ New Chat

WORKSPACE
  Rinari CLI

SESSIONS
  Provider settings
  Fix MCP bug
  Review architecture

PROJECT
  Chat
  Changes 3
  Tasks 6
  Agents 2
  Artifacts 4

────────────
Model: Main Coding
Mode: BUILD
Context: 42%

Settings
```

---

# 14. First-run onboarding — no login

Rinari Agent does not need Luma-style application login.

First run should answer only what is necessary to make the engine usable.

Suggested wizard:

## Step 1 — Welcome

```text
Welcome to Rinari Agent
```

Detect:

- bundled engine available;
- external compatible Rinari installation;
- engine version;
- current Rinari home/config.

## Step 2 — Provider

Options:

```text
OpenAI
Anthropic
Google Gemini
OpenRouter
Ollama
LM Studio
OpenAI-compatible
Custom
Skip for now
```

## Step 3 — Authentication/connection

Provider-specific fields.

## Step 4 — Discover models

Test connection and discover models.

## Step 5 — Default model

Select user-friendly default.

## Step 6 — Rinari Soul

Default:

```text
Rinari — Default
```

with ability to change later.

## Step 7 — Done

Offer:

```text
Open project
Start chat
```

---

# 15. Providers & Models settings

This is a first-class product surface.

## 15.1 Navigation

```text
Settings
├── General
├── Appearance
├── Providers & Models
├── Agents
├── Rinari / Soul
├── Tools & Permissions
├── MCP
├── Plugins
├── Browser
├── Projects
├── Memory & Context
├── Terminal
├── Advanced
└── About
```

## 15.2 Provider cards

```text
OpenAI                              ● Healthy
API key configured
21 models available
Default: Main Coding

[ Configure ]
```

Display:

- provider name;
- type;
- connection state;
- auth configured/not configured;
- base URL where relevant;
- model count;
- selected model;
- health state.

## 15.3 Add provider presets

Built-in setup templates:

```text
OpenAI
Anthropic
Gemini
OpenRouter
Ollama
LM Studio
OpenAI-compatible
Custom
```

Do not hard-code actual provider capability assumptions solely in React; query engine model/provider capabilities.

## 15.4 Custom provider

UI:

```text
Name
Protocol
Base URL
Authentication method
API key/credential
Custom headers
Transport
Timeout
Model discovery
Capability overrides [Advanced]
```

Support provider test before saving.

## 15.5 Provider health

Provide:

```text
Auth       Valid
Endpoint   Reachable
Streaming  Supported
Tools      Supported
Vision     Supported
Models     14
Latency    620 ms
```

Only display facts actually known by the engine.

## 15.6 Model catalog

Models should be inspectable entities, not merely strings in a dropdown.

Example:

```text
Main Coding
OpenAI / model-id
Tools ✓
Vision ✓
Reasoning ✓
Streaming ✓
Context ...
```

## 15.7 Model Profiles

Add user-facing aliases/profiles:

```text
Main Coding
├── Provider: OpenAI
├── Model: <id>
├── Reasoning: High
└── optional defaults
```

Users interact with meaningful aliases while advanced settings expose provider IDs.

Hierarchy:

```text
Provider
  ↓
Model
  ↓
Model Profile
  ↓
Agent assignment
  ↓
Session override
```

## 15.8 Fallbacks

Allow explicit fallback model configuration.

Never silently fallback.

Always emit UI activity such as:

```text
Primary model unavailable.
Using configured fallback for this turn.
```

Do not fallback on authentication/security failures unless the engine explicitly defines that policy.

---

# 16. Credentials

Rinari Engine remains credential authority.

Do not store provider secrets in:

- React localStorage;
- sessionStorage;
- plain Tauri Store;
- Rinari Agent SQLite;
- frontend source;
- logs.

## 16.1 Recommended engine credential backends

Extend Rinari CredentialStore toward:

```text
env://
keyring://
file://   fallback / compatibility
```

Recommended Python dependency:

```text
keyring
```

Goal:

- Windows Credential Manager / native backend;
- macOS Keychain;
- Linux Secret Service/KWallet where available;
- same secrets accessible to Rinari CLI and Rinari Agent through Rinari Engine.

Do not make Tauri Stronghold the only provider credential store if it prevents CLI from using the same configuration.

Tauri Stronghold remains acceptable for desktop-only secrets if any are later introduced.

---

# 17. PLAN / BUILD / REVIEW

Expose mode selection directly in the composer.

Example:

```text
[ BUILD ▼ ] [ Main Coding ▼ ] [ High ▼ ]
```

Modes are engine-level semantics, not cosmetic prompts.

## 17.1 PLAN

Default intent:

- inspect;
- search;
- reason;
- browser/research as allowed;
- create/update task graph;
- produce bounded implementation plan;
- avoid project mutation.

PLAN must use a read-only or plan-safe policy profile.

Output can expose:

```text
Plan
1. ...
2. ...
3. ...

Affected files: ...
Risk: ...
```

Action:

```text
Start Build
```

must continue the same logical session/task where possible.

## 17.2 BUILD

Allows normal Rinari coding autonomy subject to policy:

- edits;
- shell/process;
- tests;
- Git-safe operations;
- subagents;
- artifacts;
- verification.

## 17.3 REVIEW

Read/review-oriented mode:

- inspect current changes;
- analyze architecture;
- analyze tests;
- security/regression review;
- produce findings;
- no implementation unless user explicitly changes mode or requests an authorized edit.

Surface review findings by severity:

```text
Critical
Warning
Suggestion
```

## 17.4 Mode persistence

Support:

- global default;
- project default;
- session override.

Display current mode continuously.

---

# 18. Per-agent model configuration

Rinari's built-in agents should be configurable from desktop.

Default behavior:

```text
All agents → use main model
```

Power-user behavior:

```text
Main Agent      Main Coding / High
Explorer        Sonnet / Medium
Reviewer        Main Coding / High
Verifier        Fast Model / Low
Researcher      Sonnet / Medium
...
```

Use the actual built-in agent registry as the source of truth rather than duplicating names in React.

## 18.1 Configurable fields

Per agent, where supported:

- enabled;
- primary model profile;
- fallback model profile;
- reasoning/effort;
- tool profile;
- budget profile;
- max concurrency/instances;
- workspace isolation behavior;
- project override.

Advanced fields remain collapsed by default.

## 18.2 Capability validation

Prevent clearly invalid assignments where the engine knows the model lacks a required capability.

Example:

```text
This model does not support tool calling and cannot be assigned to Main Agent in BUILD mode.
```

## 18.3 Agent Studio — post-v1

Design for later custom agents:

```text
name
role
model
tools
permissions
spawn permissions
trigger
workspace profile
```

Do not block v1 on custom-agent creation.

---

# 19. Rinari Soul system

Soul becomes a real configurable domain object.

Do not implement custom Souls as arbitrary `system_prompt += ...` strings in the desktop UI.

## 19.1 Separation

```text
Constitution / enforced policy
        ≠
Soul / identity and voice
```

Soul cannot override:

- tool permissions;
- approval requirements;
- security policy;
- secret handling;
- verification truth;
- actual execution state.

## 19.2 SoulDefinition

Suggested structure:

```text
SoulDefinition
├── id
├── name
├── version
├── identity
├── personality
├── behavior
├── style
├── event_reactions
├── model_instructions
├── extended_identity
└── metadata
```

A structured YAML/JSON representation may coexist with Markdown identity text.

## 19.3 Default Soul 3.0 direction

Default Rinari should be:

- anime-inspired;
- a woman persona, consistent with existing Rinari identity;
- playful;
- teasing;
- expressive;
- confident;
- warm;
- lightly tsundere;
- mock-jealous in playful situations;
- stays in character in normal conversation;
- able to become concise/serious for incidents, data loss, security or factual status.

Mock jealousy is character flavor only.

Prohibited behavior remains:

- guilt-tripping;
- exclusivity pressure;
- manipulation;
- pretending a real romantic dependency;
- distorting technical truth;
- insulting the user;
- lying about execution.

## 19.4 Character intensity

Expose:

```text
Minimal
Balanced
Full Character
```

This is separate from Soul selection.

## 19.5 Visual Soul editor

Settings → Rinari / Soul:

```text
Active Soul
[ Rinari Default ▼ ]

Playfulness
Teasing
Warmth
Mock Jealousy
Formality
Expressiveness

Stay in character       ✓
React to successes      ✓
React to model changes  ✓
Occasional kaomoji      configurable
```

Sliders map to structured Soul configuration, not random prompt fragments.

## 19.6 Advanced editor

Provide an advanced raw editor for custom Soul definition.

Validate before saving.

## 19.7 Scopes

Precedence:

```text
Bundled default
    ↓
Global active Soul
    ↓
Project override
    ↓
Session override
```

## 19.8 Storage

Suggested engine-owned layout:

```text
~/.rinari/souls/
├── rinari-default/
│   ├── soul.yaml
│   └── identity.md
└── custom-soul/
    ├── soul.yaml
    └── identity.md
```

Project override only if explicitly supported by trusted project configuration.

## 19.9 Main agent vs subagents

Default:

```text
Main Agent → active Soul
Subagents  → functional role personas
```

Do not have every subagent consume the full anime personality by default.

Main Agent synthesizes subagent results in Rinari's voice.

## 19.10 UI flavor reactions

Soul may provide optional UI flavor reactions to truthful engine events.

Example:

```text
✓ 956 tests passed
“See? I had it handled.”
```

But telemetry remains literal and unchanged.

Never replace:

```text
3 tests failed
```

with personality text implying success.

## 19.11 Import/export

Support later:

```text
Import Soul
Export Soul
```

Use a versioned, validated format.

Treat imported Souls as untrusted configuration/instructions.

---

# 20. Chat experience

Reuse Luma's successful visual model but connect it to Rinari sessions.

## 20.1 Composer

Composer bottom controls:

```text
+ Context
PLAN/BUILD/REVIEW
Model Profile
Effort
Soul [optional compact control]
Send/Stop
```

Avoid visual overload by moving secondary controls into popovers.

## 20.2 Context chips

Allow explicit focused context:

```text
file
folder
diff
artifact
terminal output
image
PDF or supported attachment
```

Display as removable chips.

Explicit context is a priority hint/input; it does not replace Rinari's normal repository tools unless mode/policy says so.

## 20.3 Drag and drop

Support dropping files/images and later relevant artifact types into composer.

Use native/Tauri path handling for desktop file drops.

## 20.4 Streaming

Stream structured events from engine.

Content delta updates message body.

Activity/tool events update Activity UI.

Do not concatenate all tool output into assistant prose.

## 20.5 Prompt queue

Add after core chat is stable.

While a turn runs, user may queue next requests:

```text
1. Add tests
2. Update docs
3. Check dark mode
```

Allow reorder/edit/delete.

Queue execution must preserve normal turn boundaries and approvals.

---

# 21. Activity Timeline

Replace generic “thinking” presentation with observable harness activity.

Example:

```text
Activity

✓ Inspected repository
  31 files · 4 languages

✓ Built plan
  7 tasks

✓ Explorer completed
  Found existing auth abstraction

▶ Editing
  src/auth/service.py

○ Verification
```

Expandable activity item can show:

- tool name;
- input summary;
- output summary;
- duration;
- artifacts;
- error code;
- retry state.

Do not expose hidden provider reasoning as if it were ordinary engine activity.

---

# 22. Approvals UI

Approval must be a first-class native-looking interaction.

Example:

```text
Rinari wants to run

npm install <package>

Working directory
~/project

Risk
Changes dependencies

[Deny] [Allow once] [Allow this session]
```

Dirty file protection example:

```text
Rinari wants to overwrite a file that contained
changes before this session.

src/config.ts

[View diff]
[Deny] [Allow]
```

Approval result is sent to engine; React never directly performs the operation.

---

# 23. Changes and Diff Review

Use Rinari/Git state as source of truth.

Panel:

```text
Changes 7
M src/runtime/provider.py
A src/auth/oauth.py
A tests/test_oauth.py
```

Diff viewer supports:

- unified;
- split;
- syntax highlighting;
- line numbers;
- collapsed unchanged ranges;
- file ownership metadata where available.

Actions:

```text
Open externally
Reveal in folder
Copy diff
Undo/restore through Rinari checkpoint/file-safe flow
```

Never implement an unsafe direct “replace file from UI state” undo.

---

# 24. Checkpoint Timeline

Visualize Rinari checkpoints.

Example:

```text
10:42 Before auth refactor
10:47 AuthService implemented
10:51 OAuth added
10:56 Tests fixed ✓
```

Actions:

```text
Preview
Restore
Create branch/session from here [later]
```

Respect existing user/mixed/agent ownership semantics.

---

# 25. Session branching

Post-core feature.

Allow conversation/work branches from a message/checkpoint without forcing a Git branch.

Concept:

```text
             OAuth approach
             /          \
      PKCE path      Passkeys path
```

Engine must define persistence semantics before UI ships it.

Do not fake branching by copying only visible chat messages while losing task/context state.

---

# 26. Task Graph

Start with a clear tree/list view.

```text
Auth implementation
├── ✓ Inspect current auth
├── ✓ Design abstraction
├── ▶ Implement OAuth
│   ├── ✓ AuthService
│   └── ▶ Callback
└── ○ Tests
```

Task detail:

- status;
- agent;
- dependencies;
- blockers;
- changed files;
- acceptance criteria;
- validation evidence.

Add `@xyflow/react` graph visualization only after task APIs are stable.

---

# 27. Verification Center

Desktop should make Rinari's completion discipline obvious.

Example:

```text
Verification

Tests       ✓ 87 passed
Lint        ✓ Clean
Typecheck   ✓ Passed
Build       ✓ Success

Outcome     DONE
```

Other valid outcomes must remain visible:

```text
IMPLEMENTED_UNVERIFIED
PARTIAL
BLOCKED
FAILED
```

Provide:

```text
Run suggested verification
```

using engine's verification plan, not a React-hardcoded `npm test` guess.

---

# 28. Agents panel

Show live subagents:

```text
Agents

Main       Running
Explorer   Completed
Reviewer   Running
Verifier   Waiting
```

Agent detail:

- role;
- model;
- effort;
- status;
- elapsed time;
- tool usage;
- budget;
- workspace/worktree where applicable;
- result summary.

Do not present internal subagent chatter as canonical assistant output unless synthesized appropriately.

---

# 29. Context Inspector

Expose engine context pressure transparently.

Example:

```text
Context
67% of window

System            ...
Conversation      ...
Tool schemas      ...
Project context   ...
Compact state     ...
```

Only show breakdowns the engine can actually calculate.

Show compaction status:

```text
Last compacted ...
Preserved goal/tasks/files/validation/approvals/artifacts
```

---

# 30. Budget and usage

Display useful runtime budget information without making the normal UI noisy.

Compact status:

```text
Model calls  8 / 28
Tool calls  31 / 112
Agents       2 / 4
```

Profiles:

```text
Auto
Quick
Normal
Deep
Custom
```

Use engine budget profiles as source of truth.

Usage panel may show:

```text
input tokens
output tokens
cached tokens
model calls
tool calls
network calls
```

Cost may be shown only when pricing/source data is available and must be marked **estimated** when computed locally.

Breakdown by agent/model is valuable later.

---

# 31. Project Intelligence

Expose repository understanding already available from Rinari.

Example:

```text
Project Intelligence

Languages
Python
TypeScript

Frameworks
Typer
pytest
React

Testing
pytest

Lint
ruff

LSP
pyright ●

Index
12,842 files
48,233 symbols
Up to date

Instructions
RINARI.md
2 active scopes
```

This is read from engine project state, not rescanned independently by React.

---

# 32. MCP Manager

Settings → MCP.

```text
GitHub MCP        ● Connected
Postgres MCP      ● Connected
Custom MCP        ⚠ Degraded

+ Add MCP Server
```

Detail:

- command/transport;
- health;
- negotiated capabilities;
- tools count;
- enabled scope;
- diagnostics.

Allow test/reconnect through engine.

Do not execute MCP directly from Tauri.

---

# 33. Plugin Manager

Settings → Plugins.

Show:

- name;
- version;
- source: user/project;
- enabled status;
- trust requirement;
- contributed tools/hooks;
- diagnostics.

Example:

```text
Custom Internal Tools
⚠ LOAD_FAILED
ModuleNotFoundError: ...
```

Project plugins remain subject to Rinari project trust.

---

# 34. Tool & Permissions Center

Present actual engine policy in understandable groups.

Example:

```text
Filesystem
Read       Allowed
Write      Ask / Allowed per policy

Shell
Commands   Ask for risky operations

Network
HTTP       Allowed
Browser    Allowed

Git
Read       Allowed
Destructive operations restricted
```

Optional presets:

```text
Safe
Balanced
Autonomous
Custom
```

If presets are added, they must compile to real engine policy and be reversible/inspectable.

---

# 35. Browser panel

When browser tools are active, show optional session activity:

```text
Browser ● Active
Current page: ...
```

Possible v1 display:

- current URL/title;
- recent navigations;
- screenshots/artifacts;
- recent browser actions.

A fully interactive browser view is not required for v1.

Do not duplicate Rinari browser automation logic in React.

---

# 36. Terminal

Use xterm.js as the renderer.

Path:

```text
xterm.js
   ↓
Tauri typed channel
   ↓
Rinari engine PTY/process API
   ↓
OS shell/process
```

Do not add Node `node-pty`.

Bottom tabs:

```text
Terminal
Tests
Problems
Output
Trace
```

Support:

- resize;
- search;
- clickable links where safe;
- terminal session list;
- clear/restart.

Platform limitations from Rinari PTY must be represented accurately.

---

# 37. Artifacts Gallery

Visualize `artifact://` resources.

```text
Artifacts
📄 architecture.md
📊 benchmark.csv
🖼 screenshot.png
📋 test-report.json
```

Support metadata:

- source tool/agent;
- created time;
- content type;
- size;
- retention;
- checksum/provenance where exposed.

Preview text/images and supported formats selectively.

Use engine read/export methods.

Do not directly infer artifact filesystem paths in React.

---

# 38. Rinari Profiles

Separate from Souls.

A **Rinari Profile** is a full working configuration bundle.

Example:

```text
Profile: Serious Coding

Soul         Professional Rinari
Main Model   Main Coding
Explorer     Sonnet
Reviewer     Main Coding
Mode         BUILD
Budget       Deep
MCP          GitHub, Context tools
Permissions Balanced
```

Another:

```text
Profile: Local Cheap
Main Model   Local Qwen
Browser      Off
Budget       Normal
```

Scopes:

```text
Global
Project override
Session override
```

Keep Soul as a reusable component inside a profile rather than making Profile and Soul the same concept.

---

# 39. Settings architecture

Recommended sections:

```text
General
Appearance
Providers & Models
Agents
Rinari / Soul
Profiles
Tools & Permissions
MCP
Plugins
Browser
Projects
Memory & Context
Terminal
Advanced
About
```

Use React Hook Form + Zod for non-trivial forms.

Validate again in engine/backend.

Settings should clearly show scope:

```text
Global
Project override
```

Avoid hidden precedence.

---

# 40. Appearance

Reuse Luma's semantic theme token approach.

Default visual identity:

- dark background;
- Rinari dark violet;
- restrained nebula accent;
- subtle borders;
- limited glassmorphism;
- high information density;
- small/medium radii;
- minimal shadows;
- strong code typography;
- subtle Motion transitions.

Support:

```text
System
Dark
Light
```

Accent presets can remain, but Rinari violet is default.

Honor reduced motion.

Do not over-animate live agent activity.

---

# 41. Command Palette

Reuse/adapt Luma `cmdk` implementation.

Examples:

```text
Switch model
Change to PLAN
Change to BUILD
Open Providers
Open Agents
Open Soul
Run verification
Toggle terminal
Open changes
Open artifacts
Resume session
Open project
```

Expose relevant Rinari slash-command equivalents as discoverable commands where useful.

Keyboard-first operation should be a product quality target.

---

# 42. CLI ↔ Code handoff

This should become a signature feature.

## 42.1 Terminal to desktop

Target command:

```bash
rinari desktop .
```

or in REPL:

```text
/open-code
```

Open Rinari Agent with:

- same project;
- same session;
- same task graph;
- same context state;
- same active model/profile;
- same changes;
- same verification state.

## 42.2 Desktop to terminal

Action:

```text
Open session in Terminal
```

Launch terminal with resume identifier.

## 42.3 Single instance

Use Tauri single-instance behavior so repeated `rinari desktop ...` invocations route to the existing application and open/focus requested project/session. Preserve `rinari code` as a compatibility alias.

---

# 43. Storage ownership

## Engine-owned persistent state

```text
sessions
messages
providers
models
agents configuration
Soul definitions/selection
profiles if shared with CLI
MCP
plugins
projects
memory/context state
tasks
verification
artifacts
checkpoints
budgets/usage state where persisted
```

## Rinari Agent-owned state

Only desktop presentation preferences, e.g.:

```text
window state
panel dimensions
sidebar collapsed
last visible inspector tab
appearance preference if intentionally desktop-only
keyboard UI preferences
```

If a preference should be identical in CLI and Code, move it to engine config instead of duplicating it.

---

# 44. Security model

## 44.1 Frontend is untrusted input

Every Tauri command validates payloads.

Every engine method validates again.

## 44.2 No arbitrary shell command bridge

Do not expose a generic frontend API like:

```text
execute_shell(string)
```

React requests engine PTY/process/session actions through typed methods.

## 44.3 Tauri capabilities

Keep capabilities narrowly scoped.

The app should not grant broad filesystem/shell access merely because Rinari Engine can operate on projects.

The engine process owns harness permissions.

## 44.4 Secrets

Never log:

- API keys;
- access tokens;
- refresh tokens;
- credentials;
- custom auth headers.

## 44.5 External content

Treat:

- project files;
- imported Souls;
- MCP output;
- plugin manifests;
- downloaded artifacts;
- URLs;
- provider responses

as untrusted input at relevant boundaries.

## 44.6 Updates

Sign desktop updates and engine bundles.

Do not accept unsigned runtime replacement.

---

# 45. Packaging the Python engine

This requires an early spike.

Rinari supports dynamically loaded Python plugins, so packaging must preserve the expected plugin/import contract.

Do not pick a freeze technology solely because it produces one small executable.

Evaluate at least:

```text
bundled Python runtime + installed Rinari package
vs
PyInstaller/Nuitka-style frozen engine
```

Acceptance questions:

- Can user/project Python plugins still load?
- Can MCP subprocesses launch?
- Can browser runtime find dependencies?
- Are packaged assets/Soul files available?
- Does `~/.rinari` remain compatible with CLI?
- Can engine update safely?
- Are Windows/macOS/Linux paths predictable?

## 45.1 Recommended release principle

Bundle a known-compatible engine version with Rinari Agent.

Allow an advanced development override to point to another engine executable.

Do not use arbitrary external engine versions by default.

## 45.2 Compatibility

Maintain:

```text
Rinari Agent version
Engine protocol major
Bundled engine version
```

in About/diagnostics.

---

# 46. Updates

Use Tauri updater for desktop application distribution.

Decide one of two release strategies before GA:

### Strategy A — engine ships with app

Desktop update updates both Code and bundled Engine.

Simplest compatibility story.

### Strategy B — engine independently updatable

More flexible but significantly more complex.

For v1 prefer **Strategy A** unless release requirements prove otherwise.

---

# 47. Logging and diagnostics

Rust:

```text
tracing
```

Tauri app logs:

- startup;
- engine start/stop/restart;
- handshake;
- protocol errors;
- window/update issues;
- desktop integration failures.

Engine keeps its own structured diagnostics.

Provide a user-facing diagnostics screen:

```text
Rinari Agent
Engine
Providers
MCP
Plugins
Browser
Updates
```

Offer:

```text
Copy diagnostics
Export diagnostics
```

with secret redaction.

---

# 48. Performance requirements

## UI

- virtualize long chat history;
- virtualize large lists where needed;
- do not rerender entire chat per token;
- batch high-frequency engine events;
- isolate activity panel updates from message rendering;
- lazy-load heavy feature panes;
- defer graph libraries until opened;
- avoid giant Zustand stores.

## Engine transport

- do not send large artifact content repeatedly;
- use artifact URIs;
- coalesce token/event deltas if UI cannot consume them fast enough;
- preserve ordering;
- set bounded queues/backpressure behavior.

## Desktop

- expensive filesystem/process work stays outside WebView main thread;
- no recursive scanning in React;
- no DB querying from React.

---

# 49. Accessibility and desktop UX

Required:

- keyboard navigation;
- visible focus;
- accessible dialogs;
- accessible menus;
- tooltips on icon-only buttons;
- reduced motion;
- usable contrast;
- correct screen-reader labels for status where practical;
- no critical information communicated by color only.

Desktop shortcuts should avoid conflicting with editor/composer text input.

---

# 50. Keyboard shortcuts

Initial set:

```text
Ctrl/Cmd + K     Command palette
Ctrl/Cmd + O     Open project/folder
Ctrl/Cmd + ,     Settings
Ctrl/Cmd + L     Focus composer [if conflict-free]
Ctrl/Cmd + Shift + P  optional command palette alias
Esc              Close active overlay / cancel local UI action
```

Do not assign destructive global shortcuts.

---

# 51. Testing strategy

Testing spans both repositories.

## 51.1 Rinari Engine protocol tests — Python

Use pytest with a protocol harness.

Required:

- handshake;
- every public method envelope;
- event serialization;
- cancellation;
- approvals;
- snapshots;
- reconnect/restart behavior;
- custom Soul CRUD;
- provider CRUD/discovery;
- agent config;
- mode transitions;
- malformed protocol input.

## 51.2 Rust tests

Test:

- NDJSON framing;
- request correlation;
- event routing;
- engine state machine;
- crash/restart;
- handshake compatibility;
- redaction;
- path validation;
- supervisor shutdown.

Use a fake scripted engine process for hermetic tests.

## 51.3 Frontend unit/component tests

Use Vitest + Testing Library.

Prioritize:

- provider forms;
- mode selection;
- approval dialog;
- Soul editor;
- model assignment;
- task state rendering;
- verification state;
- diff actions;
- engine disconnected/degraded states.

## 51.4 Frontend service contract tests

Mock the typed Tauri bridge, not the engine implementation.

## 51.5 End-to-end desktop flows

Required release scenarios:

1. first launch → configure provider → discover model → start chat;
2. open folder → PROJECT session;
3. PLAN → receive task plan → switch to BUILD;
4. BUILD → tool activity → approval → changed file → verification;
5. stop running turn;
6. close/reopen app → resume session;
7. engine crash → desktop recovers state;
8. provider switch in settings → next turn uses new model;
9. per-agent model assignment reflected in spawned agent;
10. custom Soul created → selected → persists → main agent uses it;
11. MCP diagnostic visible;
12. plugin load failure visible;
13. artifact created and previewed;
14. terminal PTY flow on supported platform;
15. dirty user changes are not silently overwritten.

---

# 52. CI/CD

## Rinari-CLI

Existing CI remains authoritative for engine/harness.

Add protocol-specific suites.

## Rinari-Agent CI

PR checks:

```text
npm lint
npm typecheck
frontend tests
cargo fmt --check
cargo clippy
cargo test
Tauri build smoke
protocol compatibility test with bundled engine
```

Matrix:

```text
Windows
macOS
Linux
```

At minimum, run full tests on primary OS and build/smoke on all supported targets; expand platform-specific E2E as practical.

Release gate:

- frontend build;
- Rust tests;
- protocol tests;
- bundled engine smoke;
- package signing;
- updater artifact generation;
- clean-machine startup smoke;
- provider onboarding smoke with fake provider;
- version consistency.

---

# 53. Implementation phases

The phases below are ordered to avoid building UI on unstable contracts.

---

## Phase 0 — Product skeleton and packaging spike

### Goals

- create `Rinari-Agent` repo;
- establish Tauri/React baseline;
- prove engine sidecar distribution path;
- prove dynamic Rinari plugin compatibility strategy;
- establish design tokens from Luma.

### Work

- initialize Tauri 2 + React + TypeScript + Vite;
- Tailwind 4;
- basic custom titlebar/window behavior only if justified;
- Tauri capabilities minimal;
- single instance;
- window-state;
- logging;
- copy/adapt Luma visual tokens;
- create `EngineSupervisor` placeholder;
- packaging spike on Windows first plus one POSIX target;
- write architecture decision record for engine packaging.

### Exit criteria

- app launches;
- displays Rinari-themed shell;
- can spawn a test sidecar;
- sidecar stdout can stream to Rust;
- selected engine packaging strategy has documented plugin implications.

---

## Phase 1 — Engine Protocol v1

### Rinari-CLI work

- implement `rinari engine --stdio`;
- handshake;
- request/response envelopes;
- event serialization;
- RuntimeSnapshot API;
- session list/open/create/resume;
- turn start/cancel;
- provider/model read APIs;
- approval resolve;
- engine diagnostics.

### Rinari-Agent work

- Rust protocol parser;
- request correlation;
- event channel;
- supervisor state machine;
- typed Tauri bridge;
- protocol version UI.

### Exit criteria

- fake UI can create/open session;
- start turn;
- stream content;
- cancel;
- recover from window reload via snapshot;
- approval roundtrip works;
- no CLI-rendered text parsing.

---

## Phase 2 — Luma design-system migration

### Work

- migrate `index.css` token system;
- rename Luma identity to Rinari;
- migrate AppShell/sidebar patterns;
- migrate Markdown/Shiki;
- migrate composer visual shell;
- migrate CommandPalette;
- migrate settings primitives;
- migrate UI Zustand store patterns;
- remove Luma auth/server assumptions;
- refactor to feature-oriented frontend architecture.

### Exit criteria

- UI visually matches desired Rinari/Luma direction;
- dark/light/reduced motion works;
- no Fastify dependency;
- no `/api/*` calls;
- no login/token localStorage dependency.

---

## Phase 3 — Provider & model onboarding

### Engine work

- protocol provider CRUD;
- provider test;
- model discovery;
- capabilities;
- selected model/profile APIs;
- credential backend upgrade toward `keyring://`.

### Desktop work

- first-run provider wizard;
- provider cards;
- custom/OpenAI-compatible editor;
- model catalog;
- model picker;
- health/test state;
- credential-safe UI;
- model profile aliasing.

### Exit criteria

- new user can launch app without login;
- configure API-key provider;
- configure custom provider;
- discover models;
- select default;
- restart app without re-entering secret;
- no secret in browser storage/logs.

---

## Phase 4 — Production chat/session UX

### Work

- real engine sessions;
- CHAT and PROJECT indicators;
- chat history;
- message streaming;
- Stop/cancel;
- activity timeline;
- session switching;
- new chat;
- session resume;
- attachments/focused context initial support;
- command palette session actions.

### Exit criteria

- Rinari Agent can replace CLI for ordinary chat/project turns;
- same persistent engine sessions appear after restart;
- long conversations remain responsive.

---

## Phase 5 — PLAN / BUILD / REVIEW + project workspace

### Engine work

- formal mode enum/semantics if not already explicit enough;
- mode-specific policy profile integration;
- session mode persistence/override;
- safe transition PLAN → BUILD.

### Desktop work

- mode control in composer;
- mode descriptions;
- project start screen;
- recent projects;
- project dashboard;
- Project Intelligence panel.

### Exit criteria

- PLAN cannot unexpectedly mutate project;
- BUILD uses normal authorized mutations;
- REVIEW remains read/review oriented;
- mode survives expected session lifecycle;
- transition is visible in Activity.

---

## Phase 6 — Changes, approvals, tasks and verification

### Work

- native approval cards/dialogs;
- changed files panel;
- diff viewer;
- dirty-worktree ownership indicators;
- task tree;
- verification center;
- completion gate status;
- checkpoint timeline.

### Exit criteria

- user can understand exactly what Rinari changed;
- user can review risky action before approval;
- DONE cannot visually appear when engine reports unverified/partial;
- checkpoint restore routes through engine safety logic.

---

## Phase 7 — Agents and model routing UI

### Work

- agent registry query;
- agent status panel;
- live agent activity;
- per-agent model assignment;
- fallback assignment;
- effort config;
- tool/budget profile UI;
- project overrides;
- model capability validation.

### Exit criteria

- user can set different models for built-in agents;
- spawned agent demonstrably uses assigned model;
- missing capability warning appears before invalid use where known;
- agent usage/budget is observable.

---

## Phase 8 — Soul 3.0 and custom Souls

### Engine work

- formal `SoulDefinition`;
- Soul store;
- bundled default Soul;
- global/project/session activation;
- Soul validation;
- prompt composer integration;
- main-agent-only default Soul injection;
- migration path from existing canonical Soul override;
- optional `soul.preview`;
- import/export format later or in same phase if low-cost.

### Desktop work

- Soul manager;
- default Rinari Soul;
- custom Soul creation;
- visual personality controls;
- advanced editor;
- character intensity;
- preview;
- Soul selector in settings/composer;
- optional truthful event flavor reactions.

### Exit criteria

- default Rinari has intended anime/playful character;
- custom Soul persists;
- user can revert to bundled default;
- project/session override works;
- subagents remain functional personas by default;
- safety/truth/verification behavior cannot be changed by Soul.

---

## Phase 9 — MCP, plugins, tools and browser settings

### Work

- MCP Manager;
- health/test/reconnect;
- plugin manager + diagnostics;
- Tool & Permissions Center;
- project trust display;
- browser session/activity panel;
- degraded extension status.

### Exit criteria

- extension failures are visible;
- user can configure supported ecosystem surfaces without terminal-only workflow;
- desktop does not bypass engine trust/policy.

---

## Phase 10 — Terminal, artifacts, context and budget

### Work

- xterm.js terminal;
- PTY bridge;
- Tests/Problems/Output/Trace tabs;
- artifact gallery;
- artifact previews;
- Context Inspector;
- Budget/Usage inspector;
- diagnostics export.

### Exit criteria

- PTY works on supported platform;
- artifacts are navigable without direct DB/filesystem assumptions;
- context and budget match engine values;
- high-frequency terminal output does not freeze UI.

---

## Phase 11 — Profiles, handoff and advanced workflow

### Work

- Rinari Profiles;
- global/project/session override UI;
- `rinari desktop .` (and the compatibility alias `rinari code .`);
- `/open-code`;
- Open session in Terminal;
- single-instance routing;
- prompt queue;
- checkpoint-to-session branching if engine semantics are ready.

### Exit criteria

- CLI → Code preserves same session;
- Code → CLI resumes same session;
- profile application is inspectable and deterministic.

---

## Phase 12 — Release hardening

### Work

- cross-platform installers;
- code signing;
- updater;
- engine bundle signing/versioning;
- first-run clean machine smoke;
- recovery from engine crash;
- migration tests;
- accessibility pass;
- performance pass;
- security review;
- docs;
- release notes;
- troubleshooting.

### Exit criteria

Rinari Agent is distributable as a real desktop product, not only a dev build.

---

# 54. Priority map

## P0 — required for usable v1

- Engine Protocol v1;
- EngineSupervisor;
- stable streaming/events;
- sessions;
- project open;
- Luma-derived UI shell;
- no-login onboarding;
- providers/model management;
- API key/custom provider flow;
- model selection;
- PLAN/BUILD/REVIEW;
- approvals;
- changed files/diff;
- tasks;
- verification;
- per-agent model assignment;
- Soul default + custom Soul basics;
- MCP/plugin diagnostics/settings;
- safe credentials;
- packaging;
- cross-platform build/CI.

## P1 — high-value post-core

- terminal;
- artifact gallery;
- context inspector;
- budget/usage;
- provider health center;
- model capability matrix;
- fallbacks;
- Rinari Profiles;
- CLI↔Code handoff;
- checkpoint timeline polish;
- prompt queue;
- browser activity.

## P2 — advanced

- visual React Flow task graph;
- Agent Studio;
- custom agents;
- session branching;
- isolated worktree experiment UI;
- richer browser preview;
- Soul marketplace/community format;
- automatic model routing;
- more advanced cost analysis.

---

# 55. File-by-file initial implementation map

## 55.1 Rinari-CLI

Expected new/changed areas:

```text
src/rinari/engine_protocol/             NEW
src/rinari/cli/commands/engine.py       NEW
src/rinari/application/                 shared services exposed cleanly
src/rinari/runtime/                     event/snapshot integration only as needed
src/rinari/session/                     protocol service adapters as needed
src/rinari/providers/                   provider/model management APIs
src/rinari/agents/                      configurable model assignment APIs
src/rinari/application/credentials.py   keyring backend
src/rinari/soul or identity area        formal SoulDefinition/SoulStore
src/rinari/assets/                      bundled default Soul 3.0
src/rinari/events/ or tracing layer     desktop-safe event projection
docs/commands.md                        engine transport + handoff commands
docs/soul.md                            Soul 3.0 contract
docs/harness.md                         desktop/engine protocol architecture
TODO.md                                 Rinari Agent integration milestones
```

Avoid invasive changes to ToolRuntime/AgentLoop unless the protocol reveals a missing public event/state boundary.

## 55.2 Rinari-Agent

Initial high-value frontend files:

```text
src/app/App.tsx
src/app/providers.tsx
src/components/layout/AppShell.tsx
src/components/layout/Sidebar.tsx
src/features/chat/
src/features/providers/
src/features/models/
src/features/activity/
src/features/approvals/
src/features/changes/
src/features/tasks/
src/features/verification/
src/features/agents/
src/features/souls/
src/features/settings/
src/services/engine.ts
src/services/queries.ts
src/stores/ui.ts
src/styles/index.css
```

Rust:

```text
src-tauri/src/engine/supervisor.rs
src-tauri/src/engine/transport.rs
src-tauri/src/engine/protocol.rs
src-tauri/src/commands/engine.rs
src-tauri/src/services/window.rs
src-tauri/src/errors.rs
```

---

# 56. Design-system migration checklist from Luma

- [ ] semantic background tokens moved;
- [ ] text/muted/border tokens moved;
- [ ] Rinari violet default accent;
- [ ] dark/light modes work;
- [ ] reduced motion works;
- [ ] typography mapped;
- [ ] Markdown styling moved;
- [ ] Shiki integration moved;
- [ ] scrollbar/focus behavior moved;
- [ ] AppShell adapted;
- [ ] sidebar adapted;
- [ ] composer adapted;
- [ ] message rendering adapted;
- [ ] command palette adapted;
- [ ] settings primitives adapted;
- [ ] Luma branding removed;
- [ ] Luma login removed;
- [ ] `/api/*` removed;
- [ ] auth token localStorage removed;
- [ ] Fastify dependency absent;

---

# 57. Protocol/API design rules

1. Stable machine codes, not localized error strings, drive behavior.
2. UI text may be localized; protocol fields are not localized.
3. Every mutating method is explicit.
4. Do not expose generic `invoke_any_tool` as the primary desktop control API.
5. Tools still execute through Rinari ToolRuntime.
6. Desktop never marks a task verified itself.
7. Desktop never marks an approval granted until engine confirms it.
8. Desktop never assumes a model switch succeeded until engine snapshot/event confirms it.
9. Desktop state can be rebuilt from snapshot.
10. Large data uses artifact/file-specific APIs, not giant event payloads.
11. Unknown protocol fields should be forward-compatible where safe.
12. Major protocol changes require version bump.

---

# 58. UX truth rules

The UI must never make Rinari appear more successful than the engine reports.

Examples:

```text
Tool requested
≠ Tool executed
```

```text
File edited
≠ Fix verified
```

```text
Test started
≠ Test passed
```

```text
Agent completed
≠ Overall task DONE
```

```text
Soul flavor text
≠ system status
```

Truthful machine state always wins over personality and animation.

---

# 59. Failure UX

Failures should be localized to the relevant feature.

Examples:

- provider unavailable → provider card + turn error;
- plugin failed → plugin diagnostics;
- MCP disconnected → MCP badge;
- engine restarted → global engine status;
- artifact unavailable → artifact panel error;
- test failed → verification panel;
- terminal process failed → terminal tab.

Avoid blocking the entire app because one optional extension failed.

---

# 60. Versioning rules

Maintain visible versions:

```text
Rinari Agent
Rinari Engine
Engine Protocol
Default Soul
```

About page should expose all four plus diagnostic copy action.

Soul changes have independent versioning from Engine Protocol.

---

# 61. Migration compatibility

Rinari Agent must respect an existing Rinari CLI installation/home.

Do not assume first launch means empty state.

Test:

- existing providers;
- existing sessions;
- existing project trust;
- existing Soul override;
- existing plugins;
- existing MCP servers;
- existing artifacts;
- existing state DB migrations.

When Soul 3.0 lands, preserve user's explicit existing Soul customization unless migration behavior is deliberately specified.

Bundled default can change without overwriting an explicit user custom Soul.

---

# 62. Recommended implementation commit strategy

Keep commits phase-scoped and testable.

Examples:

```text
feat(engine): add stdio protocol handshake and framing
feat(code): add EngineSupervisor and typed bridge
feat(code): migrate Rinari design tokens from Luma
feat(engine): expose provider management protocol
feat(code): add provider onboarding and model discovery
feat(engine): add session mode contract
feat(code): add plan build review selector
feat(code): add approvals and change inspector
feat(engine): add SoulDefinition and SoulStore
feat(code): add custom Soul editor
```

Do not combine engine protocol, provider UI and Soul redesign into one mega-commit.

---

# 63. Coding-agent execution rules

An implementation agent following this document must:

1. inspect current repo state before each phase;
2. preserve existing working architecture where possible;
3. not port Rinari engine logic to Rust;
4. not copy Luma server/auth code into Code;
5. keep engine persistence authoritative;
6. add dependencies only when the target feature uses them;
7. keep Tauri capabilities narrow;
8. use typed boundaries;
9. add tests with each protocol/behavioral feature;
10. update docs/contracts when public behavior changes;
11. preserve user project files and Rinari state;
12. run relevant lint/typecheck/tests before claiming a phase complete.

---

# 64. Definition of Done — Rinari Agent v1

Rinari Agent v1 is DONE only when all of the following are true.

## Architecture

- [ ] Rinari Agent uses Rinari Engine, not duplicate harness logic.
- [ ] Engine Protocol v1 is versioned and tested.
- [ ] Desktop can reconstruct state from RuntimeSnapshot.
- [ ] Engine crash/restart has a defined recovery path.

## Desktop foundation

- [ ] Tauri 2 app builds on supported desktop targets.
- [ ] Luma-derived visual system is migrated cleanly.
- [ ] app feels desktop-native rather than like a mobile/web page.
- [ ] resizable/persistent layout works.

## Authentication/onboarding

- [ ] no application login is required.
- [ ] first-run provider setup is friendly.
- [ ] API keys are not stored in frontend/plain config.
- [ ] custom/OpenAI-compatible provider setup works.
- [ ] model discovery works.

## Chat/projects

- [ ] CHAT sessions work.
- [ ] PROJECT sessions work.
- [ ] session resume works.
- [ ] same engine state survives desktop restart.
- [ ] streaming is responsive.
- [ ] Stop/cancel works.

## Modes

- [ ] PLAN is visibly read-only/plan-safe.
- [ ] BUILD supports authorized implementation.
- [ ] REVIEW supports review workflows.
- [ ] PLAN → BUILD continuation works.

## Providers/models

- [ ] provider manager works.
- [ ] model catalog works.
- [ ] model profile/alias works.
- [ ] model switch affects real next engine call.
- [ ] health/errors are visible.

## Agents

- [ ] built-in agents are visible.
- [ ] per-agent model assignment works.
- [ ] per-agent effort configuration works where supported.
- [ ] actual spawned agents use configured model.

## Soul

- [ ] bundled default Rinari Soul exists.
- [ ] default personality matches intended playful/anime direction.
- [ ] custom Souls can be created and activated.
- [ ] user can revert to default.
- [ ] global/project/session scopes are deterministic.
- [ ] personality cannot override truth/policy/security.

## Agent workspace

- [ ] activity timeline works.
- [ ] approvals work.
- [ ] changed files/diff works.
- [ ] task view works.
- [ ] verification view works.
- [ ] completion outcome matches engine.
- [ ] agent status works.

## Ecosystem

- [ ] MCP state/configuration is visible.
- [ ] plugin diagnostics are visible.
- [ ] tool/permission configuration maps to engine policy.
- [ ] browser state is represented if enabled.

## Advanced surfaces

- [ ] terminal works on supported platforms or clearly reports engine limitation.
- [ ] artifacts can be browsed/previewed.
- [ ] context inspector reports real engine state.
- [ ] budget/usage reports real engine state.

## Reliability

- [ ] tests cover protocol, Rust supervisor and critical React flows.
- [ ] CI builds supported targets.
- [ ] signed/updatable release path is defined.
- [ ] clean-machine smoke passes.
- [ ] existing Rinari home/state migration is tested.
- [ ] no secrets appear in logs.

---

# 65. Final product principle

The ideal result is not:

```text
Luma + a Python process
```

and not:

```text
Rinari CLI with buttons
```

It is:

```text
                     Rinari
                       │
              ┌────────┴────────┐
              │                 │
          Rinari CLI        Rinari Agent
          terminal           desktop
              │                 │
              └────────┬────────┘
                       │
                 Rinari Engine
                       │
     ┌─────────────────┼─────────────────┐
     │                 │                 │
  Models            Tools            Agents
     │                 │                 │
 Providers        MCP/Plugins       Verification
                       │
                  Projects/Git
```

The CLI and Code are two high-quality interfaces to one coherent Rinari.

A user should be able to start in terminal, continue in desktop, switch models or agents, inspect changes visually, configure a custom Soul, review verification, and return to terminal **without creating a second version of Rinari or losing operational state**.

That interoperability, combined with the visible harness state and Rinari's configurable identity, should be treated as the central product identity of Rinari Agent.
