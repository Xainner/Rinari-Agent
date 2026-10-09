import { describe, expect, it } from 'vitest'
import { translate } from '../../i18n'
import { compactionSkipped } from './TurnTimelineView'
import type { ContextTimelineItem } from './types'

const item = (skipReason?: string, contextDetails: Record<string, unknown> = {}): ContextTimelineItem => ({
  id: 'context:1',
  activitySeq: 1,
  occurredAt: 0,
  type: 'context',
  status: 'skipped',
  reason: 'manual',
  skipReason,
  contextDetails,
})

describe('a manual compaction that changed nothing says why', () => {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('es', key, vars)

  it('names the reason and its numbers', () => {
    expect(compactionSkipped(item('only_latest_exchange', { messages: 3, history: 1840 }), t)).toBe(
      `Sin efecto: solo está el último intercambio (3 mensajes, ~${(1840).toLocaleString()} tokens) y no hay nada anterior que resumir`,
    )
    expect(compactionSkipped(item('empty_history'), t)).toContain('todavía no tiene historial')
    expect(compactionSkipped(item('summary_not_smaller', { after: 900 }), t)).toContain('~900 tokens')
  })

  it('keeps the old text for an Engine that sends no reason', () => {
    expect(compactionSkipped(item(), t)).toBe('No fue necesario compactar')
  })
})
