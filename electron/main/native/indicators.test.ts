// Número en la barra de tareas y marca en la bandeja: validación, iconos
// empaquetados y orden de envíos.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  nativeImage: {
    createFromPath: (path: string) => ({ path, isEmpty: () => false }),
  },
}))

const { assertIndicators, createIndicators, overlayAsset, trayAsset } = await import('./indicators')

const ICONS = join(__dirname, '..', '..', '..', 'build', 'indicators')
const valid = { generation: 1, count: 2, category: 'done', working: 1, tooltip: 'Rinari Agent · 2 chats pendientes', description: '2 chats pendientes' }

describe('validation', () => {
  it('accepts a complete state and rejects what main must not trust', () => {
    expect(assertIndicators(valid)).toEqual(valid)
    for (const bad of [
      null,
      { ...valid, count: -1 },
      { ...valid, count: 1.5 },
      { ...valid, category: 'purple' },
      { ...valid, tooltip: 'x'.repeat(161) },
      { ...valid, generation: Number.NaN },
      { ...valid, count: 0 },
      { ...valid, count: 3, category: 'none' },
    ]) {
      expect(() => assertIndicators(bad)).toThrow()
    }
  })
})

describe('assets', () => {
  it('picks a packaged badge per category and count, 9+ above nine', () => {
    expect(overlayAsset({ count: 0, category: 'none' })).toBeNull()
    expect(overlayAsset({ count: 1, category: 'needs_you' })).toBe('overlay-needs_you-1.png')
    expect(overlayAsset({ count: 10, category: 'failed' })).toBe('overlay-failed-9plus.png')
    expect(trayAsset({ category: 'none' })).toBeNull()
    expect(trayAsset({ category: 'other' })).toBe('tray-other.png')
  })

  it('every name it can pick exists in build/indicators, with its @2x', () => {
    for (const category of ['needs_you', 'failed', 'done', 'other'] as const) {
      for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const name = overlayAsset({ count, category })!
        expect(existsSync(join(ICONS, name)), name).toBe(true)
        expect(existsSync(join(ICONS, name.replace('.png', '@2x.png'))), name).toBe(true)
      }
      const tray = trayAsset({ category })!
      expect(existsSync(join(ICONS, tray)) && existsSync(join(ICONS, tray.replace('.png', '@2x.png')))).toBe(true)
    }
  })
})

describe('service', () => {
  let overlays: Array<[unknown, string]>
  let trays: Array<[unknown, string]>
  let window: { isDestroyed(): boolean; setOverlayIcon(image: unknown, description: string): void } | null

  beforeEach(() => {
    overlays = []
    trays = []
    window = { isDestroyed: () => false, setOverlayIcon: (image, description) => overlays.push([image, description]) }
  })

  const service = () => createIndicators({
    getWindow: () => window as never,
    setTray: (image, tooltip) => trays.push([image, tooltip]),
    dir: () => ICONS,
    platform: 'win32',
  })

  it('paints the badge and the tray face, and clears them at zero', () => {
    const indicators = service()
    indicators.apply(assertIndicators(valid))
    expect((overlays[0][0] as { path: string }).path).toBe(join(ICONS, 'overlay-done-2.png'))
    expect(overlays[0][1]).toBe('2 chats pendientes')
    expect((trays[0][0] as { path: string }).path).toBe(join(ICONS, 'tray-done.png'))
    expect(trays[0][1]).toContain('2 chats pendientes')

    indicators.apply({ ...valid, generation: 2, count: 0, category: 'none', description: '' })
    expect(overlays.at(-1)).toEqual([null, ''])
    expect(trays.at(-1)?.[0]).toBeNull()
  })

  it('drops a late, older state so a cleared badge does not come back', () => {
    const indicators = service()
    indicators.apply({ ...valid, generation: 5, count: 0, category: 'none' as const, description: '' })
    expect(indicators.apply({ ...valid, generation: 4 } as never)).toBe(false)
    expect(overlays).toHaveLength(1)
    expect(indicators.current()?.count).toBe(0)
  })

  it('repaints the last state on a new window without needing the renderer', () => {
    const indicators = service()
    indicators.apply(assertIndicators(valid))
    window = { isDestroyed: () => false, setOverlayIcon: (image, description) => overlays.push([image, `new:${description}`]) }
    indicators.reapply()
    expect(overlays.at(-1)?.[1]).toBe('new:2 chats pendientes')
  })

  it('keeps the tray up to date off Windows and with no window', () => {
    window = null
    const indicators = createIndicators({ getWindow: () => null, setTray: (image, tooltip) => trays.push([image, tooltip]), dir: () => ICONS, platform: 'darwin' })
    indicators.apply(assertIndicators(valid))
    expect(overlays).toHaveLength(0)
    expect(trays).toHaveLength(1)
  })
})
