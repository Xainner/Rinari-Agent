import { describe, expect, it } from 'vitest'
import { paneFace } from './PaneHeader'
import type { TurnTimeline } from '../activity/types'

const turn = (partial: Partial<TurnTimeline>): TurnTimeline => ({
  turnId: 't1', sessionId: 's1', status: 'running', startedAt: 1, items: [], ...partial,
} as TurnTimeline)

describe('cara de Rinari en la cabecera del panel', () => {
  it('fuera de un turno usa el estado del panel', () => {
    expect(paneFace('needs_you', {})).toBe('waiting')
    expect(paneFace('done', {})).toBe('done')
    expect(paneFace('failed', {})).toBe('error')
  })

  it('mientras trabaja sigue el turno vivo más reciente', () => {
    const old = turn({ turnId: 'a', status: 'completed', startedAt: 1 })
    const live = turn({ turnId: 'b', status: 'running', startedAt: 2 })
    const face = paneFace('working', { a: old, b: live })
    expect(['thinking', 'working', 'streaming']).toContain(face)
  })

  it('sin turno vivo conocido, trabajando', () => {
    expect(paneFace('working', {})).toBe('working')
  })
})
