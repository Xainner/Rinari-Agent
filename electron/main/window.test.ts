import { describe, expect, it, vi } from 'vitest'

import { dictationAllowed, focusExistingWindow, presentWindow, revealMaximized } from './window'

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
      isVisible: () => true,
      show: () => calls.push('show'),
      isMinimized: () => true,
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus'),
    } as never)
    expect(calls).toEqual(['restore', 'focus'])
  })

  it('only focuses a normally sized existing window', () => {
    const calls: string[] = []
    focusExistingWindow({
      isVisible: () => true,
      show: () => calls.push('show'),
      isMinimized: () => false,
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus'),
    } as never)
    expect(calls).toEqual(['focus'])
  })
})

describe('presentWindow (bandeja, notificación, segunda instancia)', () => {
  function fakeWindow(visible: boolean) {
    const calls: string[] = []
    let shown = visible
    return {
      calls,
      window: {
        isDestroyed: () => false,
        isVisible: () => shown,
        isMinimized: () => false,
        maximize: () => { calls.push('maximize'); shown = true },
        show: () => { calls.push('show'); shown = true },
        restore: () => calls.push('restore'),
        focus: () => calls.push('focus'),
      },
    }
  }

  it('reveals a window that started hidden in the tray maximized, then only shows it', () => {
    const { calls, window } = fakeWindow(false)
    presentWindow(window as never)
    expect(calls).toEqual(['maximize', 'focus'])
    // Oculta de nuevo con la X: volver a abrirla no la maximiza otra vez.
    calls.length = 0
    window.isVisible = () => false
    presentWindow(window as never)
    expect(calls).toEqual(['show', 'focus'])
  })

  it('shows a hidden window before focusing it', () => {
    const calls: string[] = []
    focusExistingWindow({
      isVisible: () => false,
      show: () => calls.push('show'),
      isMinimized: () => false,
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus'),
    } as never)
    expect(calls).toEqual(['show', 'focus'])
  })
})

describe('dictationAllowed', () => {
  const origins = ['app://rinari']
  const audio = { mediaTypes: ['audio'], requestingUrl: 'app://rinari/index.html' }

  it('lets the app window use the microphone for dictation', () => {
    expect(dictationAllowed(true, 'media', audio, origins)).toBe(true)
    // The permission check path reports one media type and the origin.
    expect(dictationAllowed(true, 'media', { mediaType: 'audio', requestingUrl: 'app://rinari' }, origins)).toBe(true)
  })

  it('denies the camera, the screen, other origins, other contents and other permissions', () => {
    expect(dictationAllowed(true, 'media', { ...audio, mediaTypes: ['audio', 'video'] }, origins)).toBe(false)
    expect(dictationAllowed(true, 'media', { ...audio, mediaTypes: ['video'] }, origins)).toBe(false)
    expect(dictationAllowed(true, 'media', { ...audio, mediaTypes: [] }, origins)).toBe(false)
    expect(dictationAllowed(true, 'media', { ...audio, requestingUrl: 'https://evil.example/' }, origins)).toBe(false)
    expect(dictationAllowed(true, 'media', { ...audio, requestingUrl: 'app://rinari.evil/' }, origins)).toBe(false)
    expect(dictationAllowed(false, 'media', audio, origins)).toBe(false)
    expect(dictationAllowed(true, 'geolocation', audio, origins)).toBe(false)
    expect(dictationAllowed(true, 'notifications', audio, origins)).toBe(false)
  })
})
