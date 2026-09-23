import type { TurnTokenUsage } from '../../types/protocol.generated'
import type { TurnTimeline } from './types'

const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function parseTokenUsage(value: Record<string, unknown>): TurnTokenUsage | undefined {
  if (!['input_tokens', 'output_tokens', 'total_tokens', 'model_calls', 'revision'].every(key => count(value[key]))) return
  if (value.total_tokens !== (value.input_tokens as number) + (value.output_tokens as number)) return
  if (!['estimated', 'mixed', 'reported'].includes(String(value.source)) || !['thinking', 'streaming', 'settled'].includes(String(value.phase))) return
  return Object.fromEntries(['input_tokens', 'output_tokens', 'total_tokens', 'model_calls', 'revision', 'source', 'phase', 'cached_input_tokens', 'reasoning_tokens']
    .filter(key => value[key] !== undefined && (key !== 'cached_input_tokens' && key !== 'reasoning_tokens' || value[key] === null || count(value[key])))
    .map(key => [key, value[key]])) as unknown as TurnTokenUsage
}

export function newestUsage(a?: TurnTokenUsage, b?: TurnTokenUsage): TurnTokenUsage | undefined {
  return !a ? b : !b || a.revision >= b.revision ? a : b
}

export function mergeTokenUsage(timeline: TurnTimeline, event: string, payload: Record<string, unknown>): TurnTimeline {
  if (event === 'usage.updated') {
    const incoming = parseTokenUsage(payload)
    if (!incoming || (timeline.usage?.revision ?? -1) >= incoming.revision) return timeline
    return { ...timeline, usage: incoming }
  }
  const childEvent = event === 'agent.activity' ? payload.child_event : event
  if (childEvent !== 'model.completed' || (timeline.usage?.revision ?? 0) > 0) return timeline
  const data = payload.usage as Record<string, unknown> | undefined
  if (!data || !count(data.input_tokens) && !count(data.output_tokens)) return timeline
  const key = JSON.stringify([payload.agent_id ?? '', payload.model_call_id ?? payload.activity_seq])
  const calls = { ...timeline.legacyUsage, [key]: data }
  return { ...timeline, legacyUsage: calls, usage: legacyTokenUsage(calls) }
}

export function legacyTokenUsage(calls: NonNullable<TurnTimeline['legacyUsage']>): TurnTokenUsage | undefined {
  const values = Object.values(calls)
  if (!values.length) return undefined
  const input = values.reduce((n, c) => n + (count(c.input_tokens) ? c.input_tokens : 0), 0)
  const output = values.reduce((n, c) => n + (count(c.output_tokens) ? c.output_tokens : 0), 0)
  return {
    input_tokens: input, output_tokens: output, total_tokens: input + output, model_calls: values.length,
    revision: 0, phase: 'settled', source: values.every(c => count(c.input_tokens) && count(c.output_tokens) && (!c.source || c.source === 'complete')) ? 'reported' : 'mixed',
    cached_input_tokens: values.some(c => count(c.cached_input_tokens)) ? values.reduce((n, c) => n + (count(c.cached_input_tokens) ? c.cached_input_tokens : 0), 0) : null,
    reasoning_tokens: values.some(c => count(c.reasoning_tokens)) ? values.reduce((n, c) => n + (count(c.reasoning_tokens) ? c.reasoning_tokens : 0), 0) : null,
  }
}

export function formatTokens(total: number, lang: string): string {
  return new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(total)
}
