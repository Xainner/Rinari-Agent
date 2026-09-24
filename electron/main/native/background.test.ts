import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { assertBackgroundPatch, createBackground, loadDesktopSettings, wantsHiddenStart } from './background'

const dirs: string[] = []
function settingsPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rinari-background-'))
  dirs.push(dir)
  return join(dir, 'nested', 'desktop-settings.json')
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('segundo plano', () => {
  it('keeps running in the tray by default and says so only the first time', () => {
    const path = settingsPath()
    const background = createBackground({ settingsPath: path, loginItems: null })
    expect(background.onCloseRequested()).toEqual({ action: 'hide', notice: true })
    expect(background.onCloseRequested()).toEqual({ action: 'hide', notice: false })
    // El aviso ya mostrado sobrevive a un reinicio.
    expect(createBackground({ settingsPath: path, loginItems: null }).onCloseRequested().notice).toBe(false)
  })

  it('quits on close when the tray is off, and the choice persists', () => {
    const path = settingsPath()
    const onModeChanged = vi.fn()
    const background = createBackground({ settingsPath: path, loginItems: null, onModeChanged })
    background.update({ backgroundMode: false })
    expect(onModeChanged).toHaveBeenCalledWith(false)
    expect(background.onCloseRequested()).toEqual({ action: 'quit', notice: false })
    expect(JSON.parse(readFileSync(path, 'utf8')).backgroundMode).toBe(false)
    expect(loadDesktopSettings(path).backgroundMode).toBe(false)
  })

  it('starts hidden only when the system launched it and the tray exists to come back', () => {
    const background = createBackground({ settingsPath: settingsPath(), loginItems: null })
    expect(wantsHiddenStart(['rinari.exe', '--hidden'])).toBe(true)
    expect(background.startsHidden(['rinari.exe'])).toBe(false)
    expect(background.startsHidden(['rinari.exe', '--hidden'])).toBe(true)
    background.update({ backgroundMode: false })
    expect(background.startsHidden(['rinari.exe', '--hidden'])).toBe(false)
  })

  it('reports the login item from the system and offers it only in the installed app', () => {
    let openAtLogin = false
    const loginItems = { get: () => openAtLogin, set: vi.fn((value: boolean) => { openAtLogin = value }) }
    const background = createBackground({ settingsPath: settingsPath(), loginItems })
    expect(background.update({ launchAtLogin: true })).toEqual({ backgroundMode: true, launchAtLogin: true, launchAtLoginSupported: true })
    expect(loginItems.set).toHaveBeenCalledWith(true)
    const dev = createBackground({ settingsPath: settingsPath(), loginItems: null })
    expect(dev.update({ launchAtLogin: true })).toEqual({ backgroundMode: true, launchAtLogin: false, launchAtLoginSupported: false })
  })

  it('falls back to defaults on an unreadable file', () => {
    expect(loadDesktopSettings(join(tmpdir(), 'no-such-rinari-dir', 'x.json'))).toEqual({ backgroundMode: true, trayNoticeShown: false })
  })

  it('validates what the renderer sends: known booleans only', () => {
    expect(assertBackgroundPatch({ backgroundMode: false })).toEqual({ backgroundMode: false })
    expect(() => assertBackgroundPatch({ backgroundMode: 'no' })).toThrow('boolean')
    expect(() => assertBackgroundPatch({ openAtLogin: true })).toThrow('unknown')
    expect(() => assertBackgroundPatch(null)).toThrow('object')
    expect(() => assertBackgroundPatch([true])).toThrow('object')
  })
})
