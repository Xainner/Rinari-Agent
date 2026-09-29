import { describe, expect, it } from 'vitest'
import { resultTone } from './VerificationPanel'

describe('resultTone', () => {
  it('paints the Engine results by what they mean', () => {
    expect(resultTone('passed')).toBe('text-emerald-400')
    expect(resultTone('failed')).toBe('text-red-400')
    expect(resultTone('error')).toBe('text-red-400')
    expect(resultTone('skipped')).not.toContain('red')
  })
})
