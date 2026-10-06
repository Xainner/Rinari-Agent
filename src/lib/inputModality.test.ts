// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { trackInputModality } from './inputModality'

describe('input modality (focus ring only with the keyboard)', () => {
  let stop = () => {}
  afterEach(() => stop())

  it('follows the last keyboard or pointer use', () => {
    const root = document.createElement('div')
    stop = trackInputModality(root)
    expect(root.dataset.input).toBe('pointer')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(root.dataset.input).toBe('keyboard')
    window.dispatchEvent(new Event('pointerdown'))
    expect(root.dataset.input).toBe('pointer')
    // A shortcut is not navigating the interface.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    expect(root.dataset.input).toBe('pointer')
  })
})
