// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import CommandPalette from '../../components/CommandPalette'
import BrowserPanel from '../browser/BrowserPanel'
import { useUIStore } from '../../stores/ui'
import { I18nProvider } from '../../i18n'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useUIStore.setState({ processesInspectorFor: null })
})

function paletteProps(available: boolean) {
  const noop = () => {}
  return {
    open: true,
    onClose: noop,
    sessions: [],
    activeId: null,
    onSelectSession: noop,
    onNewSession: noop,
    onOpenSettings: noop,
    onOpenEngine: noop,
    onOpenWorkspace: noop,
    onOpenProcesses: noop,
    processesAvailable: available,
    onEngineRestart: noop,
    theme: 'dark' as const,
    onThemeChange: noop,
    lang: 'es' as const,
    onLanguageChange: noop,
  }
}

it('T-15: paleta deshabilita procesos sin sesión activa', () => {
  const { unmount } = render(
    <I18nProvider lang="es">
      <CommandPalette {...paletteProps(false)} />
    </I18nProvider>,
  )
  const item = screen.getByText('Sin conversación seleccionada')
  expect(item.closest('[aria-disabled="true"]') ?? item.closest('[data-disabled]')).toBeTruthy()
  unmount()
  const opened: string[] = []
  render(
    <I18nProvider lang="es">
      <CommandPalette {...paletteProps(true)} onOpenProcesses={() => opened.push('x')} />
    </I18nProvider>,
  )
  fireEvent.click(screen.getByText('Ver procesos de esta conversación'))
  expect(opened).toEqual(['x'])
})

it('T-16: el navegador no se autoabre sobre el inspector', async () => {
  vi.mocked(invoke).mockResolvedValue({
    state: 'connected',
    instance: 'i1',
    target_id: 't1',
    url: 'http://127.0.0.1:8080/',
    error: null,
    pages: [],
    image: null,
  })
  useUIStore.setState({ processesInspectorFor: 's1' })
  const suppressed = render(
    <I18nProvider lang="es">
      <BrowserPanel sessionId="s1" />
    </I18nProvider>,
  )
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 100))
  // Solo el botón de acceso, sin panel abierto encima.
  expect(suppressed.queryByText(/Vista en vivo/)).toBeNull()
  expect(suppressed.getByText('Navegador')).toBeTruthy()
  suppressed.unmount()

  useUIStore.setState({ processesInspectorFor: null })
  render(
    <I18nProvider lang="es">
      <BrowserPanel sessionId="s1" />
    </I18nProvider>,
  )
  expect(await screen.findByText(/Vista en vivo/)).toBeTruthy()
})
