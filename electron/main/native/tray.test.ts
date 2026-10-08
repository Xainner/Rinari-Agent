import { describe, expect, it, vi } from 'vitest'
import { trayMenuEntries } from './tray'
import { hostText, type HostLanguage } from './hostText'

function fixture(language: HostLanguage = 'es') {
  const events: string[] = []
  const deps = {
    onOpen: vi.fn(() => { events.push('open') }),
    onAction: vi.fn((action: string) => { events.push(action) }),
    onQuit: vi.fn(() => { events.push('quit') }),
    text: () => hostText(language),
  }
  return { deps, events, entries: trayMenuEntries(deps) }
}

describe('system tray menu', () => {
  it.each(['es', 'en'] as const)('shows localized useful actions in %s', (language) => {
    const { entries } = fixture(language)
    const t = hostText(language)
    expect(entries.filter(e => !e.separator).map(e => e.label)).toEqual([
      t.trayOpen, t.menuSettings, t.menuUpdates, t.menuReportBug, t.trayQuit,
    ])
    expect(entries.filter(e => e.separator)).toHaveLength(2)
  })

  it.each([
    ['menuSettings', 'settings'], ['menuUpdates', 'updates'], ['menuReportBug', 'report-bug'],
  ] as const)('reveals the window before %s', (label, action) => {
    const { entries, events, deps } = fixture()
    entries.find(e => e.label === hostText('es')[label])!.run!()
    expect(events).toEqual(['open', action])
    expect(deps.onQuit).not.toHaveBeenCalled()
  })

  it('keeps open and coordinated quit independent of the new actions', () => {
    const { entries, events, deps } = fixture()
    entries[0].run!()
    entries.at(-1)!.run!()
    expect(events).toEqual(['open', 'quit'])
    expect(deps.onAction).not.toHaveBeenCalled()
  })

  it('rebuilds labels from the current language', () => {
    const { deps } = fixture()
    deps.text = () => hostText('en')
    expect(trayMenuEntries(deps).some(e => e.label === 'Report a bug…')).toBe(true)
  })
})
