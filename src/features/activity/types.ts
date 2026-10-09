import type { ChatMessage, PendingApproval, TurnStopReason } from '../../types'
import type { MessageOrigin, TimelineTurn } from '../../services/engine'
import type { TurnChangedFile } from '../../services/engine'

export type TimelineStatus =
  | 'running'
  | 'approval'
  | 'cancelling'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'stopped'

interface TimelineItemBase {
  id: string
  type: 'model' | 'tool' | 'approval' | 'agent' | 'context' | 'verification' | 'changeset' | 'system' | 'question' | 'vision' | 'steer' | 'memory' | 'skill'
  activitySeq: number
  occurredAt: number
}

export interface ModelTimelineItem extends TimelineItemBase {
  type: 'model'
  modelCallId: string
  status: 'thinking' | 'streaming' | 'completed' | 'failed'
  content: string
  outputKind?: 'progress' | 'final'
  model?: string
  durationMs?: number
  /** `model.changed`: este es el primer texto de otro modelo que el anterior que escribió. */
  modelChange?: ModelChange
  /** `model.retrying`: la llamada falló de forma transitoria y se repite. */
  retry?: ModelRetry
}

export interface ModelRetry {
  attempt: number
  maxAttempts: number
  /** SERVER_ERROR, RATE_LIMIT, TIMEOUT, STREAM_INTERRUPTED, NETWORK… */
  reason: string
}

/** Un modelo tal como se llamaba cuando el Engine registró el cambio. */
export interface ModelLabel {
  modelId: string
  alias?: string
  providerModelId?: string
  providerAlias?: string
}

export interface ModelChange {
  /** Sin nombre si el modelo anterior ya no existe y nunca se registró. */
  previous: ModelLabel
  next: ModelLabel
}

export interface ToolTimelineItem extends TimelineItemBase {
  type: 'tool'
  toolCallId: string
  tool: string
  modelCallId?: string
  status: 'requested' | 'running' | 'completed' | 'failed' | 'cancelled'
  filePath?: string
  arguments?: string
  result?: string
  error?: string
  durationMs?: number
  presentation?: ToolPresentation
}

export interface ToolPresentation {
  file_paths?: string[]
  kind: 'command' | 'tool' | 'image'
  image?: import('../../types/protocol.generated').ViewedImage
  tool?: string
  status?: 'success' | 'failed' | 'running'
  stderr_warning?: boolean
  command?: string | string[]
  cwd?: string
  exit_code?: number | null
  stdout?: string
  stderr?: string
  running?: boolean
  truncated?: boolean
  /** The persisted full-capture artifact reached its hard byte limit. */
  capture_truncated?: boolean
  artifacts?: string[]
  stream_sequences?: Record<string, number>
  data?: unknown
  error?: { code?: string; message?: string; retryable?: boolean }
}

export interface ApprovalTimelineItem extends TimelineItemBase {
  type: 'approval'
  approvalId: string
  status: 'pending' | 'resolving' | 'allowed' | 'denied' | 'expired'
  capability: string
  target?: string
  risk: string
  description: string
  decision?: string
  choices?: string[]
  ruleId?: string
  reusable?: boolean
  /** Dónde queda «Siempre…»: este proyecto o todos los chats sueltos. */
  grantScope?: 'project' | 'chats'
}

export interface ChangeSetTimelineItem extends TimelineItemBase {
  type: 'changeset'
  changesetId: string
  turnId: string
  status: 'active' | 'undoing' | 'undone' | 'partially_undone' | 'conflicted'
  additions: number
  deletions: number
  undoable: boolean
  attributionComplete: boolean
  warnings: string[]
  files: TurnChangedFile[]
}

export interface AgentTimelineItem extends TimelineItemBase {
  type: 'agent'
  agentId: string
  phase: 'started' | 'terminal'
  status: 'running' | 'completed' | 'failed'
  agent: string
  objective?: string
  items?: TimelineItem[]
  summary?: string
  cwd?: string
  profile?: string
}

export interface ContextTimelineItem extends TimelineItemBase {
  sessionId?: string
  error?: string
  reason?: string
  /** Why a manual compaction changed nothing (`empty_history`, `only_latest_exchange`, `summary_not_smaller`). */
  skipReason?: string
  contextDetails?: Record<string, unknown>
    type: 'context'
    status: 'running' | 'completed' | 'skipped' | 'failed' | 'cancelled'
  pressure?: number
}

export interface VerificationTimelineItem extends TimelineItemBase {
  type: 'verification'
  status: 'running' | 'completed' | 'failed'
  outcome?: string
  detail?: string
}

export interface SystemTimelineItem extends TimelineItemBase {
  type: 'system'
  kind: 'turn_preparing' | 'governor' | 'terminal' | 'reasoning_dropped'
  status?: string
  label?: string
}

export interface QuestionTimelineItem extends TimelineItemBase {
  type: 'question'
  request: import('../../services/desktop').QuestionRequest
}

export interface VisionTimelineItem extends TimelineItemBase {
  generation?: Record<string, unknown>
  origin?: string
  messageRef?: string
  toolCallId?: string
  type: 'vision'
  status: 'preparing' | 'queued' | 'running' | 'partial' | 'completed' | 'failed' | 'cancelled'
  route: string
  modelId: string
  providerName: string
  modelName: string
  question: string
  analysis: string
  error?: string
  /** `without_images`: el modelo no ve imágenes y el turno siguió sin ellas. */
  fallback?: string
  images: import('../../types/protocol.generated').ViewedImage[]
  cached: boolean
}

/**
 * Mensaje que enviaste mientras el turno corría. `pending` hasta que el
 * Engine lo pone en el historial (`steer.applied`), tras el paso en curso.
 */
export interface SteerTimelineItem extends TimelineItemBase {
  type: 'steer'
  steerId: string
  content: string
  status: 'pending' | 'applied'
}

/**
 * Memoria dentro del turno: una propuesta de Rinari (`memory.candidate.*`,
 * modo «Preguntar») o algo que ya guardó sola (`memory.remembered`, modo
 * «Automático»). Se muestra fuera de la actividad plegada.
 */
export interface MemoryTimelineItem extends TimelineItemBase {
  type: 'memory'
  memoryEvent: 'candidate' | 'remembered'
  candidateId?: string
  memoryId?: string
  topic: string
  text: string
  kind?: string
  scope?: string
  reason?: string
  sensitive?: boolean
  /** Propuestas: `pending` hasta `memory.candidate.resolved`. Recuerdos: `remembered`. */
  status: 'pending' | 'approved' | 'denied' | 'remembered'
}

/** Otra skill instalada que se parece a la propuesta, con el motivo del modelo. */
export interface SkillSimilar {
  name: string
  score?: number
  shared: string[]
  reason?: string
}

/**
 * Skill propuesta o guardada en este turno (`skill.proposed`), con su
 * resolución (`skill.proposal.resolved`). Se muestra fuera de la actividad.
 */
export interface SkillTimelineItem extends TimelineItemBase {
  type: 'skill'
  name: string
  /** `pending`: espera al dueño. `active`: ya guardada (pidió /learn o /lesson, o mejora una aprendida). */
  status: 'pending' | 'active' | 'approved' | 'rejected' | 'undone'
  version?: string
  previousVersion?: string
  update: boolean
  description: string
  similarTo: SkillSimilar[]
  replaces: string[]
  review?: string
  pendingReason?: string
  /** Lo que una fusión apagó (al aprobar) o volvió a encender (al deshacer). */
  turnedOff?: string[]
  turnedOn?: string[]
}

export type TimelineItem =
  | MemoryTimelineItem
  | SkillTimelineItem
  | SteerTimelineItem
  | VisionTimelineItem
  | QuestionTimelineItem
  | ModelTimelineItem
  | ToolTimelineItem
  | ApprovalTimelineItem
  | AgentTimelineItem
  | ContextTimelineItem
  | VerificationTimelineItem
  | ChangeSetTimelineItem
  | SystemTimelineItem

export interface TurnTimeline {
  usage?: import('../../types/protocol.generated').TurnTokenUsage
  /** Engine without turn aggregates: deduplicate reported calls locally. */
  legacyUsage?: Record<string, Record<string, unknown>>
  mode?: string | null
  turnId: string
  sessionId: string
  turnIndex?: number
  status: TimelineStatus
  startedAt: number
  completedAt?: number
  userMessage: string
  items: TimelineItem[]
  stopReason?: TurnStopReason
  errorDetails?: Record<string, unknown>
  error?: string
  /** Código del error terminal (`PROVIDER_MODEL_FAILURE`…) y si se puede reintentar. */
  errorCode?: string
  errorRetryable?: boolean
  /** Procedencia del turno (peer / reenvío); `undefined` = petición del usuario. */
  origin?: MessageOrigin | null
}

export interface TurnTimelineState {
  threads: Record<string, ChatMessage[]>
  timelines: Record<string, TurnTimeline>
  busySessions: Set<string>
  approvals: PendingApproval[]
}

export type PersistedTimelineTurn = TimelineTurn
