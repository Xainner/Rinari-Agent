import { readingCoverage } from '../components/AttachmentReading'
import type {
  ProviderPreset as ProtocolProviderPreset,
  ProviderUsageSnapshot,
  ProviderAuthSnapshot,
  ProviderIdentity,
  Attachment as ProtocolAttachment,
  FlowResult,
  FlowStage,
  FlowSummary,
  ToolSummary as ProtocolToolSummary,
  ProjectSummary as ProtocolProjectSummary,
  SessionSummary as ProtocolSessionSummary,
  MessageOrigin,
  QueuedPromptEntry,
} from '../types/protocol.generated'
import type { Checklist, FollowupSuggestion, Goal, GoalBudget, ProjectFolderCheck, ConversationSummary, RepoStatus, SessionResume } from '../types/protocol.generated'
import type { AttachmentRef, Language } from '../types'
import type {
  AgencyAgent,
  AgencyAgentInput,
  AgencyAgentSession,
  AgencySettingsData,
  AgencyStatus,
  AgencyTeam,
  AgencyTeamInput,
  AgentBudget,
  Errand,
  ErrandInput,
  ErrandMode,
  OfficeMessage,
  AgencyTemplateSummary,
  TeamTemplate,
} from '../features/agency/types'
import type { MemoryRecord } from '../features/memory/types'

import { platform, type Unsubscribe } from '../platform'
import { hasTranslation, translate, type I18nKey } from '../i18n'
import { useUIStore } from '../stores/ui'

/** Texto de la app para errores que nacen aquí y se muestran tal cual. */
const uiText = (key: I18nKey, vars?: Record<string, string>) => translate(useUIStore.getState().lang, key, vars)

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
  /** Si reintentar sirve, según el Engine. */
  retryable?: boolean;
  /** Datos del error (proveedor que falló, estado HTTP…), si el Engine los dio. */
  details?: Record<string, unknown>;
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
  duration_s?: number
  ocr?: boolean
  keep_image?: boolean
  coverage?: Record<string, unknown>
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
    duration_s?: number;
    images?: Array<{ uri: string; sha256?: string }>;
    ocr?: boolean;
    keep_image?: boolean;
    coverage?: Record<string, unknown>;
    truncated?: boolean;
    warning?: string;
  }> | null;
}

export interface TimelineEvent {
  event: string;
  /** Una página de `session.timeline` los dice en el turno, no en cada fila (#91). */
  turn_id?: string;
  session_id?: string;
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

export interface ModelRefreshResult {
  providers: Record<
    string,
    {
      saved: number;
      still_available: number;
      marked_unavailable: number;
      discovered: number;
      /** Aliases saved by this refresh; absent from Engines before `add_new`. */
      added?: string[];
      error: string | null;
    }
  >;
}

export interface ProviderSummary extends Partial<ProviderIdentity> {
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
  /** Off: its models leave every picker and nothing calls it (plan 0.4.0 #97). */
  enabled?: boolean;
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

/**
 * Estado de un provider servido por un CLI externo. Lo deriva el Engine: la
 * UI solo rotula. `state` manda sobre cualquier otro campo, y todo lo que no
 * sea `connected` impide usar el provider.
 */
export type ExternalRuntimeState =
  | 'missing_cli'
  | 'unsupported_cli'
  | 'logged_out'
  | 'connected'
  | 'non_subscription_auth'
  | 'error';

export interface ExternalRuntimeStatus {
  transport: string;
  experimental: boolean;
  installed: boolean;
  path: string | null;
  discovered_via: string | null;
  /** Variables de facturación retiradas del proceso hijo (solo los nombres). */
  sanitized_env: string[];
  state: ExternalRuntimeState;
  version?: string | null;
  supported?: boolean;
  detail?: string;
  hint?: string;
  /** Comando de instalación listo para pegar, cuando el CLI no está. */
  install_command?: string;
  /** Comando de inicio de sesión listo para pegar en esta máquina. */
  login_command?: string;
  /**
   * Credencial que una llamada eligió en vez de la suscripción. Mientras
   * exista, el Engine rechaza cada turno; «Comprobar de nuevo» la levanta.
   */
  blocked_source?: string | null;
  auth?: {
    logged_in: boolean;
    auth_method: string | null;
    api_provider: string | null;
    subscription_type: string | null;
    safe_for_subscription: boolean;
  };
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
/** Lo que `project.update` cambia; `permission_profile: ''` quita el valor por defecto (P-5). */
export type ProjectPatch = { name?: string; description?: string; pinned?: boolean; archived?: boolean; permission_profile?: '' | 'read-only' | 'workspace' | 'full-access' }

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

/** Estado de la confianza de un proyecto, tal como lo decide el Engine. */
/** El cambio de rama detrás de un aviso `[git-branch]`: desde la rama del último
 * trabajo en ese checkout (`last_work`) o la de la primera vez que se vio (`first_seen`). */
export interface BranchChange {
  from: string
  to: string
  since?: string | null
  reference: 'last_work' | 'first_seen'
  session_id?: string | null
}

export type TrustState = 'trusted' | 'not-trusted' | 'revalidation-required' | 'not-found'

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
    /** Distingue «nunca confiado» de «su identidad cambió». Engines anteriores no lo envían. */
    trust_state?: TrustState;
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

/** Horario de una tarea programada, en la hora local de este equipo. */
export type ScheduleSpec =
  | { kind: 'once'; at: string }
  /** En minutos o en segundos (desde 5 s): el Engine guarda minutos cuando son enteros. */
  | { kind: 'interval'; minutes: number; seconds?: never }
  | { kind: 'interval'; seconds: number; minutes?: never }
  | { kind: 'daily'; time: string }
  | { kind: 'weekly'; days: number[]; time: string }
  /** Cinco campos: minuto hora día mes día-de-semana (#50). */
  | { kind: 'cron'; expr: string }

/** Lo que corre una tarea «Comando» y qué pasa con su salida (#50). */
export interface ScheduledCommand {
  command: string
  shell?: 'default' | 'cmd' | 'powershell' | 'bash'
  cwd?: string | null
  timeout_s?: number
  env?: Record<string, string>
  on_result?: 'nothing' | 'notify_failure' | 'agent'
}

export interface ScheduleGrant {
  capability: string
  target: string | null
}

/** `queued`: «Repetir aquí» esperando su turno en la cola de la conversación. */
export type ScheduledRunStatus = 'queued' | 'running' | 'needs_you' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'skipped'

export interface ScheduledRun {
  id: string
  task_id: string
  status: ScheduledRunStatus
  trigger: 'schedule' | 'manual'
  scheduled_for: number | null
  started_at: number | null
  finished_at: number | null
  session_id: string | null
  turn_id: string | null
  summary: string | null
  reason: string | null
}

/** Lo que se envía al crear o editar una tarea (`scheduled_tasks_v1`). */
/** Rinari Agency: una llamada a un conector con argumentos fijos, sin modelo. */
export interface ScheduledToolCall {
  server: string
  tool: string
  arguments: Record<string, unknown>
}

/** Rinari Agency: lo que hace una regla de tipo «tool» y adónde va su resultado. */
export interface ScheduledToolSpec extends ScheduledToolCall {
  on_result: 'nothing' | 'notify' | 'agent' | 'deliver'
  deliver?: ScheduledToolCall
  max_per_day?: number | null
  /** Condición exacta sobre el resultado (CI: «failure»), sin modelo. */
  only_if_contains?: string | null
}

export interface ScheduledTaskInput {
  name: string
  kind: 'agent' | 'reminder' | 'command' | 'tool'
  schedule: ScheduleSpec
  prompt: string
  command?: ScheduledCommand | null
  /** Rinari Agency: la regla de un agente. */
  tool?: ScheduledToolSpec | null
  /** Rinari Agency: corre solo si esta carpeta cambió desde la última revisión. */
  watch?: { path: string } | null
  agent_id?: string | null
  project_id?: string | null
  mode?: 'plan' | 'build' | 'review'
  /** Sin valor: el modo por defecto del proyecto, o Proyecto (permisos v4 P-5). */
  permission_profile?: 'read-only' | 'workspace' | 'full-access' | null
  model?: string | null
  skills?: string[]
  grants?: ScheduleGrant[]
  enabled?: boolean
  /**
   * Dónde corre una tarea de agente: una conversación nueva cada vez, o la
   * conversación donde se pidió, con su historial («Repetir aquí»,
   * `schedule_target_v1`). Ahí usa el modelo, el modo y los permisos de esa
   * conversación y no lleva permisos concedidos.
   */
  target?: 'new_session' | 'this_conversation'
  session_id?: string | null
  /**
   * Rinari Agency (`agency_audit_v1`): la regla de un agente entrega su
   * resultado en la oficina de un equipo o a otro agente; null, en su chat.
   */
  deliver_to?: ScheduleDeliverTo | null
}

/** A dónde entrega su resultado la regla de un agente (`agency_audit_v1`). */
export type ScheduleDeliverTo = { kind: 'office'; team_id: string } | { kind: 'agent'; agent_id: string }

export interface ScheduledTask extends Required<Omit<ScheduledTaskInput, 'project_id' | 'model' | 'command' | 'permission_profile' | 'tool' | 'agent_id' | 'watch' | 'target' | 'session_id' | 'deliver_to'>> {
  id: string
  deliver_to?: ScheduleDeliverTo | null
  target?: ScheduledTaskInput['target']
  session_id?: string | null
  command?: ScheduledCommand | null
  tool?: ScheduledToolSpec | null
  watch?: { path: string } | null
  agent_id?: string | null
  permission_profile?: ScheduledTaskInput['permission_profile']
  project_id: string | null
  model: string | null
  next_run_at: number | null
  created_at: number
  updated_at: number
  /** Descripción corta del Engine, en inglés; la interfaz arma la suya. */
  description: string
  last_run: ScheduledRun | null
}

/** Shell que la terminal puede abrir (`desktop_terminal_v1`). */
export interface PtyShell {
  id: string
  label: string
  command: string
}

/** Comando `/` del catálogo del Engine (`slash_commands_v1`). */
export interface SlashCommand {
  name: string
  kind: 'ui' | 'mode' | 'turn' | 'skill' | 'learn'
  description: string
  args: string
  mode: string | null
  template: string | null
  source: 'builtin' | 'skill'
}

/** Lo que viaja con el turno: el Engine cambia el modo o fija la skill y arma el mensaje. */
export interface SlashCommandRequest {
  name: string
  text?: string
}

/** Biblioteca de skills (`skill_library_v1`). */
export type SkillOrigin = 'rinari' | 'installed' | 'learned' | 'project'

export interface SkillIssue {
  code: string
  message: string
}

export interface SkillFinding {
  code: string
  severity: 'danger' | 'warning'
  file: string
  line: number | null
  excerpt: string
}

export interface SkillReview {
  verdict: 'ok' | 'warning' | 'danger'
  content_hash: string
  files: number
  size: number
  findings: SkillFinding[]
}

export interface SkillEntry {
  name: string
  description: string
  version: string | null
  format: 'rinari' | 'standard' | null
  risk: string | null
  origin: SkillOrigin
  enabled: boolean
  status: string
  valid: boolean
  error: SkillIssue | null
  issues: SkillIssue[]
  /** Origen de la skill con el mismo nombre que esta reemplaza. */
  shadows: SkillOrigin | null
  editable: boolean
  /** Editada tras instalarla; null si no aplica. */
  modified: boolean | null
  provenance: {
    source_kind: string | null
    source: string | null
    installed_at: string | null
    updated_at: string | null
    learned_from: string | null
  }
}

export interface SkillDetail extends SkillEntry {
  path: string
  /** SKILL.md completo, con frontmatter: de ahí parte el editor. */
  skill_md: string
  review: SkillReview
  body: string
  references: string[]
  triggers?: string[]
  required_tools?: string[]
  optional_tools?: string[]
  allowed_tools?: string[]
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  /**
   * Skill aprendida con historial: la versión que «Deshacer» restauraría, para
   * revisar lo que Rinari cambió sin pedir aprobación. Ausente en Engines previos.
   */
  previous?: { version: string | null; skill_md: string } | null
}

/** Fallback and auxiliary model ids (plan 0.4.0 #80); null = the conversation's model. */
/** `session.turn.start` origin for a plan action (plan 0.4.0 #55). */
export type PlanTurnOrigin =
  | { kind: 'user'; source: 'plan_implement'; plan_turn_id: string }
  | { kind: 'user'; source: 'plan_adjust'; plan_turn_id: string; comment: string }

export interface ModelRoles {
  fallback: string | null
  auxiliary: string | null
  auxiliary_compaction: boolean
}

export interface SkillCandidate {
  name: string
  description: string
  version: string | null
  format: string | null
  path: string
  error: SkillIssue | null
  /**
   * `null` cuando aún no se revisó: la lista rápida de importar y los repos
   * con muchas skills grandes (solo trajeron su SKILL.md). Se revisa al elegirla.
   */
  review: SkillReview | null
  installed: { origin: SkillOrigin; source: string | null } | null
  /** Solo en la importación: claude | codex | agents. */
  kind?: string
  /** Solo en la importación: todos los lugares donde está la misma skill. */
  kinds?: string[]
  paths?: string[]
}

export interface SkillPage {
  name: string
  path: string
  text: string
  offset: number
  total_lines: number
  next_offset: number | null
}

export interface SpeechModelInfo {
  id: string
  file: string
  size: number
  tier: 'light' | 'default' | 'best' | string
  installed: boolean
}

/** Estado del dictado local que informa el Engine (`speech.status`). */
export interface SpeechStatus {
  model: string
  /** Vacío: nunca elegido; la app manda su propio idioma. */
  language: string
  vocabulary: string
  binary_found: boolean
  /** El Engine corre desde un checkout: whisper.cpp no viene incluido. */
  from_source?: boolean
  model_installed: boolean
  ready: boolean
  models: SpeechModelInfo[]
  languages: string[]
  downloading?: string[]
}

/** Skill que Rinari propuso sola y espera la aprobación del dueño. */
export interface SkillProposal {
  name: string
  description: string
  version: string | null
  learned_from: string | null
  proposed_at: string | null
  update: boolean
  review: SkillReview
  skill_md: string
  /** Versión instalada que reemplazaría; null si es nueva. */
  current_skill_md: string | null
  /** Skills instaladas parecidas, con el motivo que dio Rinari para crear otra. */
  similar_to?: Array<{ name: string; score?: number; shared: string[]; reason?: string }>
  /** Fusión: las skills que esta reemplaza (se apagan al aprobar). */
  replaces?: string[]
}

/** Dos skills del dueño que parecen hacer lo mismo (`skill.duplicates.list`). */
export interface SkillDuplicatePair {
  skills: [string, string]
  score: number
  shared: string[]
}

/**
 * Payload de `skill.learned`. `active` con `update` es una skill aprendida que
 * Rinari mejoró sin pedir aprobación: el aviso es para revisarla o deshacerla.
 */
export interface SkillLearned {
  name: string
  status: 'active' | 'pending'
  version: string
  update: boolean
  review: SkillReview['verdict']
  session_id: string
  /** Versión reemplazada en una actualización; ausente en Engines previos. */
  previous_version?: string | null
  /** Fusión o parecida a otra: presentes desde el gestor de skills. */
  replaces?: string[]
  similar_to?: Array<{ name: string; reason?: string }>
  /** El chat ya muestra la tarjeta de esta propuesta: sin aviso flotante. */
  card?: boolean
}

export type SkillJobAction = 'inspect' | 'install' | 'update'

export interface SkillJobError {
  code: string
  message: string
  details: Record<string, unknown>
}

/** Un secreto ya guardado: nunca llega su valor, solo si existe y de dónde sale. */
export interface McpSecretView {
  configured: boolean;
  source: 'stored' | 'env' | null;
  env_var?: string;
}

/** Estado de la conexión en segundo plano (`mcp_background_connect_v1`). */
export type McpStatus = 'idle' | 'connecting' | 'connected' | 'reauth_required' | 'error' | 'disabled'

export interface McpConnection {
  code?: string | null;
  hint?: string | null;
  message?: string | null;
  tools: number;
  resources: boolean;
  attempts: number;
  retry_in_s?: number | null;
  changed_at?: string | null;
}

export type McpAuthKind = 'none' | 'bearer' | 'headers' | 'oauth'

/** La autorización de un servidor guardado: tipos y estados, nunca un valor secreto. */
export interface McpAuthView {
  kind: McpAuthKind;
  token?: McpSecretView;
  /** OAuth (`mcp_oauth_v1`): el cliente propio del dueño, si lo hay. */
  client_id?: string | null;
  client_secret?: McpSecretView | null;
  scopes?: string[];
  redirect_port?: number | null;
  client_metadata_url?: string | null;
  authorize_params?: Record<string, string>;
}

export interface McpServer {
  name: string;
  transport: string;
  command: string;
  argv?: string[];
  url?: string;
  /** La URL entera está en el almacén (traía un secreto en la query): `url` lleva `***`. */
  url_secret?: McpSecretView;
  scope: string;
  /** Carpeta del proyecto al que pertenece (C4); null: cualquier proyecto de confianza. */
  project_root?: string | null;
  /** Rinari Agency (C8): `agent:ID` cuando la cuenta es de un agente; null: de todos. */
  owner?: string | null;
  enabled: boolean;
  connected: boolean;
  updated_at: string | null;
  timeout_s?: number | null;
  auth?: McpAuthView;
  status?: McpStatus;
  connection?: McpConnection;
  headers?: Array<{ name: string; secret: boolean; configured?: boolean; value?: string; source?: string | null; env_var?: string }>;
  env?: Array<{ name: string; configured: boolean; source: string | null; env_var?: string }>;
  warnings?: string[];
}

export interface McpTest {
  ok: boolean;
  server?: string | null;
  transport?: string | null;
  latency_ms?: number | null;
  server_info?: { name?: string; version?: string };
  tools?: number;
  names?: string[];
  resources?: number | null;
  prompts?: number | null;
  code?: string;
  error?: string;
  message?: string;
  http_status?: number | null;
  hint?: string | null;
  retryable?: boolean;
  /** Servidores http con auth `none` u `oauth`: si inicia sesión con OAuth y qué cliente usaría. */
  oauth?: McpOAuthSupport | null;
}

export interface McpOAuthSupport {
  available: boolean;
  client: 'configured' | 'registration' | 'metadata_document' | 'required';
  issuer?: string;
  resource?: string;
  registration?: boolean;
  client_metadata_document?: boolean;
  revocation?: boolean;
}

export interface McpAuthError { code: string; message: string; hint?: string }

export interface McpAuthStart {
  name: string;
  flow_id: string;
  authorize_url: string;
  redirect_uri: string;
  browser_opened: boolean;
  expires_at?: string | null;
  client: 'configured' | 'registered' | 'metadata_document';
  issuer?: string;
}

export interface McpAuthOutcome {
  flow_id: string;
  outcome: 'signed_in' | 'failed' | 'cancelled' | 'timed_out';
  finished_at?: string | null;
  error?: McpAuthError;
}

export interface McpAuthStatus {
  name: string;
  kind: McpAuthKind;
  signed_in: boolean;
  reauth_required: boolean;
  expires_at?: string | null;
  has_refresh_token: boolean;
  scopes: string[];
  issuer?: string | null;
  client?: 'configured' | 'registered' | 'metadata_document' | null;
  pending?: { flow_id: string; authorize_url: string; started_at?: string; expires_at?: string | null } | null;
  last?: McpAuthOutcome | null;
}

export type McpDecision = 'allow' | 'ask' | 'deny'
export type McpHintKey = 'readOnlyHint' | 'destructiveHint' | 'openWorldHint'
export type McpHints = Partial<Record<McpHintKey, boolean | null>>

/** Una herramienta de un servidor con su ajuste (`mcp_tool_permissions_v1`). */
export interface McpToolPermission {
  /** El nombre que da el servidor (`read_notes`): el `tool` de `mcp.tools.set`. */
  name: string;
  /** El id completo en Rinari (`mcp.notas.read_notes`). */
  tool: string;
  /** `annotations.title` del servidor, si lo da. */
  title: string | null;
  description: string;
  /** false: un ajuste guardado de una herramienta que el servidor ya no ofrece. */
  listed: boolean;
  annotations: { server?: McpHints; owner?: McpHints; effective?: McpHints };
  kind: 'read' | 'write' | 'destructive';
  sends_out: boolean;
  setting: McpDecision | null;
  decision: McpDecision | null;
  decision_source: 'tool' | 'server' | 'mode';
  by_mode: Partial<Record<'read-only' | 'workspace' | 'full-access', string>>;
}

export interface McpToolPermissions {
  name: string;
  scope: 'global' | 'project';
  status: McpStatus;
  default: McpDecision | null;
  tools: McpToolPermission[];
}

export interface McpCatalogText { es: string; en: string }
export type McpSetupKind = 'registration' | 'client_metadata' | 'own_client' | 'token' | 'secrets'
export type McpSetupField = 'client_id' | 'client_secret' | 'redirect_port' | 'token' | 'connection_string'

export interface McpCatalogSetup {
  kind: McpSetupKind;
  fields?: Array<{ name: McpSetupField; required: boolean }>;
  console_url?: string;
  help?: McpCatalogText;
  alternatives?: McpCatalogSetup[];
}

export interface McpCatalogEnvSpec { name: string; label: McpCatalogText; secret: boolean; required: boolean; default?: string }

/** Una entrada del catálogo de conectores (`mcp_catalog_v1`). `logo` es un identificador, no una imagen. */
export interface McpCatalogEntry {
  id: string;
  name: string;
  logo: string;
  category: 'google' | 'work' | 'dev' | 'design' | 'files' | 'crm' | 'media' | 'data';
  group?: string;
  preview?: boolean;
  description: McpCatalogText;
  notes?: McpCatalogText;
  docs_url: string;
  tools?: string[];
  server:
    | { transport: 'http'; url: string; auth: { kind: 'oauth' | 'bearer'; scopes?: string[] } }
    | { transport: 'stdio'; command: string[]; env?: McpCatalogEnvSpec[]; connection_string?: { schemes: string[] } };
  setup: McpCatalogSetup;
  added: boolean;
  servers: Array<{ name: string; scope: string; enabled: boolean; status?: McpStatus | null }>;
}

export interface McpCatalogAddInput {
  id: string;
  name?: string;
  /** Rinari Agency (C8): `agent:ID` para que la cuenta sea solo de ese agente. */
  owner?: string;
  client_id?: string;
  client_secret?: string;
  redirect_port?: number;
  token?: string;
  secrets?: Record<string, string>;
  connection_string?: string;
}

export interface McpImportSecret { where: 'env' | 'header' | 'url'; name: string; kind: 'value' | 'env_ref'; /** env_ref: la variable tuya que lee (el nombre, nunca el valor). */ variable?: string }

export interface McpImportCandidate {
  key: string;
  name: string;
  source: 'claude_desktop' | 'claude_code' | 'cursor' | 'vscode' | 'codex' | 'pasted' | 'project';
  source_label?: string;
  path?: string | null;
  project_root?: string | null;
  transport: 'stdio' | 'http' | null;
  command: string[];
  url: string;
  secrets: McpImportSecret[];
  warnings: string[];
  importable: boolean;
  reason?: string | null;
  suggested_name?: string;
  existing?: string | null;
  changed?: boolean;
  previous_decision?: 'accepted' | 'rejected' | null;
}

export interface McpImportSource { source: string; label?: string; path: string; found: boolean; servers: number; error?: string | null }

export interface McpImportResult {
  created: Array<{ key: string; server: McpServer }>;
  failed: Array<{ key: string; code: string; message: string }>;
  rejected?: string[];
  project?: string;
}

export interface McpProjectOffers {
  project: string;
  trusted: boolean;
  offers: McpImportCandidate[];
  answered: number;
  files?: McpImportSource[];
}

/**
 * Configuración de un servidor MCP (`mcp_remote_v1`). Un secreto es un texto
 * literal, `env://NOMBRE` o `{ env: NOMBRE }`; `null` en `env`/`headers` lo
 * borra. Sin `token` en `auth: { kind: 'bearer' }` se conserva el guardado.
 */
export interface McpConfig {
  transport?: 'stdio' | 'http';
  command?: string[];
  url?: string;
  env?: Record<string, string | null>;
  auth?:
    | { kind: 'none' | 'bearer' | 'headers'; token?: string }
    /** `mcp_oauth_v1`: se fusiona con lo guardado; `null` borra una clave. */
    | { kind: 'oauth'; client_id?: string | null; client_secret?: string | null; scopes?: string[] | null; redirect_port?: number | null; authorize_params?: Record<string, string> | null };
  headers?: Record<string, string | { value: string; secret?: boolean } | null>;
  timeout_s?: number;
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
  agents: Record<string, { model?: string; fallback?: string; effort?: string; enabled?: boolean }>;
  /** The built-in default profile: always exists, never removed. */
  builtin?: boolean;
  /** Present on `bundle_list` with `rinari_profiles_v1`. */
  active?: boolean;
  counts?: { projects: number; sessions: number };
}

/** How a conversation inside a project changes profile. */
export type ProjectPolicy = 'leave_project' | 'move_project'

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

/**
 * Códigos cuyo mensaje trae palabras de afuera que ayudan (las del proveedor,
 * de git, de la herramienta): van después del texto traducido.
 */
const ERROR_WITH_DETAIL = new Set([
  'NETWORK_FAILURE', 'PROVIDER_MODEL_FAILURE', 'TOOL_FAILURE', 'CONFIGURATION_ERROR', 'MODEL_DISCOVERY_FAILED',
  'DOWNLOAD_FAILED', 'SKILL_JOB_FAILED', 'PR_CREATE_FAILED', 'VALIDATION_FAILED', 'BLOCKED',
  // Códigos amplios: el motor explica el caso concreto («Checkpoints require a
  // Git repository…») y perderlo deja al dueño sin saber qué pasó.
  'INVALID_PARAMS', 'INVALID_ARGUMENT', 'INVALID_USAGE', 'NOT_FOUND', 'CONFLICT', 'PERMISSION_DENIED',
])

/**
 * Un error del motor en el idioma de la app, por su código y no por su texto
 * (#68). En español, un código conocido se dice con su frase; el texto del
 * Engine queda de respaldo para uno desconocido y en la consola. En inglés
 * se prefiere el texto del Engine, que es más preciso.
 */
export function errorText(code: string, message: string | undefined, lang: Language = useUIStore.getState().lang): string {
  const key = `error.${code}`
  const detail = message?.trim()
  if (!hasTranslation(key)) return detail || translate(lang, 'error.unknown', { code })
  if (lang === 'en' && detail) return detail
  const text = translate(lang, key)
  return ERROR_WITH_DETAIL.has(code) && detail ? `${text.replace(/\.$/, '')}: ${detail}` : text
}

/** «Sobre ti» (#71): el nombre siempre entra al prompt; usos y preferencias orientan. */
export interface AboutMe {
  name: string | null
  uses: string[]
  preferences: string | null
  updated_at: string | null
}

/** Lo que ocupa cada apartado de la carpeta de Rinari (Ajustes → Avanzado). */
export interface StorageUsage {
  home: string
  sections: { id: string; bytes: number; files: number; cleanable?: boolean; reclaimable?: number }[]
  total: number
}

export function commandMessage(error: unknown): string {
  if (isCommandError(error)) {
    if (error.message) console.warn(`[rinari] ${error.code}: ${error.message}`)
    return errorText(error.code, error.message)
  }
  return String(error);
}

export interface PermissionGrant {
  id: string
  /** Raíz del proyecto, o "chats" para todas las conversaciones sueltas. */
  scope: string
  scope_kind: 'project' | 'chats'
  /** Un antiguo «Siempre en los chats»: ya no se aplica, se lista para quitarlo (#56). */
  legacy?: boolean
  scope_label: string
  capability: string
  rule_id: string | null
  target: string | null
  description: string
  granted_at: string
}

/** A conversation another one opened for a separate piece of work (plan-sesiones-hijas 5). */
export interface WorkspaceDirEntry {
  name: string
  relative_path: string
  path: string
  kind: 'dir' | 'file'
  /** M modified · A added · D deleted · U untracked; a folder, what changed inside. */
  git?: 'M' | 'A' | 'D' | 'U'
}
export interface WorkspaceDirListing { root: string; path: string; entries: WorkspaceDirEntry[]; truncated: boolean; git: boolean }
export type TimeoutKey = 'connect' | 'first_byte' | 'idle' | 'total'
export interface ExecutionPolicy {
  max_concurrency: number
  providers: Record<string, number>
  models: Record<string, number>
  timeouts?: Partial<Record<TimeoutKey, number>>
  provider_timeouts?: Record<string, Partial<Record<TimeoutKey, number>>>
}
export interface ExecutionSettingsResult {
  settings: ExecutionPolicy
  defaults: { max_concurrency: number; timeouts: Record<TimeoutKey, number> }
}
export interface AdvancedSetting {
  key: string
  type: 'int' | 'float' | 'bool'
  value: number | boolean
  default: number | boolean
  min: number | null
  max: number | null
}

export interface ChildSession {
  child_session_id: string
  parent_session_id: string
  title?: string
  /** start: the owner asked · offer: accepted offer · note / plan_step: a card the owner started. */
  origin: 'start' | 'offer' | 'note' | 'plan_step'
  context: 'brief' | 'fork'
  isolation: 'same' | 'worktree'
  worktree_path: string | null
  branch: string | null
  state: 'working' | 'completed' | 'failed' | 'cancelled' | 'waiting'
  report: { summary?: string; text?: string; files?: string[]; terminal?: string; error?: string } | null
  reported: boolean
  resolution: 'integrated' | 'discarded' | null
  busy?: boolean
  created_at: string
  updated_at: string
}

export interface ChildIntegrateResult {
  child_session_id: string
  integrated: boolean
  conflicts: string[]
  message?: string
  files?: string[]
}

export type SteerResult =
  | { session_id: string; delivery: 'steer'; turn_id: string; steer_id: string; interrupted?: string[] }
  | { session_id: string; delivery: 'queued'; position: number }

export const engineApi = {
  // Ciclo de vida del proceso: es del host, no un método del Engine. Pasarlo
  // por `command()` fallaba al traducir, porque no hay método que traducir.
  status: () => platform().engine.status(),
  start: () => platform().engine.start(),
  shutdown: () => platform().engine.shutdown(),
  restart: () => platform().engine.restart(),
  sessions: (kind?: string, includeClosed?: boolean, projectId?: string, state?: string, limit?: number) =>
    platform().command<{ sessions: SessionSummary[] }>("session_list", {
      kind: kind ?? null,
      include_closed: includeClosed ?? null,
      project_id: projectId ?? null,
      state: state ?? null,
      limit: limit ?? null,
    }),
  createSession: (options?: { cwd?: string; chat?: boolean; title?: string; mode?: string; permission_profile?: string; project_id?: string }) =>
    platform().command<{ session: SessionSummary; created: boolean }>("session_create", {
      cwd: options?.cwd ?? null,
      chat: options?.chat ?? false,
      title: options?.title ?? null,
      mode: options?.mode ?? 'build',
      // Sin elegir: el valor por defecto del proyecto (o Proyecto) lo pone el Engine.
      permission_profile: options?.permission_profile ?? null,
      project_id: options?.project_id ?? null,
    }),
  openSession: (reference: string) =>
    platform().command<{ session: SessionSummary; created: boolean; warnings: string[]; trust_state?: TrustState | null; branch_change?: BranchChange | null }>(
      "session_open",
      { reference },
    ),
  /** Fila autoritativa de una sesión (cualquier estado); no la reabre ni la reconcilia. */
  sessionGet: (reference: string) =>
    platform().command<{ session: SessionSummary }>('session_get', { reference }),
  renameSession: (reference: string, title: string) =>
    platform().command<{ session: SessionSummary }>('session_rename', { reference, title }),
  /** Fija o desfija una conversación (capacidad `session_pins_v1`). */
  pinSession: (reference: string, pinned: boolean) =>
    platform().command<{ session: SessionSummary }>('session_pin', { reference, pinned }),
  archiveSession: (reference: string) =>
    platform().command<{ session: SessionSummary }>('session_archive', { reference }),
  restoreSession: (reference: string) =>
    platform().command<{ session: SessionSummary }>('session_restore', { reference }),
  forkSession: (reference: string, title?: string) =>
    platform().command<{ session: SessionSummary }>('session_fork', { reference, title: title ?? null }),
  sessionHistory: (reference: string, limit?: number, beforeSeq?: number) =>
    platform().command<{
      session_id: string;
      messages: HistoryMessage[];
      total: number;
      has_more: boolean;
      /** Cursor de «Cargar anteriores» (#70); `null` sin más. */
      next_before_seq?: number | null;
    }>("session_history", { reference, limit: limit ?? null, before_seq: beforeSeq ?? null }),
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
  /** Checks folders for a project without changing anything. */
  projectFoldersValidate: (paths: string[], projectId?: string) =>
    platform().command<{ folders: ProjectFolderCheck[] }>('project_folders_validate', { paths, project_id: projectId ?? null }),
  /** A project with name, description and working folders (first = primary), each with its trust. */
  projectCreate: (input: { name: string; description?: string; folders: { path: string; trust: boolean }[]; rinariProfileId?: string | null; open?: boolean }) =>
    platform().command<{ project: ProjectSummary; session: SessionSummary | null; trust: { path: string; state: string }[] }>('project_create', {
      name: input.name,
      description: input.description ?? null,
      folders: input.folders,
      rinari_profile_id: input.rinariProfileId ?? null,
      open: input.open ?? true,
    }),
  projectFolderAdd: (projectId: string, path: string, trust = false) =>
    platform().command<{ project: ProjectSummary }>('project_folder_add', { project_id: projectId, path, trust }),
  projectFolderRemove: (projectId: string, path: string) =>
    platform().command<{ project: ProjectSummary }>('project_folder_remove', { project_id: projectId, path }),
  /** Notes Rinari left (pending by default). */
  followupList: (filter: { sessionId?: string; projectId?: string; profile?: string; status?: string } = {}) =>
    platform().command<{ suggestions: FollowupSuggestion[] }>('followup_list', {
      session_id: filter.sessionId ?? null,
      project_id: filter.projectId ?? null,
      rinari_profile_id: filter.profile ?? null,
      status: filter.status ?? null,
    }),
  followupDismiss: (suggestionId: string) =>
    platform().command<{ suggestion: FollowupSuggestion }>('followup_dismiss', { suggestion_id: suggestionId }),
  /** Opens a new conversation (same project and profile) that starts the task. */
  /** `context` / `isolation`: how the child opens, as chosen on the card (plan-sesiones-hijas 5.5). */
  followupAccept: (suggestionId: string, options: { context?: 'brief' | 'fork'; isolation?: 'auto' | 'worktree' | 'same' } = {}) =>
    platform().command<{ suggestion: FollowupSuggestion; session: SessionSummary; turn: { turn_id: string } | null; child?: ChildSession; already_accepted: boolean }>('followup_accept', {
      suggestion_id: suggestionId,
      ...(options.context ? { context: options.context } : {}),
      ...(options.isolation ? { isolation: options.isolation } : {}),
    }),
  /** The owner opens a child by hand (a message's menu, /child): it starts now. */
  sessionChildStart: (sessionId: string, prompt: string, title?: string) =>
    platform().command<ChildSession & { title: string; turn_id?: string | null }>('session_child_start', { sessionId, prompt, ...(title ? { title } : {}) }),
  /** The children this conversation opened. */
  sessionChildrenList: (sessionId: string) =>
    platform().command<{ session_id: string; children: ChildSession[] }>('session_children_list', { sessionId }),
  /** Merge a child's branch into the project: the owner's decision, never the model's. */
  sessionChildIntegrate: (childSessionId: string) =>
    platform().command<ChildIntegrateResult>('session_child_integrate', { childSessionId }),
  sessionChildDiscard: (childSessionId: string) =>
    platform().command<{ child_session_id: string; discarded: boolean }>('session_child_discard', { childSessionId }),
  /** «Use the same folder in this project» (or back to a branch per child). */
  sessionChildrenIsolation: (sessionId: string, isolation: 'same' | 'worktree') =>
    platform().command<{ session_id: string; isolation: string }>('session_children_isolation', { sessionId, isolation }),
  /** The live checklist of a conversation; null when there is none to show. */
  sessionChecklist: (sessionId: string) =>
    platform().command<{ checklist: Checklist | null }>('session_checklist_get', { sessionId }),
  /** The user dismisses a finished or interrupted list. */
  clearSessionChecklist: (sessionId: string) =>
    platform().command<{ checklist: Checklist | null }>('session_checklist_clear', { sessionId }),
  /** El dueño marca como hecha una lista que quedó abierta (plan 0.4.0 #59). */
  completeSessionChecklist: (sessionId: string) =>
    platform().command<{ checklist: Checklist | null }>('session_checklist_complete', { sessionId }),
  // El objetivo de la conversación (plan 0.4.0 #23).
  sessionGoal: (sessionId: string) =>
    platform().command<{ goal: Goal | null }>('session_goal_get', { sessionId }),
  goalSet: (sessionId: string, objective: string, options: { budget?: GoalBudget; start?: boolean } = {}) =>
    platform().command<{ goal: Goal | null; turn?: { turn_id: string } }>('session_goal_set', {
      sessionId,
      objective,
      budget: options.budget ?? null,
      start: options.start ?? null,
    }),
  /** `/init` (#81): un turno de solo lectura que propone el RINARI.md del proyecto. */
  projectInitStart: (sessionId: string) =>
    platform().command<{ status: string; turn_id: string; session_id: string }>('project_init_start', { sessionId }),
  /** Guarda (tal cual o editado) o descarta la propuesta de `/init`. */
  projectInstructionsResolve: (sessionId: string, proposalId: string, decision: 'save' | 'discard', content?: string) =>
    platform().command<{ proposal_id: string; status: 'saved' | 'discarded'; path: string; edited?: boolean }>('project_instructions_resolve', {
      sessionId,
      proposalId,
      decision,
      content: content ?? null,
    }),
  goalPause: (sessionId: string) =>
    platform().command<{ goal: Goal | null }>('session_goal_pause', { sessionId }),
  goalResume: (sessionId: string, options: { start?: boolean } = {}) =>
    platform().command<{ goal: Goal | null; turn?: { turn_id: string } }>('session_goal_resume', { sessionId, start: options.start ?? null }),
  goalClear: (sessionId: string) =>
    platform().command<{ goal: Goal | null }>('session_goal_clear', { sessionId }),
  goalBudget: (sessionId: string, budget: GoalBudget) =>
    platform().command<{ goal: Goal | null }>('session_goal_budget', { sessionId, budget }),
  // Continuar sola cuando se restablezca el límite del proveedor (plan 0.4.0 #24).
  sessionResume: (sessionId: string) =>
    platform().command<{ resume: SessionResume | null }>('session_resume_get', { sessionId }),
  resumeArm: (sessionId: string, resetsAt?: string) =>
    platform().command<{ resume: SessionResume | null }>('session_resume_arm', { sessionId, resets_at: resetsAt ?? null }),
  resumeCancel: (sessionId: string) =>
    platform().command<{ resume: SessionResume | null }>('session_resume_cancel', { sessionId }),
  resumeNow: (sessionId: string) =>
    platform().command<{ resume: SessionResume | null; continued: boolean }>('session_resume_now', { sessionId }),
  // Modelo de respaldo y auxiliar (plan 0.4.0 #80).
  modelRoles: () => platform().command<{ roles: ModelRoles }>('models_roles_get'),
  setModelRoles: (changes: Partial<{ fallback: string | null; auxiliary: string | null; auxiliary_compaction: boolean }>) =>
    platform().command<{ roles: ModelRoles }>('models_roles_set', {
      fallback: 'fallback' in changes ? changes.fallback ?? '' : undefined,
      auxiliary: 'auxiliary' in changes ? changes.auxiliary ?? '' : undefined,
      auxiliary_compaction: changes.auxiliary_compaction,
    }),
  /**
   * The conversation's repository for «Resumen» (plan 0.4.0 #82), read-only.
   * Git answers now; with `remote_pending` the GitHub part (gh, PRs, checks)
   * follows as `repo.status.updated` with the same shape.
   */
  repoStatus: (sessionId: string, refresh?: boolean) =>
    platform().command<RepoStatus & { session_id: string }>('repo_status', { sessionId, refresh: refresh ?? null }),
  /**
   * Open a pull request with gh after the owner confirmed. Checks that need no
   * network fail at once (NOT_PUSHED, UNPUSHED_COMMITS, NOT_GITHUB…); gh runs
   * in the background and ends with `repo.pr.created` {job_id, url, number}
   * or `repo.pr.failed` {job_id, error}.
   */
  repoPrCreate: (sessionId: string, input: { title: string; base: string; body?: string }) =>
    platform().command<{ status: 'started'; job_id: string; session_id: string }>('repo_pr_create', {
      sessionId,
      title: input.title,
      base: input.base,
      body: input.body ?? '',
    }),
  /** Sources, results, connectors and background work (#82); `session.summary.changed` says when to read again. */
  sessionSummary: (sessionId: string) =>
    platform().command<ConversationSummary>('session_summary', { sessionId }),
  resumeSettings: () =>
    platform().command<{ auto_resume_on_limits: 'ask' | 'always' | 'never' }>('resume_settings_get'),
  setResumeSettings: (mode: 'ask' | 'always' | 'never') =>
    platform().command<{ auto_resume_on_limits: 'ask' | 'always' | 'never' }>('resume_settings_set', { auto_resume_on_limits: mode }),
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
  /** One folder of the conversation's workspace, for the Files tree (#98). */
  workspaceDirList: (sessionId: string, path = '') =>
    platform().command<WorkspaceDirListing>('workspace_dir_list', { session_id: sessionId, path }),
  searchWorkspaceFiles: (sessionId: string, query: string, limit = 30) =>
    platform().command<{ root: string; files: Array<{ path: string; relative_path: string; name: string }> }>(
      "workspace_file_search",
      { session_id: sessionId, query, limit },
    ),
  /**
   * Etapas de un proyecto o de una sesión (`project_flow_v1`).
   *
   * Va por la **intención** `flow.get` y no por `command()`: main valida el
   * alcance campo a campo, y la vía de comandos todavía sólo valida nombre y
   * forma de los parámetros (AGENTS.md, «Comandos e intenciones»).
   *
   * `before` pide el tramo anterior cuando la respuesta truncó.
   */
  flowGet: (scope: { project_id: string } | { session_id: string }, before?: string | null) =>
    platform().flow.get({
      project_id: 'project_id' in scope ? scope.project_id : null,
      session_id: 'session_id' in scope ? scope.session_id : null,
      before: before ?? null,
    }),
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
  soulList: () =>
    platform().command<{
      souls: SoulSummary[]
      active_id: string | null
      /** El Soul en uso sin pin de sesión (activado, o el de serie). Engines anteriores no lo envían. */
      effective_id?: string | null
      effective_source?: 'global' | 'legacy' | 'default'
    }>("soul_list"),
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
  /** Plan 0.4.0 #87: su `soul.toml` e `identity.md` en una carpeta elegida en el diálogo. */
  soulExport: (id: string, folder: string) => platform().command<{ path: string; files: string[] }>("soul_export", { id, folder }),
  /** Una carpeta de alma, o su `.toml` y su `.md`; se guarda como alma nueva. */
  soulImport: (paths: string[]) => platform().command<{ soul: SoulDetail }>("soul_import", { paths }),
  mcpList: () => platform().command<{ servers: McpServer[] }>("mcp_list"),
  /** `owner` (Rinari Agency, C8): la cuenta es solo de ese agente o equipo (`agent:ID`). */
  mcpCreate: (name: string, config: McpConfig, owner?: string) =>
    platform().command<{ server: McpServer }>("mcp_create", { name, ...config, ...(owner ? { owner } : {}) }),
  /** Edita un servidor guardado; los secretos que no se envían se conservan. */
  mcpUpdate: (name: string, config: McpConfig) =>
    platform().command<{ server: McpServer }>("mcp_update", { name, ...config }),
  /** Prueba una configuración sin guardarla; con `name`, sobre la guardada. */
  mcpProbe: (config: McpConfig & { name?: string }) =>
    platform().command<{ test: McpTest }>("mcp_probe", { ...config }),
  mcpRemove: (name: string) => platform().command<{ removed: { name: string } }>("mcp_remove", { name }),
  mcpSetEnabled: (name: string, enabled: boolean) =>
    platform().command<{ server: McpServer }>("mcp_set_enabled", { name, enabled }),
  mcpTest: (name: string) => platform().command<{ test: McpTest }>("mcp_test", { name }),
  /** «Reconectar»: vuelve a conectar ya, en segundo plano; el resultado llega con `mcp.status.changed`. */
  mcpReconnect: (name: string) => platform().command<{ server: McpServer }>("mcp_reconnect", { name }),
  /** Inicia sesión con OAuth: Rinari abre el navegador predeterminado y espera la vuelta. */
  mcpAuthStart: (name: string, options: { open_browser?: boolean; timeout_s?: number } = {}) =>
    platform().command<McpAuthStart>("mcp_auth_start", { name, ...options }),
  mcpAuthStatus: (name: string) => platform().command<McpAuthStatus>("mcp_auth_status", { name }),
  mcpAuthCancel: (name: string) => platform().command<{ name: string, cancelled: boolean }>("mcp_auth_cancel", { name }),
  mcpAuthSignout: (name: string) =>
    platform().command<{ name: string, revoked: boolean, removed: boolean, cancelled: boolean }>("mcp_auth_signout", { name }),
  mcpToolsList: (name: string, scope?: string) =>
    platform().command<{ server: McpToolPermissions }>("mcp_tools_list", { name, scope }),
  /** `decision: null` vuelve al valor por defecto del servidor; una anotación `null`, a la del servidor. */
  mcpToolsSet: (request: { name: string; tool: string; decision?: McpDecision | null; annotations?: McpHints | null; scope?: string }) =>
    platform().command<{ server: McpToolPermissions, tool: McpToolPermission }>("mcp_tools_set", { request }),
  mcpToolsSetDefault: (request: { name: string; decision: McpDecision | null; scope?: string }) =>
    platform().command<{ server: McpToolPermissions }>("mcp_tools_set_default", { request }),
  mcpCatalogList: () =>
    platform().command<{ version: string | number, verified_at?: string | null, entries: McpCatalogEntry[] }>("mcp_catalog_list"),
  mcpCatalogAdd: (input: McpCatalogAddInput) =>
    platform().command<{ server: McpServer, entry_id: string, next: 'sign_in' | 'connect' }>("mcp_catalog_add", { ...input }),
  /** Lo que otras apps de este equipo declaran, o un JSON pegado: solo nombres de secretos, nunca valores. */
  mcpImportScan: (input: { sources?: string[]; json?: unknown } = {}) =>
    platform().command<{ sources: McpImportSource[], candidates: McpImportCandidate[] }>("mcp_import_scan", { ...input }),
  mcpImportApply: (input: { keys: string[]; names?: Record<string, string>; sources?: string[]; json?: unknown }) =>
    platform().command<McpImportResult>("mcp_import_apply", { ...input }),
  mcpProjectOffersList: (path: string) => platform().command<McpProjectOffers>("mcp_project_offers_list", { path }),
  mcpProjectOffersDecide: (path: string, decisions: Array<{ key: string; accept: boolean; name?: string }>) =>
    platform().command<McpImportResult & { project: string }>("mcp_project_offers_decide", { path, decisions }),
  soulSettingsGet: () =>
    platform().command<{ settings: { character_intensity: 'minimal' | 'balanced' | 'full'; options: string[]; default: string } }>("soul_settings_get"),
  soulSettingsSet: (character_intensity: 'minimal' | 'balanced' | 'full') =>
    platform().command<{ settings: { character_intensity: 'minimal' | 'balanced' | 'full'; options: string[]; default: string } }>("soul_settings_set", { character_intensity }),
  pluginList: () => platform().command<{ plugins: PluginInfo[] }>("plugin_list"),
  pluginSetEnabled: (name: string, enabled: boolean) =>
    platform().command<{ plugin: PluginInfo }>("plugin_set_enabled", { name, enabled }),
  pluginDiagnostics: () =>
    platform().command<{ reports: Array<{ name: string; source: string; diagnostics: Array<{ code: string; message: string }> }> }>(
      "plugin_diagnostics",
    ),
  skillList: () => platform().command<{ skills: SkillEntry[] }>('skill_list'),
  skillGet: (name: string) => platform().command<{ skill: SkillDetail }>('skill_get', { name }),
  skillRead: (name: string, path: string, offset?: number) =>
    platform().command<SkillPage>('skill_read', { name, path, offset: offset ?? null }),
  skillSetEnabled: (name: string, enabled: boolean) =>
    platform().command<{ skill: SkillDetail }>(enabled ? 'skill_enable' : 'skill_disable', { name }),
  skillRemove: (name: string) => platform().command<{ removed: boolean }>('skill_remove', { name }),
  skillWrite: (name: string, content: string) =>
    platform().command<{ skill: SkillDetail }>('skill_write', { name, content }),
  skillImportScan: () => platform().command<{ candidates: SkillCandidate[] }>('skill_import_scan'),
  skillPendingList: () => platform().command<{ pending: SkillProposal[] }>('skill_pending_list'),
  skillPendingApprove: (name: string) =>
    platform().command<{ skill: SkillDetail; turned_off?: string[] }>('skill_pending_approve', { name }),
  skillPendingReject: (name: string) =>
    platform().command<{ rejected: boolean }>('skill_pending_reject', { name }),
  /** Deshacer una skill aprendida: su versión anterior, o fuera si era nueva. */
  skillRevert: (name: string) =>
    platform().command<{ name: string; restored: string | null; removed: boolean; turned_on?: string[] }>('skill_revert', { name }),
  /** Pares de skills del dueño que parecen la misma tarea. */
  skillDuplicatesList: () => platform().command<{ pairs: SkillDuplicatePair[] }>('skill_duplicates_list'),
  /** «No son duplicados»: el par deja de aparecer. */
  skillDuplicatesDismiss: (skills: [string, string]) =>
    platform().command<{ pairs: SkillDuplicatePair[] }>('skill_duplicates_dismiss', { skills }),
  /** Dictado local (whisper.cpp en el Engine). */
  speechStatus: () => platform().command<SpeechStatus>('speech_status'),
  speechSettingsSet: (input: { model?: string; language?: string; vocabulary?: string }) =>
    platform().command<SpeechStatus>('speech_settings_set', input),
  speechModelDownload: (model: string) =>
    platform().command<{ model: string; status: string }>('speech_model_download', { model }),
  speechModelCancel: (model: string) => platform().command<{ cancelled: boolean }>('speech_model_cancel', { model }),
  speechModelRemove: (model: string) =>
    platform().command<{ removed: boolean; status: SpeechStatus }>('speech_model_remove', { model }),
  /** Empieza a transcribir; el texto llega en `speech.transcribed` con el mismo `job_id`. */
  speechTranscribe: (audio: string, language?: string) =>
    platform().command<{ job_id: string; status: string }>('speech_transcribe', { audio, language: language ?? null }),
  skillSettingsGet: () => platform().command<{ auto_learn: 'propose' | 'never' }>('skill_settings_get'),
  skillSettingsSet: (autoLearn: 'propose' | 'never') =>
    platform().command<{ auto_learn: 'propose' | 'never' }>('skill_settings_set', { auto_learn: autoLearn }),
  /** Inspeccionar e instalar pueden descargar: el Engine responde con un job y termina con `skill.job.*`. */
  skillJobStart: (input: {
    action: SkillJobAction
    source?: string
    name?: string
    expectedHash?: string
    force?: boolean
    /** «Instalar igual» una skill que pasa de los topes. */
    allowLarge?: boolean
  }) =>
    platform().command<{ job_id: string; action: SkillJobAction; status: string }>('skill_job_start', {
      action: input.action,
      source: input.source ?? null,
      name: input.name ?? null,
      expected_hash: input.expectedHash ?? null,
      force: input.force ?? null,
      allow_large: input.allowLarge ?? null,
    }),
  skillJobGet: (jobId: string) =>
    platform().command<{ job: { job_id: string; status: string; result?: unknown; error?: SkillJobError } }>(
      'skill_job_get',
      { job_id: jobId },
    ),
  // Terminal del usuario: un PTY del Engine (ConPTY en Windows). El modelo no
  // escribe aquí; las pulsaciones viajan `raw`, tal cual se teclean.
  ptyShells: () => platform().command<{ shells: PtyShell[]; supported: boolean }>('pty_shells'),
  ptyStart: (input: { sessionId: string; command?: string; columns: number; rows: number }) =>
    platform().command<{ pty_id: string; session_id: string | null }>('pty_start', {
      session_id: input.sessionId,
      command: input.command ?? null,
      columns: input.columns,
      rows: input.rows,
    }),
  ptyWrite: (ptyId: string, data: string) =>
    platform().command<{ pty_id: string; written: number }>('pty_write', { pty_id: ptyId, data, raw: true }),
  ptyResize: (ptyId: string, columns: number, rows: number) =>
    platform().command<{ pty_id: string }>('pty_resize', { pty_id: ptyId, columns, rows }),
  ptyRead: (ptyId: string) =>
    platform().command<{ pty_id: string; alive: boolean; exit_code: number | null; data: string; offset?: number }>('pty_read', { pty_id: ptyId }),
  ptyList: () =>
    platform().command<{ ptys: { pty_id: string; command: string; alive: boolean; session_id: string | null }[] }>('pty_list'),
  ptyTerminate: (ptyId: string) =>
    platform().command<{ pty_id: string; alive: boolean; exit_code: number | null }>('pty_terminate', { pty_id: ptyId }),
  // Tareas programadas: las corre el Engine, con la app abierta o en la bandeja.
  // Rinari Agency (agency_agents_v1): agentes del perfil activo y su tarjeta.
  agencyAgents: (options?: { includeArchived?: boolean }) =>
    platform().command<{ agents: AgencyAgent[] }>('agency_agent_list', {
      rinari_profile_id: 'active',
      include_archived: options?.includeArchived ?? null,
    }),
  agencyAgent: (agentId: string) =>
    platform().command<{ agent: AgencyAgent; sessions: Array<SessionSummary & AgencyAgentSession> }>('agency_agent_get', { agent_id: agentId }),
  agencyCreateAgent: (agent: AgencyAgentInput) =>
    platform().command<{ agent: AgencyAgent }>('agency_agent_create', {
      agent: agent as unknown as Record<string, unknown>,
      rinari_profile_id: null,
    }),
  agencyUpdateAgent: (agentId: string, patch: Partial<AgencyAgentInput>) =>
    platform().command<{ agent: AgencyAgent }>('agency_agent_update', {
      agent_id: agentId,
      patch: patch as unknown as Record<string, unknown>,
    }),
  agencyArchiveAgent: (agentId: string) =>
    platform().command<{ agent: AgencyAgent }>('agency_agent_archive', { agent_id: agentId }),
  // -- agency_audit_v1 (auditoría del 21-oct): en un solo sitio, por si el Engine cambia un nombre.
  /** Vuelve a la Agency un agente archivado (no vuelve a los equipos de los que salió). */
  agencyUnarchiveAgent: (agentId: string) =>
    platform().command<{ agent: AgencyAgent }>('agency_agent_unarchive', { agent_id: agentId }),
  /** Solo un agente archivado: se lleva sus conversaciones, reglas y memoria. */
  agencyDeleteAgent: (agentId: string) =>
    platform().command<{ deleted: string; deleted_sessions: number; deleted_rules: number }>('agency_agent_delete', { agent_id: agentId }),
  /** Equipos listos para empezar (10.4). */
  /** Las plantillas de equipo del Engine, en el idioma de la app (el Engine cae al inglés). */
  agencyTemplates: (language?: string) =>
    platform()
      .command<{ templates: Array<{ id: string; team?: { name?: string; purpose?: string }; agents?: { name: string; role?: string }[] }> }>(
        'agency_templates_list',
        language ? { language } : {},
      )
      .then((result) => ({
        templates: result.templates.map((template): AgencyTemplateSummary => ({
          id: template.id,
          name: template.team?.name ?? template.id,
          purpose: template.team?.purpose ?? '',
          agents: (template.agents ?? []).map((agent) => ({ name: agent.name, role: agent.role ?? '' })),
        })),
      })),
  /** Crea el equipo de una plantilla con agentes nuevos; `model`: el de todos ellos (null: el de siempre). */
  agencyTeamFromTemplate: (templateId: string, model: string | null, language?: string) =>
    platform().command<{ team: AgencyTeam; agents: AgencyAgent[] }>('agency_team_from_template', { template_id: templateId, model, ...(language ? { language } : {}) }),
  agencyStatus: () => platform().command<AgencyStatus>('agency_status', { rinari_profile_id: 'active' }),
  /** «Detener a todos»: corta los turnos de los agentes y pausa sus reglas activas. */
  agencyStopAll: () =>
    platform().command<{ cancelled_turns: number; paused_rules: number; blocked_errands?: number }>('agency_stop_all', { rinari_profile_id: 'active' }),
  /** Después de «Detener a todos»: el tablero vuelve a trabajar (lo trabado sigue trabado). */
  agencyResume: () => platform().command<{ resumed: boolean; resumed_rules?: number; restored_errands?: number }>('agency_resume', { rinari_profile_id: 'active' }),
  /** La memoria propia de un agente (D-24); se edita y olvida con memoryApi. */
  agencyAgentMemory: (agentId: string) =>
    platform().command<{ records: MemoryRecord[]; count: number }>('agency_agent_memory_list', { agent_id: agentId }),
  agencyAgentRemember: (agentId: string, topic: string, text: string) =>
    platform().command<{ record: MemoryRecord }>('agency_agent_memory_add', { agent_id: agentId, topic, text, kind: null }),
  /** «Créalo con Rinari»: responde con un job; el borrador llega como `agency.draft.ready`. */
  agencyDraft: (description: string) =>
    platform().command<{ status: 'started'; job_id: string }>('agency_agent_draft', { description }),
  // Rinari Agency A2 (agency_teams_v1): equipos, oficina, pizarra y ajustes.
  agencyTeams: () =>
    platform().command<{ teams: AgencyTeam[] }>('agency_team_list', { rinari_profile_id: 'active' }),
  agencyTeam: (teamId: string) =>
    platform().command<{ team: AgencyTeam; errands: Errand[]; messages: OfficeMessage[] }>('agency_team_get', { team_id: teamId }),
  agencyCreateTeam: (team: AgencyTeamInput) =>
    platform().command<{ team: AgencyTeam }>('agency_team_create', {
      team: team as unknown as Record<string, unknown>,
      rinari_profile_id: null,
    }),
  agencyUpdateTeam: (teamId: string, patch: Partial<AgencyTeamInput>) =>
    platform().command<{ team: AgencyTeam }>('agency_team_update', {
      team_id: teamId,
      patch: patch as unknown as Record<string, unknown>,
    }),
  /** Archivar detiene el equipo del todo: turnos, esperas, recados y sus reglas. */
  agencyArchiveTeam: (teamId: string) =>
    platform().command<{ team: AgencyTeam; paused_rules?: number }>('agency_team_archive', { team_id: teamId }),
  agencyUnarchiveTeam: (teamId: string) =>
    platform().command<{ team: AgencyTeam; resumed_rules: number }>('agency_team_unarchive', { team_id: teamId }),
  agencyArchivedTeams: () =>
    platform().command<{ teams: AgencyTeam[] }>('agency_team_list', { rinari_profile_id: 'active', archived: true }),
  /** «Detener equipo»: ese equipo solo, hasta que el dueño lo reanude o escriba en su oficina. */
  agencyStopTeam: (teamId: string) =>
    platform().command<{ team: AgencyTeam; blocked_errands: number; paused_rules: number }>('agency_team_stop', { team_id: teamId }),
  agencyResumeTeam: (teamId: string) =>
    platform().command<{ team: AgencyTeam; restored_errands: number; resumed_rules: number }>('agency_team_resume', { team_id: teamId }),
  /** Solo un equipo archivado: se lleva sus conversaciones, reglas y memoria. */
  agencyDeleteTeam: (teamId: string) =>
    platform().command<{ deleted: string; deleted_sessions: number; deleted_rules: number }>('agency_team_delete', { team_id: teamId }),
  agencyJoinTeam: (teamId: string, agentId: string) =>
    platform().command<{ team: AgencyTeam }>('agency_team_join', { team_id: teamId, agent_id: agentId }),
  agencyLeaveTeam: (teamId: string, agentId: string) =>
    platform().command<{ team: AgencyTeam }>('agency_team_leave', { team_id: teamId, agent_id: agentId }),
  agencyTeamTemplate: (teamId: string) =>
    platform().command<{ template: TeamTemplate }>('agency_team_template', { team_id: teamId }),
  /** Plantilla (10.4): copia oficios, conectores marcados y presupuesto; nunca cuentas ni memoria. */
  agencyDuplicateTeam: (teamId: string, name: string, newAgents = true) =>
    platform().command<{ team: AgencyTeam }>('agency_team_duplicate', { team_id: teamId, name, new_agents: newAgents }),
  agencyTeamMemory: (teamId: string) =>
    platform().command<{ records: MemoryRecord[]; count: number }>('agency_team_memory_list', { team_id: teamId }),
  agencyTeamRemember: (teamId: string, topic: string, text: string) =>
    platform().command<{ record: MemoryRecord }>('agency_team_memory_add', { team_id: teamId, topic, text, kind: null }),
  agencyOffice: (teamId: string) =>
    platform().command<{ messages: OfficeMessage[] }>('agency_office_list', { team_id: teamId }),
  /** Solo una @mención despierta a un agente (D-1). */
  agencyOfficePost: (teamId: string, text: string) =>
    platform().command<{ message: OfficeMessage }>('agency_office_post', { team_id: teamId, text }),
  agencyCreateErrand: (teamId: string, errand: ErrandInput) =>
    platform().command<{ errand: Errand }>('agency_errand_create', {
      team_id: teamId,
      errand: errand as unknown as Record<string, unknown>,
    }),
  agencyErrands: (teamId: string) =>
    platform().command<{ errands: Errand[] }>('agency_errand_list', { team_id: teamId }),
  agencyReviewErrand: (errandId: string, accepted: boolean, reason?: string) =>
    platform().command<{ errand: Errand }>('agency_errand_review', { errand_id: errandId, accepted, reason: reason ?? null }),
  agencyCancelErrand: (errandId: string) =>
    platform().command<{ errand: Errand }>('agency_errand_cancel', { errand_id: errandId }),
  agencyRetryErrand: (errandId: string) =>
    platform().command<{ errand: Errand }>('agency_errand_retry', { errand_id: errandId }),
  agencySettings: () => platform().command<AgencySettingsData>('agency_settings_get'),
  agencySetSettings: (patch: { budget?: AgentBudget; errand_mode?: ErrandMode }) =>
    platform().command<AgencySettingsData>('agency_settings_set', {
      budget: patch.budget ?? null,
      errand_mode: patch.errand_mode ?? null,
    }),
  scheduleList: () => platform().command<{ tasks: ScheduledTask[]; now: number }>('schedule_list'),
  scheduleGet: (taskId: string) =>
    platform().command<{ task: ScheduledTask; runs: ScheduledRun[] }>('schedule_get', { task_id: taskId }),
  scheduleCreate: (task: ScheduledTaskInput) =>
    platform().command<{ task: ScheduledTask }>('schedule_create', { task: task as unknown as Record<string, unknown> }),
  scheduleUpdate: (taskId: string, patch: Partial<ScheduledTaskInput>) =>
    platform().command<{ task: ScheduledTask }>('schedule_update', { task_id: taskId, patch: patch as unknown as Record<string, unknown> }),
  scheduleDelete: (taskId: string) =>
    platform().command<{ deleted: boolean }>('schedule_delete', { task_id: taskId }),
  /** «Probar» una regla propuesta: responde con un job; el resultado llega como `schedule.rehearsed`. */
  scheduleRehearse: (task: ScheduledTaskInput) =>
    platform().command<{ status: 'started'; job_id: string }>('schedule_rehearse', { task: task as unknown as Record<string, unknown> }),
  /** Las últimas ejecuciones de una tarea (o regla), la más reciente primero. */
  scheduleRuns: (taskId: string, limit = 10) =>
    platform().command<{ runs: ScheduledRun[] }>('schedule_runs', { task_id: taskId, limit }),
  scheduleRunNow: (taskId: string) =>
    platform().command<{ run: ScheduledRun }>('schedule_run_now', { task_id: taskId }),
  /** «Permitir para esta tarea»: por tarea o por la sesión de la ejecución. */
  scheduleGrant: (input: { capability: string; target?: string | null; taskId?: string; sessionId?: string }) =>
    platform().command<{ task: ScheduledTask }>('schedule_grant', {
      capability: input.capability,
      target: input.target ?? null,
      task_id: input.taskId ?? null,
      session_id: input.sessionId ?? null,
    }),
  toolList: () => platform().command<{ tools: NativeTool[] }>("tool_list"),
  /** «Siempre en este proyecto» (o en los chats) guardado por el Engine. */
  permissionGrantsList: () =>
    platform().command<{ grants: PermissionGrant[] }>("permission_grants_list"),
  permissionGrantsRevoke: (id: string) =>
    platform().command<{ id: string; revoked: boolean }>("permission_grants_revoke", { id }),
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
  /** Ajustes → Avanzado: model execution with its own pair (plan 0.4.0 #96). */
  executionSettingsGet: () => platform().command<ExecutionSettingsResult>('execution_settings_get'),
  executionSettingsSet: (settings: ExecutionPolicy) => platform().command<ExecutionSettingsResult>('execution_settings_set', { settings }),
  /** The turn's limits and Ajustes → Permisos' switch: value, default and range of each. */
  advancedSettingsGet: () => platform().command<{ limits: AdvancedSetting[] }>('advanced_settings_get'),
  /** `null` puts the default back. */
  advancedSettingsSet: (values: Record<string, number | boolean | null>) => platform().command<{ limits: AdvancedSetting[] }>('advanced_settings_set', { values }),
  /** Red: proxy and certificates of every outgoing request of the Engine (plan 0.4.0 #96). */
  networkSettingsGet: () => platform().command<import('../types/protocol.generated').NetworkSettings>('network_settings_get'),
  networkSettingsSet: (patch: { proxy?: unknown; certificates?: unknown }) =>
    platform().command<import('../types/protocol.generated').NetworkSettings>('network_settings_set', { proxy: patch.proxy ?? null, certificates: patch.certificates ?? null }),
  /** «Probar conexión»: one request without credentials to each enabled provider. */
  networkTest: () => platform().command<import('../types/protocol.generated').NetworkTest>('network_test', { provider_ids: null }),
  /** How much each part of Rinari's folder takes. */
  storageUsage: () => platform().command<StorageUsage>('storage_usage'),
  /** Lo que el dueño contó de sí en la bienvenida (#71). */
  aboutGet: () => platform().command<AboutMe>('memory_about_get'),
  aboutSet: (about: { name: string | null; uses: string[]; preferences: string | null }) =>
    platform().command<AboutMe>('memory_about_set', { name: about.name ?? '', uses: about.uses, preferences: about.preferences ?? '' }),
  /** «Limpiar» un apartado de Almacenamiento (#91): nada se borra solo. */
  storageClean: (section: string) => platform().command<{ section: string; freed: number; removed: number; kept: number; usage: StorageUsage }>('storage_clean', { section }),
  contextSettingsGet: () => platform().command<import('../types/protocol.generated').ContextSettings>('context_settings_get'),
  // snake_case: el contrato lee `session_id`; con `sessionId` el Engine recibía
  // la petición sin sesión y la compactación manual fallaba.
  /** Compacts now; with `continueWith`, the same turn then sends that message. */
  contextCompact: (sessionId: string, continueWith?: string) =>
    platform().command('context_compact', { session_id: sessionId, continue_with: continueWith ?? null }),
  /** Capacity of a saved model, or of a session's model plus its measured use. */
  contextStatus: (target: { model_id?: string; session_id?: string }) =>
    platform().command<import('../types/protocol.generated').ContextStatus>('context_status', target),
  /** Every saved model's capacity in one call; `refresh` drops the discovery cache first. */
  contextModels: (refresh = false) =>
    platform().command<{ models: import('../features/context/contextStatus').ModelContext[] }>('context_models', { refresh }),
  contextSettingsSet: (settings: import('../types/protocol.generated').ContextSettings) => platform().command<import('../types/protocol.generated').ContextSettings>('context_settings_set', { settings }),
  visionSettingsSet: (settings: import('../types/protocol.generated').VisionSettings) => platform().command<import('../types/protocol.generated').VisionSettings>('vision_settings_set', { settings }),
  /** Ajustes → Creación de imágenes (plan 0.4.0 #28). `api_key` solo viaja de ida. */
  imagesSettingsGet: () => platform().command<import('../types/protocol.generated').ImageCreationSettings>('images_settings_get'),
  imagesSettingsSet: (settings: Omit<import('../types/protocol.generated').ImageCreationSettings, 'kinds' | 'subscriptions'>) =>
    platform().command<import('../types/protocol.generated').ImageCreationSettings>('images_settings_set', { settings }),
  imagesConnectorTest: (connector_id: string) =>
    platform().command<{ connector_id: string; ok: boolean; model?: string; code?: string; message?: string }>('images_connector_test', { connector_id }),
  /** «Volver a activar la visión»: olvida lo que Rinari aprendió de ese modelo (#14). */
  /** El sitio pide una verificación humana: la sesión sigue en un Chrome/Edge de verdad (plan 0.4.0 #45). */
  browserExternalOpen: (session_id: string, url: string) => platform().command<{ session_id: string; state: string }>('browser_external_open', { session_id, url }),
  visionModelReset: (modelId: string) => platform().command<import('../types/protocol.generated').VisionSettings>('vision_model_reset', { model_id: modelId }),
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
  /**
   * Mensaje para el turno en curso: Rinari lo lee al terminar el paso actual,
   * sin cortar nada. Sin turno en marcha es un mensaje normal (`queued`).
   */
  /** Message for the running turn; its files go with it (plan 0.4.0 #54). */
  turnSteer: (session_id: string, message: string, attachments: Array<AttachmentInput | AttachmentRef> = []) =>
    platform().command<SteerResult>("turn_steer", {
      session_id,
      message,
      attachments: attachments.length ? attachmentInputs(attachments) : null,
    }),
  /**
   * «Enviar ahora» (#31): Rinari lo lee ya. Corta la respuesta que está
   * escribiendo, pasa a segundo plano el comando en curso y una aprobación
   * pendiente cuenta como «no». El turno sigue.
   */
  turnSteerNow: (session_id: string, message: string, attachments: Array<AttachmentInput | AttachmentRef> = []) =>
    platform().command<SteerResult>("turn_steer_now", {
      session_id,
      message,
      attachments: attachments.length ? attachmentInputs(attachments) : null,
    }),
  /**
   * «Enviar ahora» sobre un mensaje que ya espera (P7, como Claude Code): el
   * Engine corta el paso en seco —la respuesta, la llamada que escribe, la
   * herramienta o la espera en curso— y lo lee ya. STEER_ALREADY_READ si lo leyó.
   */
  turnSteerPromote: (session_id: string, steer_id: string) =>
    platform().command<{ status: 'promoted'; steer_id: string; interrupted: string[] }>("turn_steer_promote", { session_id, steer_id }),
  /** Move a foreground command of this session to the background (#32). */
  /** La salida entera de un comando que el historial recortó (#91). */
  toolOutput: (session_id: string, tool_call_id: string) =>
    platform().command<{ tool_call_id: string; stdout: string | null; stderr: string | null; data?: unknown }>("session_tool_output", { session_id, tool_call_id }),
  toolBackground: (session_id: string, tool_call_id: string) =>
    platform().command<{ session_id: string; tool_call_id: string; requested: boolean }>("session_tool_background", { session_id, tool_call_id }),
  /** Edit an unread message sent during the turn; STEER_ALREADY_READ once read (#54). */
  turnSteerUpdate: (session_id: string, steer_id: string, message: string) =>
    platform().command<{ status: 'updated'; steer_id: string; message: string }>("turn_steer_update", { session_id, steer_id, message }),
  /** Withdraw an unread message sent during the turn (#54). */
  turnSteerCancel: (session_id: string, steer_id: string) =>
    platform().command<{ status: 'cancelled'; steer_id: string }>("turn_steer_cancel", { session_id, steer_id }),
  queueList: (session_id: string) =>
    platform().command<{
      session_id: string
      queue: string[]
      pending: number
      // Typed entries; absent on older engines.
      entries?: QueuedPromptEntry[]
    }>("queue_list", {
      session_id,
    }),
  queueClear: (session_id: string) =>
    platform().command<{ session_id: string; removed: number }>("queue_clear", { session_id }),
  queueResume: (session_id: string) =>
    platform().command<{ session_id: string; resumed: number }>("queue_resume", { session_id }),
  bundleList: () => platform().command<{ profiles: ProfileBundle[]; active_id?: string }>("bundle_list"),
  bundleActive: () => platform().command<{ active_id: string; profile: ProfileBundle }>('bundle_active'),
  /** Switch the workspace: new work goes there and the lists show its work. */
  bundleActivate: (id: string) =>
    platform().command<{ active_id: string; previous_id: string; profile: ProfileBundle }>('bundle_activate', { id }),
  bundleUpdate: (id: string, changes: Partial<Pick<ProfileBundle, 'name' | 'description' | 'soul_id' | 'mode' | 'agents'>>) =>
    platform().command<{ profile: ProfileBundle }>('bundle_update', {
      id,
      name: changes.name ?? null,
      description: changes.description ?? null,
      soul_id: 'soul_id' in changes ? changes.soul_id ?? null : null,
      mode: 'mode' in changes ? changes.mode ?? null : null,
      agents: changes.agents ?? null,
    }),
  /** Moves the project and every conversation in it. */
  projectMoveProfile: (projectId: string, rinariProfileId: string) =>
    platform().command<{ project: ProjectSummary; session_ids: string[] }>('project_move_profile', {
      project_id: projectId,
      rinari_profile_id: rinariProfileId,
    }),
  /** A loose conversation; one inside a project needs `projectPolicy`. */
  sessionMoveProfile: (sessionId: string, rinariProfileId: string, projectPolicy?: ProjectPolicy) =>
    platform().command<{ session?: SessionSummary; project?: ProjectSummary; session_ids?: string[] }>('session_move_profile', {
      session_id: sessionId,
      rinari_profile_id: rinariProfileId,
      project_policy: projectPolicy ?? null,
    }),
  bundleCreate: (input: {
    /** Advanced: without it the Engine makes one from the name (#86). */
    id?: string;
    name: string;
    description?: string;
    soul_id?: string;
    mode?: string;
    agents?: Record<string, { model?: string; fallback?: string }>;
  }) =>
    platform().command<{ profile: ProfileBundle }>("bundle_create", {
      id: input.id ?? null,
      name: input.name,
      description: input.description ?? null,
      soul_id: input.soul_id ?? null,
      mode: input.mode ?? null,
      agents: input.agents ?? null,
    }),
  bundleRemove: (id: string, reassignTo?: string) =>
    platform().command<{ removed: { id: string }; active_id?: string }>("bundle_remove", { id, reassign_to: reassignTo ?? null }),
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
    command?: SlashCommandRequest,
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
      command: command ?? null,
    })
  },
  /**
   * Implement or adjust a finished plan (plan 0.4.0 #55): no typed message.
   * The Engine checks the plan turn, writes the instruction, switches the
   * mode (BUILD to implement, PLAN to adjust) and, to implement, seeds the
   * checklist with the plan's steps. The turn's origin draws a separator.
   */
  startPlanTurn: (sessionId: string, origin: PlanTurnOrigin, reasoningEffort?: string | null) =>
    platform().command<{ status: string; turn_id: string; session_id: string }>("turn_start", {
      session_id: sessionId,
      message: '',
      reasoning_effort: reasoningEffort ?? null,
      attachments: [],
      origin,
    }),
  commandList: (sessionId?: string) =>
    platform().command<{ commands: SlashCommand[] }>('command_list', { session_id: sessionId ?? null }),
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
    patch: ProjectPatch,
  ) =>
    platform().command<{ project: ProjectSummary }>('project_update', {
      project_id: projectId,
      name: patch.name ?? null,
      description: patch.description ?? null,
      pinned: patch.pinned ?? null,
      archived: patch.archived ?? null,
      // '' lo quita: las conversaciones nuevas vuelven a Proyecto (P-5).
      permission_profile: patch.permission_profile ?? null,
    }),
  projectRemove: (projectId: string, sessionPolicy: 'keep' | 'archive' | 'delete' = 'archive') =>
    platform().command<{
      project: ProjectSummary;
      session_policy: string;
      sessions_affected: number;
      filesystem_deleted: false;
    }>('project_remove', { project_id: projectId, session_policy: sessionPolicy }),
  /** Borra un proyecto archivado y todo lo que Rinari guarda de él; nunca sus archivos. */
  projectDelete: (projectId: string) =>
    platform().command<{
      deleted: { id: string; root: string };
      sessions_deleted: number;
      filesystem_deleted: false;
    }>('project_delete', { project_id: projectId }),
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
  providerCatalog: () => platform().command<{ presets: ProtocolProviderPreset[]; version: string }>('provider_catalog_get'),
  providerUsage: (ref: string, refresh = false) => platform().command<ProviderUsageSnapshot>('provider_usage_get', { ref, refresh }),
  providerDiagnostics: (ref: string) => platform().command<Record<string, unknown>>('provider_diagnostics_get', { ref }),
  /** Estado de un runtime externo (CLI) antes de que exista el provider. */
  /** Sin ruta a propósito: tomarla dejaría a la UI hacer que el Engine ejecute cualquier programa. */
  providerRuntimeProbe: (runtime: string) =>
    platform().command<{ runtime: ExternalRuntimeStatus }>('provider_runtime_probe', { runtime }),
  /** Proveedores por CLI externo (Claude Subscription): apagados hasta que el dueño los active. */
  providerSettingsGet: () => platform().command<{ external_runtimes: boolean }>('provider_settings_get'),
  providerSettingsSet: (input: { external_runtimes: boolean }) =>
    platform().command<{ external_runtimes: boolean }>('provider_settings_set', input),
  providerAuthStart: (ref: string, method: 'browser' | 'device') => platform().command<ProviderAuthSnapshot>('provider_auth_start', { ref, method }),
  providerAuthGet: (ref: string, operation_id?: string) => platform().command<ProviderAuthSnapshot>('provider_auth_get', { ref, operation_id }),
  providerAuthCancel: (ref: string) => platform().command<ProviderAuthSnapshot>('provider_auth_cancel', { ref }),
  providerAuthLogout: (ref: string) => platform().command<ProviderAuthSnapshot>('provider_auth_logout', { ref }),
  providerCreate: (input: {
    alias: string;
    provider_type: string;
    auth_method?: string;
    endpoint?: string;
    account_hint?: string;
    secret?: string;
    secret_env?: string;
    settings?: Record<string, unknown>;
  }) =>
    platform().command<{ provider: ProviderSummary }>("provider_create", {
      alias: input.alias,
      provider_type: input.provider_type,
      auth_method: input.auth_method ?? null,
      endpoint: input.endpoint ?? null,
      account_hint: input.account_hint ?? null,
      secret: input.secret ?? null,
      secret_env: input.secret_env ?? null,
      settings: input.settings ?? null,
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
      enabled?: boolean;
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

  /** Without `includeDisabled`, a turned-off provider's models are left out (#97). */
  modelList: (provider?: string, includeDisabled?: boolean) =>
    platform().command<{ models: ModelSummary[] }>("model_list", {
      provider: provider ?? null,
      include_disabled: includeDisabled ?? null,
    }),
  modelGet: (reference: string, provider?: string) =>
    platform().command<{ model: ModelSummary }>("model_get", {
      reference,
      provider: provider ?? null,
    }),
  modelAdd: (input: { provider: string; provider_model_id: string; alias: string; capabilities?: Record<string, unknown> | null }) =>
    platform().command<{ model: ModelSummary }>("model_add", {
      provider: input.provider,
      provider_model_id: input.provider_model_id,
      alias: input.alias,
      capabilities: input.capabilities ?? null,
      settings: null,
    }),
  modelAlias: (reference: string, newAlias: string, provider?: string) =>
    platform().command<{ model: ModelSummary }>("model_alias", {
      reference,
      new_alias: newAlias,
      provider: provider ?? null,
    }),
  /** Models the owner removed: hidden from refreshes until «Mostrar» (#93). */
  modelHiddenList: (provider: string) => platform().command<{ hidden: string[] }>('model_hidden_list', { provider }),
  modelUnhide: (provider: string, providerModelId: string) =>
    platform().command<{ model: ModelSummary }>('model_unhide', { provider, provider_model_id: providerModelId }),
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
      /** Aliases the Engine saved, per provider (#93). */
      added?: Record<string, string[]>;
    }>('model_discovery_start', { provider: provider ?? null }),
  /** `addNew` also saves the models a provider started offering (desktop refresh). */
  modelRefresh: (provider?: string, addNew = false) =>
    platform().command<ModelRefreshResult>("model_refresh", { provider: provider ?? null, add_new: addNew }),
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
      ...((item as AttachmentRef).keepImage ?? (item as AttachmentInput).keep_image ? { keep_image: true } : {}),
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
    durationS: item.duration_s ?? attachments.durationS,
    images: item.images || attachments.images,
    ocr: item.ocr ?? attachments.ocr,
    keepImage: item.ocr ? (item.keep_image ?? attachments.keepImage) : undefined,
    coverage: readingCoverage(item.coverage) ?? (item.kind === 'pdf' ? undefined : attachments.coverage),
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
    if (!original) throw new Error(uiText('attach.errorMissing'))
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
    if (options.signal?.aborted) throw new DOMException(uiText('attach.errorCancelled'), 'AbortError')
    const status = String(state.status ?? 'preparing').toLowerCase()
    if (isTerminalPreparationStatus(status)) {
      if (['error', 'failed', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(typeof state.error === 'string' ? state.error : uiText('attach.errorStatus', { status }))
      }
      const prepared = Array.isArray(state.attachments) ? state.attachments as PreparedAttachmentResult[] : []
      if (prepared.length === 0) throw new Error(uiText('attach.errorEmpty'))
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

export type { FlowResult, FlowStage, FlowSummary, MessageOrigin, QueuedPromptEntry }
