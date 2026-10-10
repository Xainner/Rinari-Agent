import { describe, expect, it } from 'vitest'
import { resultTone } from './VerificationPanel'

describe('resultTone', () => {
  it('paints the Engine results by what they mean', () => {
    expect(resultTone('passed')).toBe('text-[var(--success)]')
    expect(resultTone('failed')).toBe('text-[var(--danger)]')
    expect(resultTone('error')).toBe('text-[var(--danger)]')
    expect(resultTone('skipped')).not.toContain('danger')
  })
})
