import type { ChatMessage, PendingApproval, TurnStopReason } from '../../types'
import type { EngineEventMsg, TimelineTurn, TurnChangedFile } from '../../services/engine'
import type {
  ApprovalTimelineItem,
  TimelineItem,
  TimelineStatus,
  ToolTimelineItem,
  ToolPresentation,
  TurnTimeline,
  TurnTimelineState,
} from './types'

export const TRIGGERS_SESSION_REFRESH = new Set([
  'turn.started',
  'turn.completed',
  'turn.stopped',
  'session.mode.changed',
  'session.model.changed',
])

export type TimelineAction =
  | { type: 'engine/event'; event: EngineEventMsg; now: number }
  | { type: 'message/sent'; sessionId: string; message: ChatMessage }
  | { type: 'turn/ack'; turnId: string; sessionId: string; now: number }
  | { type: 'turn/cancelling'; sessionId: string }
  | { type: 'busy/set'; sessionId: string; busy: boolean }
  | { type: 'history/loaded'; sessionId: string; messages: ChatMessage[] }
  | { type: 'timeline/loaded'; sessionId: string; turns: TimelineTurn[] }
  | { type: 'snapshot/restored'; snapshot: unknown; now: number }
  | { type: 'approval/resolving'; approvalId: string }
  | { type: 'approval/pending'; approvalId: string }

export function createInitialTimelineState(): TurnTimelineState {
  return { threads: {}, timelines: {}, busySessions: new Set(), approvals: [] }
}

function parseTime(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000
  const parsed = Date.parse(String(value ?? ''))
  return Number.isNaN(parsed) ? fallback : parsed
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function busyCopy(current: Set<string>, sessionId: string, busy: boolean): Set<string> {
  const next = new Set(current)
  if (busy) next.add(sessionId)
  else next.delete(sessionId)
  return next
}

function defaultTimeline(turnId: string, sessionId: string, now: number): TurnTimeline {
  return {
    turnId,
    sessionId,
    status: 'running',
    startedAt: now,
    userMessage: '',
    items: [],
  }
}

function itemId(event: string, payload: Record<string, unknown>): string {
  if (event.startsWith('vision.')) return `vision:${payload.vision_id}:${payload.attempt_id ?? 1}`
  if (event.startsWith('turn.changes.')) return `changeset:${payload.id || payload.changeset_id || 'turn'}`
  if (event.startsWith('question.')) return `question:${payload.request_id}`
  if (event.startsWith('agent.') && payload.agent_id) return `agent:${payload.agent_id}`
  if (payload.tool_call_id) return `tool:${payload.tool_call_id}`
  if (event.startsWith('model.')) return `model:${payload.model_call_id || 'legacy'}`
  if (payload.approval_id) return `approval:${payload.approval_id}`
  if (payload.agent_id) return `agent:${payload.agent_id}`
  if (event.startsWith('verification.')) return 'verification:completion-gate'
  if (event === 'governor.compact') return `context:${payload.compaction_id ?? payload.activity_seq ?? 0}`
  return `system:${payload.activity_seq ?? event}`
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const message = (value as Record<string, unknown>).message
    if (typeof message === 'string') return message
  }
  return undefined
}

function presentation(value: unknown): ToolPresentation | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const kind = raw.kind === 'command' ? 'command' : raw.kind === 'image' ? 'image' : 'tool'
  const image = raw.image && typeof raw.image === 'object' ? raw.image as Record<string, unknown> : undefined
  return {
    kind,
    image: image && typeof image.uri === 'string' && image.uri.startsWith('artifact://')
      ? { uri: image.uri, name: text(image.name), path: text(image.path),
          width: Number(image.width) || 0, height: Number(image.height) || 0 }
      : undefined,
    tool: text(raw.tool) || undefined,
    status: raw.status === 'failed' || raw.status === 'running' ? raw.status : 'success',
    stderr_warning: raw.stderr_warning === true,
    command: typeof raw.command === 'string' || Array.isArray(raw.command)
      ? raw.command as string | string[]
      : undefined,
    cwd: text(raw.cwd) || undefined,
    exit_code: typeof raw.exit_code === 'number' ? raw.exit_code : raw.exit_code === null ? null : undefined,
    stdout: text(raw.stdout),
    stderr: text(raw.stderr),
    running: typeof raw.running === 'boolean' ? raw.running : undefined,
    truncated: raw.truncated === true,
    capture_truncated: raw.capture_truncated === true,
    artifacts: Array.isArray(raw.artifacts) ? raw.artifacts.filter((item): item is string => typeof item === 'string') : undefined,
    stream_sequences: raw.stream_sequences && typeof raw.stream_sequences === 'object'
      ? Object.fromEntries(Object.entries(raw.stream_sequences).filter(([, value]) => typeof value === 'number')) as Record<string, number>
      : undefined,
    data: raw.data,
    error: raw.error && typeof raw.error === 'object' ? {
      code: text((raw.error as Record<string, unknown>).code) || undefined,
      message: text((raw.error as Record<string, unknown>).message) || undefined,
      retryable: (raw.error as Record<string, unknown>).retryable === true,
    } : undefined,
  }
}

function mergeEventItem(
  current: TimelineItem | undefined,
  event: string,
  payload: Record<string, unknown>,
  now: number,
): TimelineItem | null {
  const id = itemId(event, payload)
  const activitySeq = number(payload.activity_seq) ?? current?.activitySeq ?? Number.MAX_SAFE_INTEGER
  const occurredAt = parseTime(payload.occurred_at, current?.occurredAt ?? now)
  if (event.startsWith('model.')) {
    const prior = current?.type === 'model' ? current : undefined
    const delta = event === 'model.content.delta' ? text(payload.delta) : ''
    return {
      id,
      type: 'model',
      activitySeq,
      occurredAt,
      modelCallId: text(payload.model_call_id),
      status:
        event === 'model.failed'
          ? 'failed'
          : event === 'model.completed' || event === 'model.content.completed'
            ? 'completed'
            : delta
              ? 'streaming'
              : 'thinking',
      content:
        event === 'model.content.completed'
          ? text(payload.content)
          : text(payload.content) || `${prior?.content ?? ''}${delta}`,
      outputKind:
        payload.output_kind === 'progress' || payload.output_kind === 'final'
          ? payload.output_kind
          : prior?.outputKind,
      model: text(payload.model) || prior?.model,
      durationMs: number(payload.duration_ms) ?? prior?.durationMs,
    }
  }
  if (event.startsWith('vision.')) {
    const prior = current?.type === 'vision' ? current : undefined
    return { id, type: 'vision', activitySeq, occurredAt,
      generation: payload.generation && typeof payload.generation === 'object' ? payload.generation as Record<string, unknown> : prior?.generation,
      origin: text(payload.origin) || prior?.origin, messageRef: text(payload.message_ref) || prior?.messageRef, toolCallId: text(payload.tool_call_id) || prior?.toolCallId,
      status: event.endsWith('partial') ? 'partial' : event.endsWith('queued') ? 'queued' : event.endsWith('preparing') ? 'preparing' : event.endsWith('completed') ? 'completed' : event.endsWith('failed') ? 'failed' : event.endsWith('cancelled') ? 'cancelled' : 'running',
      route: text(payload.route) || prior?.route || '', modelId: text(payload.model_id) || prior?.modelId || '',
      providerName: text(payload.provider_name) || prior?.providerName || '', modelName: text(payload.model_name) || prior?.modelName || '',
      question: text(payload.question) || prior?.question || '', analysis: text(payload.analysis) || prior?.analysis || '',
      error: errorMessage(payload.error), cached: payload.cached === true,
      images: Array.isArray(payload.images) ? payload.images.flatMap(image => {
        const parsed = presentation({ kind: 'image', image })?.image
        return parsed ? [parsed] : []
      }) : prior?.images || [],
    }
  }
  if (event.startsWith('tool.')) {
    const prior = current?.type === 'tool' ? current : undefined
    if (event === 'tool.output.delta' && prior && ['completed', 'failed', 'cancelled'].includes(prior.status)) return prior
    let nextPresentation = presentation(payload.presentation) ?? prior?.presentation
    if (event === 'tool.output.delta') {
      const stream = text(payload.stream)
      const delta = text(payload.delta)
      if ((stream === 'stdout' || stream === 'stderr') && delta) {
        const base = nextPresentation ?? { kind: 'command' as const, tool: text(payload.tool), status: 'running' as const }
        const existing = base[stream] ?? ''
        const sequence = number(payload.stream_seq)
        const previous = base.stream_sequences?.[stream] ?? 0
        if (sequence === undefined || sequence > previous) {
          const combined = existing + delta
          nextPresentation = {
            ...base,
            status: 'running',
            [stream]: combined.slice(0, 64_000),
            truncated: base.truncated || combined.length > 64_000,
            stream_sequences: { ...base.stream_sequences, [stream]: sequence ?? previous + 1 },
          }
        }
      }
    }
    const status: ToolTimelineItem['status'] = event.endsWith('completed')
      ? 'completed'
      : event.endsWith('failed')
        ? 'failed'
        : event.endsWith('cancelled')
          ? 'cancelled'
          : event.endsWith('started')
            ? 'running'
            : event === 'tool.output.delta'
              ? prior?.status === 'running' || prior?.status === 'requested' ? prior.status : 'running'
            : 'requested'
    return {
      id,
      type: 'tool',
      activitySeq,
      occurredAt,
      toolCallId: text(payload.tool_call_id),
      tool: text(payload.tool) || prior?.tool || 'tool',
      modelCallId: text(payload.model_call_id) || prior?.modelCallId,
      status,
      filePath: text(payload.file_path) || prior?.filePath,
      arguments: text(payload.arguments) || prior?.arguments,
      result: text(payload.result) || prior?.result,
      error: errorMessage(payload.error) ?? prior?.error,
      durationMs: number(payload.duration_ms) ?? prior?.durationMs,
      presentation: nextPresentation,
    }
  }
  if (event.startsWith('approval.')) {
    const prior = current?.type === 'approval' ? current : undefined
    const decision = text(payload.decision)
    const status: ApprovalTimelineItem['status'] = event.endsWith('expired')
      ? 'expired'
      : event.endsWith('resolved')
        ? decision === 'deny'
          ? 'denied'
          : 'allowed'
        : 'pending'
    return {
      id,
      type: 'approval',
      activitySeq,
      occurredAt,
      approvalId: text(payload.approval_id),
      status,
      capability: text(payload.capability) || text(payload.tool) || prior?.capability || '',
      target: text(payload.target) || prior?.target,
      risk: text(payload.risk) || prior?.risk || 'medium',
      description: text(payload.description) || prior?.description || '',
      decision: decision || prior?.decision,
      choices: Array.isArray(payload.choices)
        ? payload.choices.filter((choice): choice is string => typeof choice === 'string')
        : prior?.choices,
      ruleId: text(payload.rule_id) || prior?.ruleId,
      reusable: typeof payload.reusable === 'boolean' ? payload.reusable : prior?.reusable,
    }
  }
  if (event.startsWith('turn.changes.')) {
    const prior = current?.type === 'changeset' ? current : undefined
    const files = Array.isArray(payload.files)
      ? payload.files.filter(
          (file): file is TurnChangedFile => Boolean(file && typeof file === 'object'),
        )
      : prior?.files ?? []
    const eventStatus = text(payload.status)
    return {
      id,
      type: 'changeset',
      activitySeq,
      occurredAt,
      changesetId: text(payload.id) || text(payload.changeset_id) || prior?.changesetId || '',
      turnId: text(payload.turn_id) || prior?.turnId || '',
      status: event.endsWith('started')
        ? 'undoing'
        : event.endsWith('conflict')
          ? 'conflicted'
          : eventStatus === 'undone' || eventStatus === 'partially_undone'
            ? eventStatus
            : prior?.status ?? 'active',
      additions: number(payload.additions) ?? prior?.additions ?? 0,
      deletions: number(payload.deletions) ?? prior?.deletions ?? 0,
      undoable: typeof payload.undoable === 'boolean' ? payload.undoable : prior?.undoable ?? false,
      attributionComplete: typeof payload.attribution_complete === 'boolean'
        ? payload.attribution_complete
        : prior?.attributionComplete ?? true,
      warnings: Array.isArray(payload.warnings)
        ? payload.warnings.filter((warning): warning is string => typeof warning === 'string')
        : prior?.warnings ?? [],
      files,
    }
  }
  if (event.startsWith('question.')) {
    return { id, type: 'question', activitySeq, occurredAt, request: payload as unknown as import('../../services/desktop').QuestionRequest }
  }
  if (event.startsWith('agent.')) {
    const prior = current?.type === 'agent' ? current : undefined
    let children = prior?.items ?? []
    if (event === 'agent.activity' && typeof payload.child_event === 'string' && !payload.child_event.startsWith('agent.')) {
      const childPayload = { ...payload }
      delete childPayload.agent_id
      delete childPayload.child_event
      const childId = itemId(payload.child_event, childPayload)
      const child = mergeEventItem(children.find(item => item.id === childId), payload.child_event, childPayload, now)
      if (child) children = children.some(item => item.id === childId)
        ? children.map(item => item.id === childId ? child : item) : [...children, child]
    }
    return {
      id, type: 'agent', activitySeq: prior?.activitySeq ?? activitySeq, occurredAt: prior?.occurredAt ?? occurredAt,
      agentId: text(payload.agent_id),
      phase: event === 'agent.completed' || event === 'agent.failed' ? 'terminal' : prior?.phase ?? 'started',
      status: event === 'agent.completed' ? 'completed' : event === 'agent.failed' ? 'failed' : prior?.status ?? 'running',
      agent: text(payload.agent) || prior?.agent || 'Agent',
      objective: text(payload.objective) || prior?.objective,
      items: children, summary: text(payload.summary) || text(payload.error) || prior?.summary,
      cwd: text(payload.cwd) || prior?.cwd, profile: text(payload.profile) || prior?.profile,
    }
  }
  if (event === 'governor.compact') {
    return {
      id,
      type: 'context',
      sessionId: text(payload.session_id) || undefined,
      error: text(payload.error) || undefined,
      reason: text(payload.reason) || undefined,
      contextDetails: { window: payload.window_tokens, source: payload.window_source, used: payload.used_tokens, after: payload.after_tokens, accounting: payload.usage_source },
      activitySeq,
      occurredAt,
      status:
        payload.status === 'failed' ? 'failed' : payload.status === 'cancelled' ? 'cancelled' : payload.status === 'completed' ? 'completed' : payload.status === 'skipped' ? 'skipped' : 'running',
      pressure: number(payload.pressure),
    }
  }
  if (event.startsWith('verification.')) {
    return {
      id,
      type: 'verification',
      activitySeq,
      occurredAt,
      status: event.endsWith('completed') ? 'completed' : event.endsWith('failed') ? 'failed' : 'running',
      outcome: text(payload.outcome) || undefined,
      detail: errorMessage(payload.error),
    }
  }
  if (event === 'turn.preparing' || event.startsWith('governor.')) {
    return {
      id,
      type: 'system',
      activitySeq,
      occurredAt,
      kind: event === 'turn.preparing' ? 'turn_preparing' : 'governor',
      status: text(payload.status) || text(payload.action),
      label: text(payload.reason) || text(payload.stage),
    }
  }
  return null
}

function mergeIntoTimeline(
  timeline: TurnTimeline,
  event: string,
  payload: Record<string, unknown>,
  now: number,
): TurnTimeline {
  const id = itemId(event, payload)
  const index = timeline.items.findIndex((item) => item.id === id)
  const item = mergeEventItem(index >= 0 ? timeline.items[index] : undefined, event, payload, now)
  if (!item) return timeline
  const items = index >= 0
    ? timeline.items.map((value, itemIndex) => (itemIndex === index ? item : value))
    : [...timeline.items, item]
  items.sort((a, b) => a.activitySeq - b.activitySeq || a.occurredAt - b.occurredAt)
  return { ...timeline, items }
}

function terminalStatus(event: string): TimelineStatus | null {
  if (event === 'turn.completed') return 'completed'
  if (event === 'turn.cancelled') return 'cancelled'
  if (event === 'turn.failed') return 'failed'
  if (event === 'turn.stopped') return 'stopped'
  return null
}

function normalizePersistedTurn(turn: TimelineTurn): TurnTimeline {
  let timeline: TurnTimeline = {
    turnId: turn.turn_id,
    sessionId: turn.session_id,
    turnIndex: turn.turn_index,
    mode: turn.mode,
    status: (terminalStatus(`turn.${turn.status}`) ?? 'running'),
    startedAt: parseTime(turn.started_at, 0),
    completedAt: turn.completed_at ? parseTime(turn.completed_at, 0) : undefined,
    userMessage: turn.user_message,
    error: errorMessage(turn.terminal?.error),
    errorDetails: turn.terminal?.error && typeof turn.terminal.error === 'object'
      ? (turn.terminal.error as { details?: Record<string, unknown> }).details : undefined,
    items: [],
  }
  for (const item of turn.items) {
    timeline = mergeIntoTimeline(timeline, item.event, item as Record<string, unknown>, timeline.startedAt)
  }
  if (turn.final_response && !timeline.items.some((item) => item.type === 'model' && item.outputKind === 'final')) {
    timeline = mergeIntoTimeline(timeline, 'model.content.completed', {
      turn_id: turn.turn_id,
      session_id: turn.session_id,
      model_call_id: 'persisted-final',
      activity_seq: Number.MAX_SAFE_INTEGER - 1,
      content: turn.final_response,
      output_kind: 'final',
      occurred_at: turn.completed_at ?? turn.started_at,
    }, timeline.startedAt)
  }
  return timeline
}

export function turnTimelineReducer(state: TurnTimelineState, action: TimelineAction): TurnTimelineState {
  if (action.type === 'message/sent') {
    return {
      ...state,
      threads: {
        ...state.threads,
        [action.sessionId]: [...(state.threads[action.sessionId] ?? []), action.message],
      },
    }
  }
  if (action.type === 'busy/set') {
    return { ...state, busySessions: busyCopy(state.busySessions, action.sessionId, action.busy) }
  }
  if (action.type === 'history/loaded') {
    const live = state.threads[action.sessionId] ?? []
    const ids = new Set(action.messages.map((message) => message.id))
    return {
      ...state,
      threads: {
        ...state.threads,
        [action.sessionId]: [...action.messages, ...live.filter((message) => !ids.has(message.id))],
      },
    }
  }
  if (action.type === 'timeline/loaded') {
    const timelines = { ...state.timelines }
    for (const row of action.turns) {
      const incoming = normalizePersistedTurn(row)
      const current = timelines[incoming.turnId]
      if (!current) timelines[incoming.turnId] = incoming
      else {
        const incomingTerminal = incoming.status !== 'running'
        let merged = {
          ...incoming,
          ...current,
          status: incomingTerminal ? incoming.status : current.status,
          completedAt: incomingTerminal ? incoming.completedAt : current.completedAt,
          error: incomingTerminal ? incoming.error : current.error,
          errorDetails: incomingTerminal ? incoming.errorDetails : current.errorDetails,
          stopReason: incomingTerminal ? incoming.stopReason : current.stopReason,
          items: incoming.items,
        }
        for (const item of current.items) {
          const existing = merged.items.findIndex((value) => value.id === item.id)
          merged.items = existing >= 0
            ? merged.items.map((value, index) => index === existing ? { ...value, ...item } as TimelineItem : value)
            : [...merged.items, item]
        }
        merged.items.sort((a, b) => a.activitySeq - b.activitySeq)
        timelines[incoming.turnId] = merged
      }
    }
    const busySessions = new Set(state.busySessions)
    for (const row of action.turns) {
      if (!Object.values(timelines).some((turn) => turn.sessionId === row.session_id &&
        ['running', 'approval', 'cancelling'].includes(turn.status))) busySessions.delete(row.session_id)
    }
    return { ...state, timelines, busySessions }
  }
  if (action.type === 'turn/ack') {
    const current = state.timelines[action.turnId] ?? defaultTimeline(action.turnId, action.sessionId, action.now)
    const thread = state.threads[action.sessionId] ?? []
    let bound = false
    const threads = {
      ...state.threads,
      [action.sessionId]: thread.map((message, index) => {
        if (bound || message.role !== 'user' || message.turnId) return message
        if (thread.slice(index + 1).some((later) => later.role === 'user' && !later.turnId)) return message
        bound = true
        return { ...message, turnId: action.turnId }
      }),
    }
    const user = threads[action.sessionId].find((message) => message.turnId === action.turnId)?.content ?? ''
    return {
      ...state,
      threads,
      timelines: { ...state.timelines, [action.turnId]: { ...current, userMessage: current.userMessage || user } },
      busySessions: busyCopy(state.busySessions, action.sessionId, true),
    }
  }
  if (action.type === 'turn/cancelling') {
    const active = Object.values(state.timelines).find(
      (timeline) => timeline.sessionId === action.sessionId && timeline.status === 'running',
    )
    if (!active) return state
    return {
      ...state,
      timelines: {
        ...state.timelines,
        [active.turnId]: {
          ...active,
          status: 'cancelling',
          items: active.items.map((item) => item.type === 'approval' && item.status === 'pending' ? { ...item, status: 'resolving' } : item),
        },
      },
      approvals: state.approvals.map((item) => item.session_id === action.sessionId ? { ...item, status: 'resolving' } : item),
    }
  }
  if (action.type === 'approval/resolving' || action.type === 'approval/pending') {
    const timelines = { ...state.timelines }
    for (const [turnId, timeline] of Object.entries(timelines)) {
      timelines[turnId] = {
        ...timeline,
        items: timeline.items.map((item) =>
          item.type === 'approval' && item.approvalId === action.approvalId
            ? { ...item, status: action.type === 'approval/resolving' ? 'resolving' : 'pending' }
            : item,
        ),
      }
    }
    return { ...state, timelines }
  }
  if (action.type === 'snapshot/restored') {
    const snapshot = action.snapshot && typeof action.snapshot === 'object'
      ? action.snapshot as Record<string, unknown>
      : {}
    const active = Array.isArray(snapshot.active_turns) ? snapshot.active_turns : []
    let next = state
    for (const raw of active) {
      if (!raw || typeof raw !== 'object') continue
      const turn = raw as Record<string, unknown>
      const turnId = text(turn.turn_id)
      const sessionId = text(turn.session_id)
      if (!turnId || !sessionId) continue
      let timeline = next.timelines[turnId] ?? defaultTimeline(turnId, sessionId, action.now)
      timeline = {
        ...timeline,
        status: terminalStatus(`turn.${turn.status}`) ??
          (['completed', 'failed', 'cancelled', 'stopped'].includes(timeline.status)
            ? timeline.status : turn.status === 'cancelling' ? 'cancelling' : 'running'),
        mode: text(turn.mode) || timeline.mode,
        startedAt: parseTime(turn.started_at, timeline.startedAt),
      }
      const items = Array.isArray(turn.items) ? turn.items : Array.isArray(turn.activities) ? turn.activities : []
      for (const value of items) {
        if (!value || typeof value !== 'object') continue
        const payload = value as Record<string, unknown>
        timeline = mergeIntoTimeline(timeline, text(payload.event), payload, action.now)
      }
      next = {
        ...next,
        timelines: { ...next.timelines, [turnId]: timeline },
        busySessions: busyCopy(next.busySessions, sessionId,
          Object.values({ ...next.timelines, [turnId]: timeline }).some((value) =>
            value.sessionId === sessionId && ['running', 'approval', 'cancelling'].includes(value.status))),
      }
    }
    return next
  }

  const { event, payload } = action.event
  const turnId = text(payload.turn_id)
  const sessionId = text(payload.session_id)
  if (!turnId || !sessionId) return state
  let timeline = state.timelines[turnId] ?? defaultTimeline(turnId, sessionId, action.now)
  if (event === 'turn.started') {
    timeline = {
      ...timeline,
      mode: text(payload.mode) || timeline.mode,
      status: 'running',
      startedAt: parseTime(payload.occurred_at, timeline.startedAt),
      userMessage: text(payload.message) || timeline.userMessage,
    }
  } else {
    const terminal = terminalStatus(event)
    if (terminal) {
      const content = text(payload.content)
      if (content && !timeline.items.some((item) => item.type === 'model' && item.outputKind === 'final')) {
        timeline = mergeIntoTimeline(timeline, 'model.content.completed', {
          ...payload,
          model_call_id: payload.model_call_id || 'legacy-final',
          content,
          output_kind: 'final',
        }, action.now)
      }
      timeline = {
        ...timeline,
        status: terminal,
        completedAt: parseTime(payload.occurred_at, action.now),
        error: event === 'turn.failed' ? errorMessage(payload.error) : timeline.error,
        errorDetails: event === 'turn.failed' && payload.error && typeof payload.error === 'object' ? (payload.error as { details?: Record<string, unknown> }).details : timeline.errorDetails,
        stopReason: event === 'turn.stopped'
          ? {
              code: text(payload.reason) || 'stopped',
              message: text((payload.details as Record<string, unknown> | undefined)?.content) || 'Turn stopped.',
            } satisfies TurnStopReason
          : timeline.stopReason,
      }
    } else {
      timeline = mergeIntoTimeline(timeline, event, payload, action.now)
      if (event === 'approval.requested' && ['running', 'approval'].includes(timeline.status)) timeline = { ...timeline, status: 'approval' }
      if ((event === 'approval.resolved' || event === 'approval.expired') && timeline.status === 'approval') {
        timeline = { ...timeline, status: 'running' }
      }
    }
  }
  const approvals: PendingApproval[] = event === 'approval.requested'
    ? [
        ...state.approvals.filter((item) => item.approval_id !== text(payload.approval_id)),
        {
          approval_id: text(payload.approval_id),
          session_id: sessionId,
          turn_id: turnId,
          capability: text(payload.capability) || text(payload.tool),
          target: text(payload.target) || null,
          risk: text(payload.risk) || 'medium',
          description: text(payload.description),
          status: 'pending',
        },
      ]
    : event === 'approval.resolved' || event === 'approval.expired'
      ? state.approvals.filter((item) => item.approval_id !== text(payload.approval_id))
      : state.approvals
  return {
    ...state,
    timelines: { ...state.timelines, [turnId]: timeline },
    busySessions: busyCopy(state.busySessions, sessionId,
      Object.values({ ...state.timelines, [turnId]: timeline }).some((turn) =>
        turn.sessionId === sessionId && ['running', 'approval', 'cancelling'].includes(turn.status))),
    approvals,
  }
}

export function engineEventAction(event: EngineEventMsg, now = Date.now()): TimelineAction | null {
  if (!event?.event || !event.payload) return null
  const relevant =
    event.event.startsWith('turn.') ||
    event.event.startsWith('model.') ||
    event.event.startsWith('tool.') ||
    event.event.startsWith('vision.') ||
    event.event.startsWith('question.') ||
    event.event.startsWith('approval.') ||
    event.event.startsWith('governor.') ||
    event.event.startsWith('agent.') ||
    event.event.startsWith('verification.')
  return relevant ? { type: 'engine/event', event, now } : null
}
