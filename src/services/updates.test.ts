import { describe, expect, it } from 'vitest'

import { reportsUpdateError } from './updates'

describe('reportsUpdateError', () => {
  it('stays silent for a failed check: its caller reports it', () => {
    expect(reportsUpdateError(null)).toBe(false)
    expect(reportsUpdateError('idle')).toBe(false)
    expect(reportsUpdateError('checking')).toBe(false)
    expect(reportsUpdateError('error')).toBe(false)
  })

  it('reports an error that interrupts a download or an install', () => {
    expect(reportsUpdateError('downloading')).toBe(true)
    expect(reportsUpdateError('downloaded')).toBe(true)
    expect(reportsUpdateError('applying')).toBe(true)
  })
})
