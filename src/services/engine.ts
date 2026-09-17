import type {
  Attachment as ProtocolAttachment,
  ToolSummary as ProtocolToolSummary,
  ProjectSummary as ProtocolProjectSummary,
  SessionSummary as ProtocolSessionSummary,
  MessageOrigin,
  PeerGroup,
  PeerGroupMember,
  PeerMessage,
  QueuedPromptEntry,
} from '../types/protocol.generated'
import type { AttachmentRef } from '../types'

import { platform, type Unsubscribe } from '../platform'

export type EngineState =
  | "stopped"
  | "starting"
  | "handshaking"
  | "ready"
  | "degraded"
  | "restarting"
  | "failed";

export interface EngineStatus {
  state: EngineState;
  engine_version: string | null;
  protocol_version: number | null;
  detail: string | null;
  capabilities: Record<string, boolean>;
  /** Identidad estable del Engine home (digest de su ruta); `null` en engines antiguos. */
  home_id?: string | null;
}

export interface CommandError {
  code: string;
  message: string;
}

export interface EngineEventMsg {
  type: string;
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

export type SessionSummary = ProtocolSessionSummary
export type AttachmentInput = ProtocolAttachment & {
  page_range?: string | null
  visual_pages?: number[] | null
  images?: Array<{ uri: string; sha256?: string }> | null
}

export interface PreparedAttachmentResult {
  id: string
  name: string
  content_type?: string
  size?: number
  uri?: string
  sha256?: string
  kind?: string
  derived_uri?: string
  ocr?: boolean
  truncated?: boolean
  warning?: string
  images?: Array<{ uri: string; sha256?: string }>
  data_url?: string
}

export interface HistoryMessage {
  id: string;
  seq: number;
  role: string;
  content: string | null;
  tool_calls: Array<{ id: string; name: string; arguments: string }> | null;
  tool_call_id: string | null;
  name: string | null;
  created_at: string;
  turn_id?: string | null;
  /** Procedencia (peer/user-forward); ausente en engines anteriores. */
  origin?: MessageOrigin | null;
  images?: Array<{ uri: string; sha256: string }> | null;
  attachments?: Array<{
    id?: string;
    uri: string;
    sha256?: string;
    name?: string;
    content_type?: string;
    size?: number;
    kind?: string;
    derived_uri?: string;
    images?: Array<{ uri: string; sha256?: string }>;
    ocr?: boolean;
    truncated?: boolean;
    warning?: string;
  }> | null;
}

export interface TimelineEvent {
  event: string;
  turn_id: string;
  session_id: string;
  activity_seq: number;
  occurred_at?: string;
  [key: string]: unknown;
}

export interface TimelineTurn {
  mode?: string | null;
  turn_id: string;
  session_id: string;
  turn_index: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  user_message: string;
  items: TimelineEvent[];
  final_response: string;
  terminal?: Record<string, unknown>;
  origin?: MessageOrigin | null;
}

export interface TurnChangedFile {
  path: string
  absolute_path: string
  previous_path?: string | null
  kind: 'created' | 'modified' | 'deleted' | 'renamed'
  additions?: number | null
  deletions?: number | null
  ownership: 'agent' | 'user' | 'mixed' | 'unknown'
  confidence: string
  binary: boolean
  sensitive: boolean
  diff?: string | null
  diff_truncated: boolean
  undoable: boolean
  conflict_reason?: string | null
}

export interface TurnChangeSet {
  id: string
  turn_id: string
  session_id: string
  project_id?: string | null
  additions: number
  deletions: number
  undoable: boolean
  attribution_complete: boolean
  warnings: string[]
  status: 'active' | 'undone' | 'partially_undone' | 'conflicted'
  files: TurnChangedFile[]
}

export interface TurnUndoPreview {
  changeset_id: string
  turn_id: string
  operations: Array<{ path: string; absolute_path: string; action: string; safe: boolean }>
  conflicts: Array<{ path: string; absolute_path: string; reason: string }>
}

export interface ProviderSummary {
  id: string;
  alias: string;
  type: string;
  auth_method: string;
  account_hint: string | null;
  endpoint: string | null;
  settings: Record<string, unknown>;
  status_connected: boolean | null;
  status_checked_at: string | null;
  default_model_id: string | null;
  last_used_model_id: string | null;
  active: boolean;
  has_credential: boolean;
}

export interface ModelSummary {
  id: string;
  alias: string;
  provider_id: string;
  provider: string | null;
  provider_model_id: string;
  capabilities: Record<string, unknown> | null;
  availability: string;
  settings: Record<string, unknown>;
  active: boolean;
  /** False for a live provider-catalog entry not persisted locally yet. */
  saved?: boolean;
}

export interface DiscoveredModel {
  provider_model_id: string;
  capabilities: Record<string, unknown> | null;
  availability: string;
}

export interface ProviderHealth {
  connected: boolean;
  detail: string;
  models_discovered: number;
  models: DiscoveredModel[];
}

export interface DiscoveryCandidate {
  source: string;
  name: string;
  detail: string;
  provider_type: string;
  endpoint: string | null;
}

export interface TaskItem {
  id: string;
  title: string;
  status: string;
  [key: string]: unknown;
}

export interface ChangedFile {
  path: string;
  staged: string | null;
  unstaged: string | null;
}

export interface AgentAssignment {
  model: string | null;
  fallback: string | null;
  enabled: boolean;
}

export interface AgentView {
  name: string;
  description: string;
  profile: string;
  provenance: string;
  tool_allowlist: string[];
  budget: { max_model_calls: number; max_tool_calls: number; max_wall_time_s: number };
  assignment: AgentAssignment;
}

export interface SessionEvent {
  id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  turn_id: string | null;
}

export interface SoulSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
}

export interface SoulDetail extends SoulSummary {
  identity: string;
}

/** Proyecto registrado en el engine (project.list_recent). */
export type ProjectSummary = ProtocolProjectSummary

export interface ProjectGitStatus {
  available: boolean;
  branch: string | null;
  head: string | null;
  dirty: boolean;
  files: ChangedFile[];
  detached: boolean;
  ahead: number;
  behind: number;
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface ProjectStatus {
  project_id?: string | null;
  project: { root: string };
  root?: string;
  exists?: boolean;
  git?: ProjectGitStatus & { is_repo?: boolean; changed_files?: number };
  stale?: boolean;
  status: ProjectGitStatus;
  active_session_id: string | null;
}

export interface ProjectIntelligence {
  project: { root: string };
  repository: {
    languages: string[];
    frameworks: string[];
    package_managers: string[];
    build_command: string | null;
    test_command: string | null;
    lint_command: string | null;
    typecheck_command: string | null;
    scanned_files: number;
  };
  index: Record<string, unknown>;
  instructions: {
    trusted: boolean;
    scopes: Array<{ scope: string; provenance: string; kind: string }>;
  };
}

export interface SessionDeleteResult {
  deleted: { id: string };
  cascade: {
    queue_dropped: number;
    checkpoints_removed: number;
    checkpoints_kept: number;
    artifacts_removed: number;
    artifacts_kept: number;
  };
}

export interface McpServer {
  name: string;
  transport: string;
  command: string;
  scope: string;
  enabled: boolean;
  connected: boolean;
  updated_at: string | null;
}

export interface McpTest {
  ok: boolean;
  server?: string;
  tools?: number;
  names?: string[];
  error?: string;
  message?: string;
}

export interface PluginInfo {
  name: string;
  version: string;
  source: string;
  scope: string;
  enabled: boolean;
  path: string;
  capabilities: string[];
  diagnostics: Array<{ code: string; message: string }>;
}

export type NativeTool = ProtocolToolSummary;

export interface ArtifactSummary {
  uri: string;
  id: string;
  session: string;
  project_root: string;
  namespace: string;
  name: string;
  content_type: string;
  sha256: string;
  byte_count: number;
  summary: string;
  provenance: string;
  retention: string;
  created_at: string;
}

export interface SessionContext {
  session_id: string;
  compacted: boolean;
  compacted_at: string;
  goal: string;
  provider_model: string;
  counts: Record<string, number>;
}

export interface SessionUsage {
  session_id: string | null;
  model_calls: number;
  tokens: { input: number; output: number; cached: number; reasoning: number };
  tool_calls: { total: number; ok: number; error: number };
  cost: number | null;
}

export interface ProfileBundle {
  id: string;
  name: string;
  description: string;
  soul_id: string | null;
  mode: string | null;
  agents: Record<string, { model?: string; fallback?: string }>;
}

export interface ProjectChanges {
  available: boolean;
  branch: string | null;
  head: string | null;
  dirty: boolean;
  files: ChangedFile[];
}

export function isCommandError(value: unknown): value is CommandError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CommandError).code === "string"
  );
}

export function commandMessage(error: unknown): string {
  if (isCommandError(error)) return `${error.code}: ${error.message}`;
  return String(error);
}

export const engineApi = {
  // Ciclo de vida del proceso: es del host, no un método del Engine. Pasarlo
  // por `command()` fallaba al traducir, porque no hay método que traducir.
  status: () => platform().engine.status(),
  start: () => platform().engine.start(),
  shutdown: () => platform().engine.shutdown(),
  restart: () => platform().engine.restart(),
  sessions: (kind?: string, includeClosed?: boolean, projectId?: string, state?: string) =>
    platform().command<{ sessions: SessionSummary[] }>("session_list", {
      kind: kind ?? null,
      include_closed: includeClosed ?? null,
      project_id: projectId ?? null,
      state: state ?? null,
    }),
  createSession: (options?: { cwd?: string; chat?: boolean; title?: string; mode?: string; permission_profile?: string; project_id?: string }) =>
    platform().command<{ session: SessionSummary; created: boolean }>("session_create", {
      cwd: options?.cwd ?? null,
      chat: options?.chat ?? false,
      title: options?.title ?? null,
      mode: options?.mode ?? 'build',
      permission_profile: options?.permission_profile ?? 'workspace',
      project_id: options?.project_id ?? null,
    }),
  openSession: (reference: string) =>
    platform().command<{ session: SessionSummary; created: boolean; warnings: string[] }>(
      "session_open",
      { reference },
    ),
  /** Fila autoritativa de una sesión (cualquier estado); no la reabre ni la reconcilia. */
  sessionGet: (reference: string) =>
    platform().command<{ session: SessionSummary }>('session_get', { reference }),
  renameSession: (reference: string, title: string) =>
    platform().command<{ session: SessionSummary }>('session_rename', { reference, title }),
  archiveSession: (reference: string) =>
    platform().command<{ session: SessionSummary }>('session_archive', { reference }),
  restoreSession: (reference: string) =>
    platform().command<{ session: SessionSummary }>('session_restore', { reference }),
  forkSession: (reference: string, title?: string) =>
    platform().command<{ session: SessionSummary }>('session_fork', { reference, title: title ?? null }),
  sessionHistory: (reference: string, limit?: number) =>
    platform().command<{
      session_id: string;
      messages: HistoryMessage[];
      total: number;
      has_more: boolean;
    }>("session_history", { reference, limit: limit ?? null }),
  sessionTimeline: (reference: string, beforeTurnIndex?: number, limit?: number) =>
    platform().command<{
      session_id: string;
      turns: TimelineTurn[];
      has_more: boolean;
      next_before_turn_index: number | null;
    }>('session_timeline', {
      reference,
      before_turn_index: beforeTurnIndex ?? null,
      limit: limit ?? null,
    }),
  setSessionMode: (reference: string, mode: string) =>
    platform().command<{ session: SessionSummary }>("session_mode_set", { reference, mode }),
  setSessionModel: (reference: string, model: string, provider?: string) =>
    platform().command<{ session: SessionSummary; model: ModelSummary }>("session_model_set", {
      reference,
      model,
      provider: provider ?? null,
    }),
  setSessionPermission: (reference: string, permissionProfile: string) =>
    platform().command<{ session: SessionSummary }>("session_permission_set", {
      reference,
      permission_profile: permissionProfile,
    }),
  getSessionPermission: (reference: string) =>
    platform().command<{ session: SessionSummary }>("session_permission_get", { reference }),
  turnChanges: (turnId: string) =>
    platform().command<TurnChangeSet>('turn_changes_get', { turn_id: turnId }),
  reviewTurnChanges: (turnId: string, path?: string) =>
    platform().command<{ changeset_id: string; turn_id: string; files: TurnChangedFile[] }>(
      'turn_changes_review',
      { turn_id: turnId, path: path ?? null },
    ),
  previewTurnUndo: (turnId: string, paths?: string[]) =>
    platform().command<TurnUndoPreview>('turn_changes_undo_preview', {
      turn_id: turnId,
      paths: paths ?? null,
    }),
  undoTurnChanges: (turnId: string, paths?: string[], applySafeOnly = false) =>
    platform().command<TurnUndoPreview & { status: string; applied: string[]; skipped: string[] }>(
      'turn_changes_undo',
      { turn_id: turnId, paths: paths ?? null, apply_safe_only: applySafeOnly },
    ),
  searchWorkspaceFiles: (sessionId: string, query: string, limit = 30) =>
    platform().command<{ root: string; files: Array<{ path: string; relative_path: string; name: string }> }>(
      "workspace_file_search",
      { session_id: sessionId, query, limit },
    ),
  taskTree: (path: string) =>
    platform().command<{ tasks: TaskItem[]; depths: Record<string, number> }>("task_tree", {
      path,
    }),
  taskGet: (path: string, task_id: string) =>
    platform().command<{ task: TaskItem }>("task_get", { path, task_id }),
  verificationLatest: (path: string, kinds?: string[], limit?: number) =>
    platform().command<{ records: Array<Record<string, unknown>> }>("verification_latest", {
      path,
      kinds: kinds ?? null,
      limit: limit ?? null,
    }),
  verificationPlan: (path: string, changed_files: string[]) =>
    platform().command<{ plan: Record<string, unknown> }>("verification_plan", {
      path,
      changed_files,
    }),
  checkpointList: (path?: string) =>
    platform().command<{ checkpoints: Array<Record<string, unknown>> }>("checkpoint_list", {
      path: path ?? null,
    }),
  checkpointShow: (checkpoint_id: string) =>
    platform().command<{ checkpoint: Record<string, unknown> }>("checkpoint_show", {
      checkpoint_id,
    }),
  checkpointRestore: (input: {
    path: string;
    checkpoint_id?: string;
    preview?: boolean;
    allow_mixed?: boolean;
  }) =>
    platform().command<{ result: Record<string, unknown> }>("checkpoint_restore", {
      path: input.path,
      checkpoint_id: input.checkpoint_id ?? null,
      preview: input.preview ?? null,
      allow_mixed: input.allow_mixed ?? null,
    }),
  projectChanges: (path: string) =>
    platform().command<ProjectChanges>("project_changes", { path }),
  projectDiff: (path: string, file?: string, max_chars?: number) =>
    platform().command<{ diff: string; truncated: boolean; binary: boolean; chars: number }>(
      "project_diff",
      { path, file: file ?? null, max_chars: max_chars ?? null },
    ),
  agentList: () => platform().command<{ agents: AgentView[] }>("agent_list"),
  agentConfigGet: (agent: string) =>
    platform().command<{ agent: AgentView }>("agent_config_get", { agent }),
  agentConfigSet: (input: {
    agent: string;
    model?: string;
    fallback?: string;
    enabled?: boolean;
    clear?: boolean;
  }) =>
    platform().command<{ agent: AgentView }>("agent_config_set", {
      agent: input.agent,
      model: input.model ?? null,
      fallback: input.fallback ?? null,
      enabled: input.enabled ?? null,
      clear: input.clear ?? null,
    }),
  sessionEvents: (reference: string, after_seq?: number, limit?: number) =>
    platform().command<{ session_id: string; events: SessionEvent[]; has_more: boolean }>(
      "session_events",
      { reference, after_seq: after_seq ?? null, limit: limit ?? null },
    ),
  soulList: () => platform().command<{ souls: SoulSummary[]; active_id: string | null }>("soul_list"),
  soulGet: (id: string) => platform().command<{ soul: SoulDetail }>("soul_get", { id }),
  soulCreate: (input: {
    id: string;
    name: string;
    identity: string;
    description?: string;
    version?: string;
  }) =>
    platform().command<{ soul: SoulDetail }>("soul_create", {
      id: input.id,
      name: input.name,
      identity: input.identity,
      description: input.description ?? null,
      version: input.version ?? null,
    }),
  soulUpdate: (input: {
    id: string;
    name?: string;
    identity?: string;
    description?: string;
    version?: string;
  }) =>
    platform().command<{ soul: SoulDetail }>("soul_update", {
      id: input.id,
      name: input.name ?? null,
      identity: input.identity ?? null,
      description: input.description ?? null,
      version: input.version ?? null,
    }),
  soulRemove: (id: string) => platform().command<{ removed: { id: string } }>("soul_remove", { id }),
  soulActivate: (id: string) => platform().command<{ soul: SoulSummary }>("soul_activate", { id }),
  mcpList: () => platform().command<{ servers: McpServer[] }>("mcp_list"),
  mcpCreate: (name: string, command: string[]) =>
    platform().command<{ server: McpServer }>("mcp_create", { name, command }),
  mcpRemove: (name: string) => platform().command<{ removed: { name: string } }>("mcp_remove", { name }),
  mcpSetEnabled: (name: string, enabled: boolean) =>
    platform().command<{ server: McpServer }>("mcp_set_enabled", { name, enabled }),
  mcpTest: (name: string) => platform().command<{ test: McpTest }>("mcp_test", { name }),
  pluginList: () => platform().command<{ plugins: PluginInfo[] }>("plugin_list"),
  pluginSetEnabled: (name: string, enabled: boolean) =>
    platform().command<{ plugin: PluginInfo }>("plugin_set_enabled", { name, enabled }),
  pluginDiagnostics: () =>
    platform().command<{ reports: Array<{ name: string; source: string; diagnostics: Array<{ code: string; message: string }> }> }>(
      "plugin_diagnostics",
    ),
  toolList: () => platform().command<{ tools: NativeTool[] }>("tool_list"),
  policyGet: () =>
    platform().command<{ mode_profile: Record<string, string>; note: string }>("policy_get"),
  artifactList: (session_id?: string) =>
    platform().command<{ artifacts: ArtifactSummary[] }>("artifact_list", {
      session_id: session_id ?? null,
    }),
  artifactRead: (uri: string, max_bytes?: number) =>
    platform().command<{ artifact: ArtifactSummary; text: string; truncated: boolean; max_bytes: number }>(
      "artifact_read",
      { uri, max_bytes: max_bytes ?? null },
    ),
  attachmentPrepare: (session_id: string, attachments: AttachmentInput[]) =>
    platform().command<{ attachments: PreparedAttachmentResult[] }>('attachment_prepare', { session_id, attachments }),
  attachmentPreview: (uri: string, max_bytes?: number, max_dimension?: number) =>
    platform().command<Record<string, unknown>>('attachment_preview', { uri, max_bytes: max_bytes ?? null, max_dimension: max_dimension ?? null }),
  visionSettingsGet: () => platform().command<import('../types/protocol.generated').VisionSettings>('vision_settings_get'),
  contextSettingsGet: () => platform().command<import('../types/protocol.generated').ContextSettings>('context_settings_get'),
  contextCompact: (sessionId: string) => platform().command('context_compact', { sessionId }),
  contextStatus: (modelId: string) => platform().command<import('../types/protocol.generated').ContextStatus>('context_status', { modelId }),
  contextSettingsSet: (settings: import('../types/protocol.generated').ContextSettings) => platform().command<import('../types/protocol.generated').ContextSettings>('context_settings_set', { settings }),
  visionSettingsSet: (settings: import('../types/protocol.generated').VisionSettings) => platform().command<import('../types/protocol.generated').VisionSettings>('vision_settings_set', { settings }),
  sessionImageSupport: (session_id: string | null, model_id?: string) => platform().command<import('../types/protocol.generated').VisualRouteStatus>('session_image_support', { session_id, model_id }),
  attachmentPrepareStart: (session_id: string, attachments: AttachmentInput[]) =>
    platform().command<Record<string, unknown>>('attachment_prepare_start', { session_id, attachments }),
  attachmentPrepareGet: (job_id: string) =>
    platform().command<Record<string, unknown>>('attachment_prepare_get', { job_id }),
  attachmentPrepareCancel: (job_id: string) =>
    platform().command<Record<string, unknown>>('attachment_prepare_cancel', { job_id }),
  contextGet: (reference: string) =>
    platform().command<{ context: SessionContext }>("context_get", { reference }),
  usageGet: (reference?: string) =>
    platform().command<{ usage: SessionUsage }>("usage_get", { reference: reference ?? null }),
  queueAdd: (session_id: string, message: string) =>
    platform().command<{ session_id: string; position: number; pending: number }>("queue_add", {
      session_id,
      message,
    }),
  queueList: (session_id: string) =>
    platform().command<{
      session_id: string
      queue: string[]
      pending: number
      // Typed entries (manual + peer inbox); absent on engines without
      // `session_peer_messaging_v1`.
      entries?: QueuedPromptEntry[]
    }>("queue_list", {
      session_id,
    }),
  queueClear: (session_id: string) =>
    platform().command<{ session_id: string; removed: number }>("queue_clear", { session_id }),
  queueResume: (session_id: string) =>
    platform().command<{ session_id: string; resumed: number }>("queue_resume", { session_id }),
  // -- peer messaging between the sessions of a board ------------------------
  peerGroupSet: (input: {
    board_id: string
    group_id?: string | null
    expected_revision: number
    enabled: boolean
    members: PeerGroupMember[]
  }) =>
    platform().command<PeerGroup & { warnings?: string[] }>("peer_group_set", {
      board_id: input.board_id,
      group_id: input.group_id ?? null,
      expected_revision: input.expected_revision,
      enabled: input.enabled,
      members: input.members,
    }),
  peerGroupGet: (selector: { board_id?: string; session_id?: string; group_id?: string }) =>
    platform().command<{ group: PeerGroup | null }>("peer_group_get", {
      board_id: selector.board_id ?? null,
      session_id: selector.session_id ?? null,
      group_id: selector.group_id ?? null,
    }),
  peerGroupRevoke: (group_id: string) => platform().command<PeerGroup>("peer_group_revoke", { group_id }),
  peerMessageList: (session_id: string) =>
    platform().command<{ session_id: string; messages: PeerMessage[] }>("peer_message_list", { session_id }),
  peerMessageCancel: (message_id: string) =>
    platform().command<PeerMessage>("peer_message_cancel", { message_id }),
  peerMessageForward: (input: {
    target_session_id: string
    message: string
    source_session_id?: string | null
    quoted_source?: Record<string, unknown> | null
  }) =>
    platform().command<PeerMessage>("peer_message_forward", {
      target_session_id: input.target_session_id,
      message: input.message,
      source_session_id: input.source_session_id ?? null,
      quoted_source: input.quoted_source ?? null,
    }),
  bundleList: () => platform().command<{ profiles: ProfileBundle[] }>("bundle_list"),
  bundleCreate: (input: {
    id: string;
    name: string;
    description?: string;
    soul_id?: string;
    mode?: string;
    agents?: Record<string, { model?: string; fallback?: string }>;
  }) =>
    platform().command<{ profile: ProfileBundle }>("bundle_create", {
      id: input.id,
      name: input.name,
      description: input.description ?? null,
      soul_id: input.soul_id ?? null,
      mode: input.mode ?? null,
      agents: input.agents ?? null,
    }),
  bundleRemove: (id: string) => platform().command<{ removed: { id: string } }>("bundle_remove", { id }),
  bundleApply: (id: string, session_ref?: string) =>
    platform().command<{ applied: Record<string, unknown> }>("bundle_apply", {
      id,
      session_ref: session_ref ?? null,
    }),
  initialOpenRequest: () => platform().handoff.initial(),
  startTurn: (
    sessionId: string,
    message: string,
    reasoningEffort?: string | null,
    attachments: Array<AttachmentInput | AttachmentRef> = [],
  ) => {
    // Fail-fast con texto inconfundible: si esto salta, el bug está en la
    // UI (nunca debería invocar sin sesión); si salta el mensaje del
    // backend "(app 0.1.1)", el bug está en el puente Tauri.
    if (!sessionId) {
      return Promise.reject(new Error('UI sin sesión (fail-fast frontend)'))
    }
    return platform().command<{ status: string; turn_id: string; session_id: string }>("turn_start", {
      session_id: sessionId,
      message,
      reasoning_effort: reasoningEffort ?? null,
      // The UI keeps camelCase metadata (derivedUri/pageRange) while the
      // engine protocol is snake_case. Normalize at this boundary so an
      // imported document can never arrive as a display-only reference.
      attachments: attachmentInputs(attachments),
    })
  },
  cancelTurn: (sessionId: string) =>
    platform().command<{ status: string; turn_id: string; session_id: string }>("turn_cancel", {
      session_id: sessionId,
    }),
  resolveApproval: (approvalId: string, decision: string) =>
    platform().command<{ status: string; approval_id: string; decision: string }>("approval_resolve", {
      approval_id: approvalId,
      decision,
    }),
  snapshot: () => platform().command<{ snapshot: unknown }>("snapshot_get"),

  projectRecents: (limit?: number) =>
    platform().command<{ projects: ProjectSummary[] }>(
      "project_list_recent",
      limit === undefined ? {} : { limit },
    ),
  projectList: (includeArchived = false) =>
    platform().command<{ projects: ProjectSummary[] }>('project_list', {
      include_archived: includeArchived,
    }),
  projectGet: (projectId: string) =>
    platform().command<{ project: ProjectSummary }>('project_get', { project_id: projectId }),
  projectAdd: (path: string, name?: string, description?: string) =>
    platform().command<{ project: ProjectSummary; created: boolean }>('project_add', {
      path,
      name: name ?? null,
      description: description ?? null,
    }),
  projectUpdate: (
    projectId: string,
    patch: { name?: string; description?: string; pinned?: boolean; archived?: boolean },
  ) =>
    platform().command<{ project: ProjectSummary }>('project_update', {
      project_id: projectId,
      name: patch.name ?? null,
      description: patch.description ?? null,
      pinned: patch.pinned ?? null,
      archived: patch.archived ?? null,
    }),
  projectRemove: (projectId: string, sessionPolicy: 'keep' | 'archive' | 'delete' = 'archive') =>
    platform().command<{
      project: ProjectSummary;
      session_policy: string;
      sessions_affected: number;
      filesystem_deleted: false;
    }>('project_remove', { project_id: projectId, session_policy: sessionPolicy }),
  projectOpen: (path: string) =>
    platform().command<{ project: ProjectSummary; session: SessionSummary; created: boolean }>(
      "project_open",
      { path },
    ),
  projectStatus: (path: string) =>
    platform().command<ProjectStatus>("project_status", { path }),
  projectIntelligence: (path: string) =>
    platform().command<ProjectIntelligence>("project_intelligence", { path }),
  projectTrust: (path: string) =>
    platform().command<{
      project: { root: string };
      trust: { state: string; canonical_path: string; fingerprint: string | null; trusted_at: string };
    }>("project_trust", { path }),
  closeSession: (reference: string) =>
    platform().command<{ session: SessionSummary }>("session_close", { reference }),
  deleteSession: (reference: string, cascade?: boolean) =>
    platform().command<SessionDeleteResult>("session_delete", {
      reference,
      cascade: cascade ?? null,
    }),

  providerList: () =>
    platform().command<{ providers: ProviderSummary[]; active_alias: string | null }>(
      "provider_list",
    ),
  providerCreate: (input: {
    alias: string;
    provider_type: string;
    auth_method?: string;
    endpoint?: string;
    account_hint?: string;
    secret?: string;
    secret_env?: string;
  }) =>
    platform().command<{ provider: ProviderSummary }>("provider_create", {
      alias: input.alias,
      provider_type: input.provider_type,
      auth_method: input.auth_method ?? null,
      endpoint: input.endpoint ?? null,
      account_hint: input.account_hint ?? null,
      secret: input.secret ?? null,
      secret_env: input.secret_env ?? null,
      settings: null,
    }),
  providerGet: (reference: string) =>
    platform().command<{ provider: ProviderSummary }>("provider_get", { reference }),
  providerUpdate: (
    reference: string,
    patch: {
      alias?: string;
      endpoint?: string;
      account_hint?: string;
      secret?: string;
      secret_env?: string;
    },
  ) =>
    platform().command<{ provider: ProviderSummary }>("provider_update", {
      reference,
      ...patch,
    }),
  providerRemove: (reference: string, switchTo?: string) =>
    platform().command<{ removed: { id: string; alias: string } }>("provider_remove", {
      reference,
      switch_to: switchTo ?? null,
      keep_credentials: false,
    }),
  providerTest: (reference: string) =>
    platform().command<ProviderHealth>("provider_test", { reference }),
  providerDiscover: () =>
    platform().command<{ candidates: DiscoveryCandidate[] }>("provider_discover"),
  providerUse: (reference: string) =>
    platform().command<{ provider: ProviderSummary; model: ModelSummary | null }>(
      "provider_use",
      { reference },
    ),

  modelList: (provider?: string) =>
    platform().command<{ models: ModelSummary[] }>("model_list", {
      provider: provider ?? null,
    }),
  modelGet: (reference: string, provider?: string) =>
    platform().command<{ model: ModelSummary }>("model_get", {
      reference,
      provider: provider ?? null,
    }),
  modelAdd: (input: { provider: string; provider_model_id: string; alias: string }) =>
    platform().command<{ model: ModelSummary }>("model_add", {
      provider: input.provider,
      provider_model_id: input.provider_model_id,
      alias: input.alias,
      capabilities: null,
      settings: null,
    }),
  modelAlias: (reference: string, newAlias: string, provider?: string) =>
    platform().command<{ model: ModelSummary }>("model_alias", {
      reference,
      new_alias: newAlias,
      provider: provider ?? null,
    }),
  modelRemove: (reference: string, provider?: string) =>
    platform().command<{ removed: { id: string; alias: string } }>("model_remove", {
      reference,
      provider: provider ?? null,
    }),
  modelUse: (reference: string, provider?: string) =>
    platform().command<{
      model: ModelSummary;
      provider: ProviderSummary;
      switched_provider: boolean;
    }>("model_use", { reference, provider: provider ?? null }),
  modelDiscover: (provider?: string) =>
    platform().command<{ providers: Record<string, DiscoveredModel[]> }>("model_discover", {
      provider: provider ?? null,
    }),
  modelDiscoveryStart: (provider?: string) =>
    platform().command<{
      job_id: string;
      status: 'running' | 'completed';
      cached: boolean;
      providers?: Record<string, DiscoveredModel[]>;
    }>('model_discovery_start', { provider: provider ?? null }),
  modelRefresh: (provider?: string) =>
    platform().command<{
      providers: Record<
        string,
        {
          saved: number;
          still_available: number;
          marked_unavailable: number;
          discovered: number;
          error: string | null;
        }
      >;
    }>("model_refresh", { provider: provider ?? null }),
  modelTest: (reference: string, provider?: string) =>
    platform().command<{ ok: boolean; detail: string; model: ModelSummary }>("model_test", {
      reference,
      provider: provider ?? null,
    }),
};

function attachmentInputs(attachments: Array<AttachmentRef | AttachmentInput>): AttachmentInput[] {
  return attachments.map((item) => {
    const pageRange = (item as AttachmentRef).pageRange ?? (item as AttachmentInput).page_range
    const visualPages = (item as AttachmentRef).visualPages ?? (item as AttachmentInput).visual_pages
    const images = item.images
    return {
      id: item.id,
      path: item.path,
      name: item.name,
      mime_type: item.mime_type ?? null,
      size: item.size ?? null,
      source: item.source,
      data_url: item.data_url ?? null,
      uri: item.uri ?? null,
      sha256: item.sha256 ?? null,
      ocr: item.ocr ?? false,
      derived_uri: (item as AttachmentRef).derivedUri ?? (item as AttachmentInput).derived_uri ?? null,
      ...(pageRange ? { page_range: pageRange } : {}),
      ...(visualPages && visualPages.length > 0 ? { visual_pages: visualPages } : {}),
      ...(images && images.length > 0 ? { images } : {}),
    }
  })
}

function isTerminalPreparationStatus(status: string): boolean {
  return ['ready', 'completed', 'complete', 'done', 'success', 'error', 'failed', 'cancelled', 'canceled'].includes(status)
}

function mapPreparedAttachment(item: PreparedAttachmentResult, attachments: AttachmentRef): AttachmentRef {
  return {
    ...attachments,
    // The engine artifact ID is content-derived and can repeat across
    // sessions. Keep the per-selection client ID for async draft ownership.
    id: attachments.id,
    // The original name/path are intentionally retained from the selected
    // file. ArtifactStore names are implementation details and must not leak
    // into the composer or history.
    path: attachments.path,
    name: item.name || attachments.name,
    mime_type: item.content_type || attachments.mime_type,
    size: item.size ?? attachments.size,
    kind: (item.kind as AttachmentRef['kind']) || attachments.kind,
    uri: item.uri || item.images?.[0]?.uri || attachments.uri,
    sha256: item.sha256 || attachments.sha256,
    derivedUri: item.derived_uri || attachments.derivedUri,
    images: item.images || attachments.images,
    ocr: item.ocr ?? attachments.ocr,
    truncated: item.truncated ?? attachments.truncated,
    warning: item.warning || attachments.warning,
    previewUrl: attachments.previewUrl,
    data_url: undefined,
    status: 'ready',
    error: undefined,
  }
}

async function addEnginePreview(item: AttachmentRef): Promise<AttachmentRef> {
  if (item.kind !== 'image' || !item.uri) return item
  try {
    const preview = await engineApi.attachmentPreview(item.uri, 512 * 1024)
    if (typeof preview.base64 === 'string' && typeof preview.mime_type === 'string') {
      return { ...item, previewUrl: `data:${preview.mime_type};base64,${preview.base64}` }
    }
    if (typeof preview.data_url === 'string') return { ...item, previewUrl: preview.data_url }
  } catch {
    // Stable artifact references remain usable when preview is unavailable.
  }
  return item
}

function mapPreparedAttachments(prepared: PreparedAttachmentResult[], originals: AttachmentRef[]): Promise<AttachmentRef[]> {
  return Promise.all(prepared.map(async (item, index) => {
    // Preparation preserves request order. Artifact IDs are not client IDs,
    // and filenames need not be unique across selected directories.
    const original = originals[index]
    if (!original) throw new Error('El motor no devolvió el adjunto seleccionado')
    return addEnginePreview(mapPreparedAttachment(item, original))
  }))
}

/** Import selected files through the engine and return stable attachment refs. */
export async function prepareAttachmentRefs(sessionId: string, attachments: AttachmentRef[]): Promise<AttachmentRef[]> {
  const prepared = await engineApi.attachmentPrepare(sessionId, attachmentInputs(attachments))
  return mapPreparedAttachments(prepared.attachments, attachments)
}

export interface AttachmentPreparationOptions {
  onJobId?: (jobId: string) => void
  signal?: AbortSignal
  pollMs?: number
}

/**
 * Start preparation through the persisted engine job API. This is used by the
 * composer so OCR/PDF work can be cancelled while the UI remains responsive.
 * The synchronous method above remains useful for the turn boundary and for
 * older engines that only advertise attachment.prepare.
 */
export async function prepareAttachmentRefsWithJob(
  sessionId: string,
  attachments: AttachmentRef[],
  options: AttachmentPreparationOptions = {},
): Promise<AttachmentRef[]> {
  const started = await engineApi.attachmentPrepareStart(sessionId, attachmentInputs(attachments))
  const jobId = typeof started.job_id === 'string' ? started.job_id : null
  if (!jobId) {
    const inline = Array.isArray(started.attachments) ? started.attachments as PreparedAttachmentResult[] : null
    if (inline) return mapPreparedAttachments(inline, attachments)
    return prepareAttachmentRefs(sessionId, attachments)
  }
  options.onJobId?.(jobId)
  let state = started
  const pollMs = Math.max(50, options.pollMs ?? 120)
  while (true) {
    if (options.signal?.aborted) throw new DOMException('Attachment preparation cancelled', 'AbortError')
    const status = String(state.status ?? 'preparing').toLowerCase()
    if (isTerminalPreparationStatus(status)) {
      if (['error', 'failed', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(typeof state.error === 'string' ? state.error : `Preparación de adjuntos: ${status}`)
      }
      const prepared = Array.isArray(state.attachments) ? state.attachments as PreparedAttachmentResult[] : []
      if (prepared.length === 0) throw new Error('El motor terminó la preparación sin adjuntos')
      return mapPreparedAttachments(prepared, attachments)
    }
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, pollMs))
    state = await engineApi.attachmentPrepareGet(jobId)
  }
}

/** Un solo canal para todos los eventos del Engine, no un lector por panel. */
export function onEngineEvent(callback: (event: EngineEventMsg) => void): Promise<Unsubscribe> {
  return platform().events.onEngineEvent(callback);
}

export type { MessageOrigin, PeerGroup, PeerGroupMember, PeerMessage, QueuedPromptEntry }
