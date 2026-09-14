import { expect, it } from 'vitest'
import { supportsEffort } from './reasoning'

it('respects explicit model levels and keeps provider defaults available', () => {
  expect(supportsEffort({ reasoning_levels: ['low', 'high'] }, 'ultra')).toBe(false)
  expect(supportsEffort({ reasoning: { supported_efforts: ['xhigh'] } }, 'xhigh')).toBe(true)
  expect(supportsEffort({ reasoning_effort: false }, 'high')).toBe(false)
  expect(supportsEffort({ reasoning_effort: false }, 'off')).toBe(true)
  expect(supportsEffort(null, 'max')).toBe(false)
  expect(supportsEffort(null, 'off')).toBe(true)
  expect(supportsEffort({ reasoning_effort: true }, 'high')).toBe(true)
})
