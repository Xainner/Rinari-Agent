import { describe, expect, it, vi } from 'vitest'

import { focusExistingWindow, revealMaximized } from './window'

describe('revealMaximized', () => {
  it('maximizes before publishing without an eager show', async () => {
    const calls: string[] = []
    const window = {
      isDestroyed: () => false,
      isVisible: () => true,
      maximize: () => calls.push('maximize'),
      show: () => calls.push('show'),
    }
    revealMaximized(window as never, () => calls.push('publish'))
    expect(calls).toEqual(['maximize'])
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(calls).toEqual(['maximize', 'publish'])
  })

  it('shows on the next tick only when maximize did not reveal it', async () => {
    const calls: string[] = []
    const window = {
      isDestroyed: () => false,
      isVisible: () => false,
      maximize: () => calls.push('maximize'),
      show: () => calls.push('show'),
    }
    revealMaximized(window as never, () => calls.push('publish'))
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(calls).toEqual(['maximize', 'show', 'publish'])
  })

  it('does not touch a window destroyed before the fallback tick', async () => {
    let destroyed = false
    const publish = vi.fn()
    const show = vi.fn()
    const window = {
      isDestroyed: () => destroyed,
      isVisible: () => false,
      maximize: () => { destroyed = true },
      show,
    }
    revealMaximized(window as never, publish)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(show).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
  })
})

describe('focusExistingWindow', () => {
  it('restores a minimized window and never maximizes it', () => {
    const calls: string[] = []
    focusExistingWindow({
      isMinimized: () => true,
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus'),
    } as never)
    expect(calls).toEqual(['restore', 'focus'])
  })

  it('only focuses a normally sized existing window', () => {
    const calls: string[] = []
    focusExistingWindow({
      isMinimized: () => false,
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus'),
    } as never)
    expect(calls).toEqual(['focus'])
  })
})
