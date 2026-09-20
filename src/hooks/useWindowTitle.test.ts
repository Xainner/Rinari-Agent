// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { composeWindowTitle, setWindowTitle } from './useWindowTitle'

describe('window title', () => {
  it('prefixes the real attention count and restores the base title at zero', () => {
    expect(composeWindowTitle(0)).toBe('Rinari Agent')
    expect(composeWindowTitle(3)).toBe('(3) Rinari Agent')
    expect(composeWindowTitle(120)).toBe('(99+) Rinari Agent')
  })

  it('serializes writes so a late resolution never restores an older counter', async () => {
    await setWindowTitle('(2) Rinari Agent')
    const first = setWindowTitle('(5) Rinari Agent')
    const second = setWindowTitle('Rinari Agent')
    await Promise.all([first, second])
    expect(document.title).toBe('Rinari Agent')
  })
})
