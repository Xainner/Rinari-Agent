// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { invoke } = installMockPlatform()
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import CommandPalette from '../../components/CommandPalette'
import { I18nProvider } from '../../i18n'
import { ProcessRuntimeProvider } from './ProcessRuntimeProvider'
import ProcessesDock from './ProcessesDock'
import SessionWorkspace from '../session/SessionWorkspace'
import { resetSessionDockForTests, useSessionDockStore } from '../../stores/sessionDock'

vi.mock('../workspace/WorkspaceView', () => ({ default: () => <div data-testid="workspace-view" /> }))
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
  resetSessionDockForTests()
})

const CONNECTED = {
  state: 'connected',
  instance: 'i1',
  target_id: 't1',
  url: 'http://127.0.0.1:8080/',
  error: null,
  pages: [],
  image: null,
}

/** Sesión completa como la monta Normal: procesos en la conversación, browser en el dock. */
function workspace(focused = true) {
  return render(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={true} hasIdentity={false}>
        <SessionWorkspace sessionId="s1" record={null} density="normal" focused={focused}>
          <div data-testid="chat">
            <ProcessesDock sessionId="s1" openSignal={0} />
          </div>
        </SessionWorkspace>
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
}

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

it('T-16: un browser nuevo del Engine se revela en el dock de la sesión enfocada, no como overlay global', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => (command === 'browser_view_get' ? CONNECTED : { items: [], processes: [] }))
  workspace(true)
  const dock = await screen.findByTestId('session-dock')
  expect(dock.dataset.surface).toBe('browser')
  expect(dock.dataset.layout).toBe('docked')
  expect(screen.getByText(/Vista en vivo/)).toBeTruthy()
  // El dock ocupa espacio real dentro del workspace de la sesión: nada fijo ni flotante.
  expect(dock.closest('.session-workspace')).toBeTruthy()
  expect(document.querySelector('[class*="fixed"]')).toBeNull()
  expect(useSessionDockStore.getState().layoutFor('s1')).toMatchObject({ visible: true, activeSurface: 'browser' })
})

it('un browser nuevo no roba el dock de una sesión sin foco ni reemplaza lo que el usuario lee', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => (command === 'browser_view_get' ? CONNECTED : { items: [], processes: [] }))
  // Sin foco: solo indicador, el dock sigue cerrado.
  const unfocused = workspace(false)
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('browser_view_get', expect.anything()))
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(screen.queryByTestId('session-dock')).toBeNull()
  expect(useSessionDockStore.getState().layoutFor('s1').visible).toBe(false)
  unfocused.unmount()
  resetSessionDockForTests()

  // Con foco pero leyendo un archivo en el dock: no se cambia de superficie.
  useSessionDockStore.getState().reveal('s1', 'files')
  workspace(true)
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('browser_view_get', expect.anything()))
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(screen.getByTestId('session-dock').dataset.surface).toBe('files')
  // El indicador del navegador sí aparece en su pestaña.
  expect(screen.getByRole('tab', { name: /Navegador/ }).querySelector('.pane-dock-dot')).toBeTruthy()
})

it('cerrar el dock no cierra el navegador del Engine, y el inspector de procesos no lo esconde', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => (command === 'browser_view_get' ? CONNECTED : { items: [], processes: [] }))
  workspace(true)
  const dock = await screen.findByTestId('session-dock')
  fireEvent.click(screen.getByLabelText('Cerrar dock'))
  await waitFor(() => expect(screen.queryByTestId('session-dock')).toBeNull())
  // El recurso sigue consultándose en segundo plano (indicador), no se cierra nada.
  const calls = vi.mocked(invoke).mock.calls.filter(([command]) => command === 'browser_view_get').length
  expect(calls).toBeGreaterThan(0)
  expect(dock.isConnected).toBe(false)
  // Volver a abrir el dock muestra el navegador donde estaba.
  fireEvent.click(screen.getByTestId('chat'))
  useSessionDockStore.getState().setVisible('s1', true)
  expect((await screen.findByTestId('session-dock')).dataset.surface).toBe('browser')
})
