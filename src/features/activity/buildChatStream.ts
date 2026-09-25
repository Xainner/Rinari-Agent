import type { ChatMessage } from '../../types'
import type { TurnTimeline } from './types'

export type ChatStreamItem =
  | { id: string; kind: 'message'; message: ChatMessage; at: number }
  | { id: string; kind: 'timeline'; timeline: TurnTimeline; user?: ChatMessage; at: number }

/** Merge persisted history and protocol timelines without rendering either source twice. */
export function buildChatStream(
  messages: ChatMessage[],
  timelines: Record<string, TurnTimeline>,
  sessionId: string,
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
  return rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}
