import type { ChatMessage } from '../../types'
import type { ChildSession } from '../../services/engine'
import type { TurnTimeline } from './types'

export type ChatStreamItem =
  | { id: string; kind: 'message'; message: ChatMessage; at: number }
  | { id: string; kind: 'timeline'; timeline: TurnTimeline; user?: ChatMessage; at: number }
  | { id: string; kind: 'child'; child: ChildSession; at: number }

/**
 * Merge persisted history and protocol timelines without rendering either
 * source twice; the child sessions this conversation opened go where they
 * were opened (after the turn that opened them).
 */
export function buildChatStream(
  messages: ChatMessage[],
  timelines: Record<string, TurnTimeline>,
  sessionId: string,
  children: ChildSession[] = [],
): ChatStreamItem[] {
  const sessionTimelines = Object.values(timelines).filter((turn) => turn.sessionId === sessionId)
  const timelineIds = new Set(sessionTimelines.map((turn) => turn.turnId))
  const users = new Map(
    messages
      // A message sent mid-turn shares the turn id; the timeline shows it
      // where it was read, and it is not what started the turn.
      .filter((message) => message.role === 'user' && message.turnId && !message.origin?.steer_id)
      .map((message) => [message.turnId as string, message]),
  )
  const rows: ChatStreamItem[] = messages
    .filter((message) => !message.turnId || !timelineIds.has(message.turnId))
    .map((message) => ({ id: `message:${message.id}`, kind: 'message', message, at: message.createdAt }))

  for (const timeline of sessionTimelines) {
    const user = users.get(timeline.turnId)
    rows.push({
      id: `timeline:${timeline.turnId}`,
      kind: 'timeline',
      timeline,
      user,
      at: user?.createdAt ?? timeline.startedAt,
    })
  }
  for (const child of children) {
    if (child.parent_session_id !== sessionId) continue
    const at = Date.parse(child.created_at)
    rows.push({ id: `child:${child.child_session_id}`, kind: 'child', child, at: Number.isFinite(at) ? at : Date.now() })
  }
  return rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}
