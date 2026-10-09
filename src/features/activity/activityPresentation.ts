import type { TimelineItem, TurnTimeline, ModelTimelineItem, ApprovalTimelineItem, MemoryTimelineItem, SkillTimelineItem } from './types'

export const turnIsActive = (status: TurnTimeline['status']) => ['running', 'approval', 'cancelling'].includes(status)
export const pendingApproval = (item: TimelineItem): item is ApprovalTimelineItem => item.type === 'approval' && ['pending', 'resolving'].includes(item.status)
export const recoveryAction = (item: TimelineItem) => item.type === 'context' && Boolean(item.sessionId) && ['failed', 'cancelled'].includes(item.status)
export const visualPending = (item: TimelineItem) => item.type === 'vision' && item.route !== 'conversation' && ['queued', 'preparing', 'running'].includes(item.status)

/** A finished operation stays still even when another operation in its turn is running. */
export const operationIsActive = (item: TimelineItem) => item.type === 'tool'
  ? ['requested', 'running'].includes(item.status)
  : ['agent', 'context', 'verification'].includes(item.type) && 'status' in item && item.status === 'running' || visualPending(item)

export interface ActivitySegment {
  id: string
  items: TimelineItem[]
  publicTexts: ModelTimelineItem[]
  /** The user's instruction immediately before this segment. */
  steer?: Extract<TimelineItem, { type: 'steer' }>
}

/** Resolutions can arrive in the parent before the child's next snapshot. */
function approvalStates(items: TimelineItem[]) {
  const requests = new Map<string, ApprovalTimelineItem>()
  const rank = (item: ApprovalTimelineItem) => pendingApproval(item) ? item.status === 'resolving' ? 1 : 0 : 2
  function visit(rows: TimelineItem[]) {
    for (const item of rows) {
      if (item.type === 'approval') {
        const previous = requests.get(item.approvalId)
        if (!previous || rank(item) >= rank(previous)) requests.set(item.approvalId, item)
      } else if (item.type === 'agent') visit(item.items ?? [])
    }
  }
  visit(items)
  return requests
}

/** Presentation only. The original timeline, identities and runtime stay untouched. */
export function projectActivity(timeline: TurnTimeline) {
  const active = turnIsActive(timeline.status)
  const final = [...timeline.items].reverse().find((i): i is ModelTimelineItem => i.type === 'model' && i.outputKind === 'final' && Boolean(i.content))
  const candidate = [...timeline.items].reverse().find((i): i is ModelTimelineItem => i.type === 'model' && Boolean(i.content) && !i.outputKind)
  const provisional = candidate && (!final || candidate.activitySeq > final.activitySeq) ? candidate : undefined
  const approvals = new Map<string, { item: ApprovalTimelineItem; agent?: string }>()
  const recoveries: TimelineItem[] = []
  // Avisos sobre el modelo que deben verse aunque la actividad esté plegada.
  const notices: TimelineItem[] = []
  // Propuestas y recuerdos: tarjetas propias, también desde un subagente.
  const memories: MemoryTimelineItem[] = []
  const skills: SkillTimelineItem[] = []
  const segments: ActivitySegment[] = [{ id: 'initial', items: [], publicTexts: [] }]
  const actions = new Set<string>()
  const incidents = new Set<string>()
  const resolvedApprovals = approvalStates(timeline.items)
  const seenApprovals = new Set<string>()

  function inspect(item: TimelineItem, owner = '', agent?: string, ownerActive = active): TimelineItem | null {
    if (item.type === 'approval') {
      if (seenApprovals.has(item.approvalId)) return null
      seenApprovals.add(item.approvalId)
      item = resolvedApprovals.get(item.approvalId) ?? item
    }
    if (pendingApproval(item) && ownerActive) {
      // Main and child events can expose the same approval. Render its controls once.
      approvals.set(item.approvalId, { item, agent })
      return null
    }
    if (item.type === 'memory') {
      if (!memories.some((memory) => memory.id === item.id)) memories.push(item)
      return null
    }
    if (item.type === 'skill') {
      if (!skills.some((skill) => skill.id === item.id)) skills.push(item)
      return null
    }
    if (item.type === 'question' && item.request.status === 'pending') return ownerActive ? null : { ...item, request: { ...item.request, status: 'expired' } }
    // El modelo ignoró el razonamiento elegido o no ve imágenes: aviso siempre visible.
    if ((item.type === 'system' && item.kind === 'reasoning_dropped') || (item.type === 'vision' && item.fallback === 'without_images')) {
      if (!notices.some((notice) => notice.type === item.type)) notices.push(item)
      return null
    }
    if (item.type === 'changeset' || item.type === 'system' || (item.type === 'model' && !item.content)) return null
    if (item.type === 'vision' && item.route === 'conversation') return null
    if (['tool', 'context', 'verification', 'vision'].includes(item.type)) {
      // A visual analysis with a toolCallId is the presentation of that tool, not another call.
      const identity = (item.type === 'tool' || item.type === 'vision') && item.toolCallId ? `tool:${item.toolCallId}` : item.id
      actions.add(`${owner}/${identity}`)
      if ('status' in item && ['failed', 'partial', 'cancelled'].includes(item.status ?? '')) incidents.add(`${owner}/${identity}`)
      if (item.type === 'tool' && item.presentation?.stderr_warning) incidents.add(`${owner}/${identity}`)
    }
    if (recoveryAction(item)) { recoveries.push(item); return null }
    if (item.type === 'agent') {
      if (item.status === 'failed') incidents.add(`${owner}/${item.id}`)
      return { ...item, items: (item.items ?? []).flatMap(child => {
        const selected = inspect(child, `${owner}/${item.agentId}`, item.agent, ownerActive && item.status === 'running')
        return selected ? [selected] : []
      }) }
    }
    if (pendingApproval(item) && !ownerActive) return { ...item, status: 'expired' }
    return item
  }
  for (const item of timeline.items) {
    if (item.type === 'steer') { segments.push({ id: item.id, steer: item, items: [], publicTexts: [] }); continue }
    if (item.type === 'model' && !item.outputKind && item.content) {
      segments.at(-1)!.publicTexts.push(item)
      // A partial answer is kept outside only after interruption; live text keeps its position.
      if (!active && item === provisional) continue
    }
    if (item === final) continue
    const selected = inspect(item)
    if (selected) segments.at(-1)!.items.push(selected)
  }
  return { segments, approvals: [...approvals.values()], recoveries, notices, memories, skills, final, provisional, actions: actions.size, incidents: incidents.size }
}

/** Active identities win over the last row or output timestamp. Token/stdout updates cannot rotate the header. */
export function activityState(timeline: TurnTimeline) {
  if (!turnIsActive(timeline.status)) return { kind: timeline.status, parallel: 0 } as const
  const all = (items: TimelineItem[]): TimelineItem[] => items.flatMap(i => i.type === 'agent' && i.status === 'running' ? [i, ...all(i.items ?? [])] : [i])
  const items = all(timeline.items)
  const requests = [...approvalStates(items.filter(i => i.type !== 'agent')).values()]
  const agents = new Set(items.flatMap(i => i.type === 'agent' && i.status === 'running' ? [i.agentId] : [])).size
  if (requests.some(i => i.status === 'pending')) return { kind: 'approval', parallel: agents } as const
  if (items.some(i => i.type === 'question' && i.request.status === 'pending')) return { kind: 'question', parallel: agents } as const
  if (timeline.status === 'cancelling') return { kind: 'cancelling', parallel: agents } as const
  if (requests.some(pendingApproval) || timeline.status === 'approval') return { kind: 'approval', parallel: agents } as const
  const preparation = [...timeline.items].reverse().find(i => i.type === 'context' && i.status === 'running')
  if (preparation) return { kind: 'action', item: preparation, parallel: agents, simultaneous: 1 } as const
  const latest = timeline.items.at(-1)
  if (latest?.type === 'system' && latest.kind === 'turn_preparing') return { kind: 'preparing', parallel: agents } as const
  if (latest?.type === 'system' && latest.kind === 'governor' && ['consolidate', 'nudge', 'finalize'].includes(latest.status ?? '')) return { kind: 'recovering', parallel: agents } as const
  const current = timeline.items.filter(i =>
    i.type === 'tool' && ['requested', 'running'].includes(i.status) ||
    (i.type === 'context' || i.type === 'verification') && i.status === 'running' || visualPending(i),
  ).sort((a, b) => b.activitySeq - a.activitySeq)
  if (current.length) {
    const identities = new Set(current.map(i => (i.type === 'tool' || i.type === 'vision') && i.toolCallId ? `tool:${i.toolCallId}` : i.id))
    return { kind: 'action', item: current[0], parallel: agents, simultaneous: identities.size } as const
  }
  const model = [...timeline.items].reverse().find(i => i.type === 'model')
  if (model?.type === 'model' && model.retry && !model.content && model.status === 'thinking') return { kind: 'retrying', retry: model.retry, parallel: agents } as const
  if (model?.type === 'model' && !model.outputKind && model.content && model.status !== 'failed') return { kind: 'responding', parallel: agents } as const
  if (!model || model.status === 'thinking' || model.status === 'streaming') return { kind: 'thinking', parallel: agents } as const
  return { kind: 'waiting', parallel: agents } as const
}

export function turnDuration(timeline: TurnTimeline, now?: number): number | null {
  const end = turnIsActive(timeline.status) ? now : timeline.completedAt
  if (!Number.isFinite(timeline.startedAt) || timeline.startedAt <= 0 || end === undefined || !Number.isFinite(end) || end < timeline.startedAt) return null
  return end - timeline.startedAt
}

export type ActivityBlock = { id: string; type: 'text'; item: ModelTimelineItem }
  | { id: string; type: 'operations'; items: Exclude<TimelineItem, ModelTimelineItem>[] }

/** Consecutive operations share the first operation's identity, independent of deltas. */
export function activityBlocks(items: TimelineItem[]): ActivityBlock[] {
  const blocks: ActivityBlock[] = []
  for (const item of items) {
    if (item.type === 'model') {
      blocks.push({ id: item.id, type: 'text', item })
    } else {
      const previous = blocks.at(-1)
      if (previous?.type === 'operations') previous.items.push(item)
      else blocks.push({ id: item.id, type: 'operations', items: [item] })
    }
  }
  return blocks
}
