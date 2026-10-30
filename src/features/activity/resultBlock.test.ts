import { describe, expect, it } from 'vitest'
import { hasResultBlock } from './resultBlock'
import type { TurnTimeline } from './types'

const base = (patch: Partial<TurnTimeline>): TurnTimeline => ({
  turnId: 't', sessionId: 's', status: 'completed', startedAt: 1, userMessage: '', items: [], ...patch,
})

describe('hasResultBlock (#84)', () => {
  it('a compaction-only or empty stopped turn has nothing to read', () => {
    expect(hasResultBlock(base({}))).toBe(false)
    expect(hasResultBlock(base({ status: 'stopped' }))).toBe(false)
  })

  it('final text, partial text, or a failure is a result', () => {
    const model = { id: 'm', type: 'model' as const, activitySeq: 1, occurredAt: 1, modelCallId: 'm', status: 'completed' as const, content: 'hola' }
    expect(hasResultBlock(base({ items: [{ ...model, outputKind: 'final' }] }))).toBe(true)
    expect(hasResultBlock(base({ status: 'stopped', items: [model] }))).toBe(true)
    expect(hasResultBlock(base({ status: 'failed' }))).toBe(true)
  })
})
