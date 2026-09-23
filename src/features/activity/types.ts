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
  type: 'model' | 'tool' | 'approval' | 'agent' | 'context' | 'verification' | 'changeset' | 'system' | 'question' | 'vision'
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
  kind: 'turn_preparing' | 'governor' | 'terminal'
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
  images: import('../../types/protocol.generated').ViewedImage[]
  cached: boolean
}

export type TimelineItem =
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
