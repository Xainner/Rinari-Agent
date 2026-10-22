import { describe, expect, it } from 'vitest'

import { browserShortcut } from './browserShortcuts'

describe('atajos del navegador (Planka Ideas-2)', () => {
  it.each([
    [{ key: 't', control: true }, 'new-tab'],
    [{ key: 'T', control: true }, 'new-tab'],
    [{ key: 'w', control: true }, 'close-tab'],
    [{ key: 'F4', control: true }, 'close-tab'],
    [{ key: 'Tab', control: true }, 'next-tab'],
    [{ key: 'Tab', control: true, shift: true }, 'previous-tab'],
    [{ key: 'PageDown', control: true }, 'next-tab'],
    [{ key: 'PageUp', control: true }, 'previous-tab'],
    [{ key: 'r', control: true }, 'reload'],
    [{ key: 'F5' }, 'reload'],
    [{ key: 'ArrowLeft', alt: true }, 'back'],
    [{ key: 'ArrowRight', alt: true }, 'forward'],
    [{ key: 'l', control: true }, 'focus-address'],
    [{ key: 'd', alt: true }, 'focus-address'],
    [{ key: 'F6' }, 'focus-address'],
  ])('Windows y Linux: %o → %s', (input, expected) => {
    expect(browserShortcut({ type: 'keyDown', ...input }, false)).toBe(expected)
  })

  it('en macOS es Cmd, salvo Ctrl+Tab', () => {
    expect(browserShortcut({ key: 't', meta: true }, true)).toBe('new-tab')
    expect(browserShortcut({ key: 't', control: true }, true)).toBeNull()
    expect(browserShortcut({ key: '[', meta: true }, true)).toBe('back')
    expect(browserShortcut({ key: 'Tab', control: true }, true)).toBe('next-tab')
  })

  it('lo demás es una tecla para la página', () => {
    expect(browserShortcut({ key: 't' }, false)).toBeNull()
    expect(browserShortcut({ key: 'c', control: true }, false)).toBeNull()
    expect(browserShortcut({ key: 'T', control: true, shift: true }, false)).toBeNull()
    expect(browserShortcut({ key: 'w', control: true, alt: true }, false)).toBeNull()
    expect(browserShortcut({ key: 'ArrowLeft' }, false)).toBeNull()
    expect(browserShortcut({ key: 'F5', shift: true }, false)).toBeNull()
  })

  it('solo al pulsar, no al soltar', () => {
    expect(browserShortcut({ type: 'keyUp', key: 'w', control: true }, false)).toBeNull()
    expect(browserShortcut({ type: 'rawKeyDown', key: 'w', control: true }, false)).toBe('close-tab')
  })
})
