import { describe, expect, it } from 'vitest'
import { createRepeatGrouper } from './repeatGrouper'

describe('repeat grouper (#58)', () => {
  it('writes the first, counts the rest and closes the window with a summary', () => {
    const lines: string[] = []
    let clock = 0
    const grouper = createRepeatGrouper((line) => lines.push(line), { windowMs: 600_000, now: () => clock })
    for (let index = 0; index < 120; index += 1) {
      grouper.log('[renderer] ResizeObserver loop completed with undelivered notifications.')
      clock += 1_000
    }
    grouper.log('[renderer] otro error')
    expect(lines).toEqual([
      '[renderer] ResizeObserver loop completed with undelivered notifications.',
      '[renderer] otro error',
    ])
    clock = 700_000
    grouper.log('[renderer] otro error')
    // The first window closed with its summary; «otro error» is still in its own.
    expect(lines.slice(2)).toEqual([
      '[renderer] ResizeObserver loop completed with undelivered notifications. (×119 más en 12 min)',
    ])
    grouper.flush()
    expect(lines.slice(3)).toEqual(['[renderer] otro error (×1 más en 10 min)'])
  })
})
