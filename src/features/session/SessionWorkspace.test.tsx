// @vitest-environment jsdom
// Doc 01 §5: un workspace visual por sesión (chat + dock de Archivos /
// Navegador / Workspace) compartido por Normal y Boards (UX-07, UX-08, UX-09).
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/desktop', () => ({
  desktopApi: {
    questions: vi.fn(async () => ({ questions: [] })),
    readFile: vi.fn(async () => ({ path: 'C:/repo/plan.md', name: 'plan.md', language: 'md', content: '# Planning document', size: 19 })),
    answer: vi.fn(),
  },
}))
vi.mock('../../lib/highlight', () => ({ highlightToHtml: vi.fn().mockResolvedValue(null) }))
vi.mock('../workspace/WorkspaceView', () => ({
  default: ({ session, tab }: { session: { id: string } | null; tab?: string }) => (
    <div data-testid={`workspace-${session?.id ?? 'none'}`} data-tab={tab} />
  ),
}))

vi.mock('../terminal/TerminalPanel', () => ({
  default: ({ sessionId }: { sessionId: string }) => <div data-testid={`terminal-${sessionId}`} />,
}))

import { I18nProvider } from '../../i18n'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { useComposerStore } from '../../stores/composer'
import { resetSessionDockForTests, useSessionDockStore } from '../../stores/sessionDock'
import BoardView from '../board/BoardView'
import { BoardHarness, engineFixture, sessionFixture } from '../board/testUtils'
import { FileLink } from '../files/FileWorkspace'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import { setPlatformForTests } from '../../platform'
import { createTestBridge } from '../../platform/testBridge'
import { resetOverlaysForTests, useOverlayStore } from '../../stores/overlay'
import SessionWorkspace, { requestDockToggle } from './SessionWorkspace'

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void
const resizeObservers: Array<{ element: Element; callback: ResizeCallback }> = []
class ResizeObserverStub {
  constructor(private readonly callback: ResizeCallback) {}
  observe(element: Element) { resizeObservers.push({ element, callback: this.callback }) }
  unobserve() {}
  disconnect() {}
}
function resize(element: Element, width: number) {
  for (const observer of resizeObservers) if (observer.element === element) act(() => observer.callback([{ contentRect: { width } }]))
}

beforeEach(() => {
  resizeObservers.length = 0
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo']
  window.localStorage.clear()
  resetSessionDockForTests()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate(defaultBoard())
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

function workspace(sessionId: string, options: { focused?: boolean; density?: 'normal' | 'pane' } = {}) {
  return (
    <SessionWorkspace sessionId={sessionId} record={sessionFixture(sessionId, sessionId)} density={options.density ?? 'normal'} focused={options.focused ?? true} browserEnabled={false}>
      <div data-testid={`chat-${sessionId}`}>
        <FileLink href="plan.md">Open plan {sessionId}</FileLink>
      </div>
    </SessionWorkspace>
  )
}

it('mounts one dock with three surfaces per session; a file link reveals Files in that dock only', async () => {
  render(<I18nProvider lang="es">{workspace('ses_a')}{workspace('ses_b', { focused: false })}</I18nProvider>)
  expect(screen.queryByTestId('session-dock')).toBeNull()
  const user = userEvent.setup()
  await user.click(screen.getByText('Open plan ses_a'))
  const dock = await screen.findByTestId('session-dock')
  expect(dock.dataset.sessionId).toBe('ses_a')
  expect(dock.dataset.surface).toBe('files')
  const surfaces = within(dock).getByRole('tablist', { name: 'Dock de la sesión' })
  expect(within(surfaces).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Archivos1', 'Navegador', 'Workspace'])
  expect(await within(dock).findByRole('heading', { name: 'Planning document' })).toBeTruthy()
  expect(screen.getAllByTestId('session-dock')).toHaveLength(1)
  // El chat sigue montado al lado: el dock ocupa espacio real, no lo cubre.
  expect(screen.getByTestId('chat-ses_a')).toBeTruthy()
  expect(dock.closest('.session-workspace')?.getAttribute('data-dock')).toBe('docked')
})

it('UX-09: a typed dock action names its session and never opens the dock of the others', () => {
  render(<I18nProvider lang="es">{workspace('ses_a')}{workspace('ses_b', { focused: false })}</I18nProvider>)
  act(() => requestDockToggle({ sessionId: 'ses_b', surface: 'files' }))
  const docks = screen.getAllByTestId('session-dock')
  expect(docks).toHaveLength(1)
  expect(docks[0]!.dataset.sessionId).toBe('ses_b')
  act(() => requestDockToggle({ sessionId: 'ses_b' }))
  expect(screen.queryByTestId('session-dock')).toBeNull()
  expect(useSessionDockStore.getState().layoutFor('ses_a').visible).toBe(false)
})

it('UX-08: when chat and dock do not fit, the dock becomes a drawer inside the session with focus and Escape', async () => {
  useSessionDockStore.getState().reveal('ses_a', 'workspace')
  render(<I18nProvider lang="es">{workspace('ses_a')}</I18nProvider>)
  const dock = screen.getByTestId('session-dock')
  const root = dock.closest('.session-workspace')!
  expect(dock.dataset.layout).toBe('docked')
  resize(root, 500)
  await waitFor(() => expect(screen.getByTestId('session-dock').dataset.layout).toBe('drawer'))
  expect(root.getAttribute('data-dock')).toBe('drawer')
  // El drawer vive dentro del contenedor de la sesión, no como superficie global.
  expect(screen.getByTestId('session-dock').closest('.session-workspace')).toBe(root)
  expect(document.querySelector('[class*="fixed"]')).toBeNull()
  // Foco dentro del drawer; Escape lo cierra sin clicks al contenido de abajo.
  expect(document.activeElement).toBe(within(screen.getByTestId('session-dock')).getByRole('tab', { selected: true }))
  const chatClicks = vi.fn()
  screen.getByTestId('chat-ses_a').addEventListener('click', chatClicks)
  fireEvent.keyDown(screen.getByTestId('session-dock'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByTestId('session-dock')).toBeNull())
  expect(chatClicks).not.toHaveBeenCalled()
  resize(root, 1200)
  useSessionDockStore.getState().setVisible('ses_a', true)
  await waitFor(() => expect(screen.getByTestId('session-dock').dataset.layout).toBe('docked'))
})

it('the same dock layout follows the session from Normal into its board pane', () => {
  useSessionDockStore.getState().reveal('ses_a', 'workspace', { workspaceTab: 'tasks' })
  useSessionDockStore.getState().setWidth('ses_a', 420)
  const normal = render(<I18nProvider lang="es">{workspace('ses_a')}</I18nProvider>)
  expect(screen.getByTestId('workspace-ses_a').dataset.tab).toBe('tasks')
  expect(screen.getByTestId('session-dock').style.width).toBe('420px')
  normal.unmount()

  const engine = engineFixture({ sessions: [sessionFixture('ses_a', 'Backend API', 'proj_a')] })
  useBoardStore.getState().addPane('ses_a')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const pane = screen.getByRole('region', { name: 'Backend API' })
  const dock = within(pane).getByTestId('session-dock')
  expect(dock.dataset.surface).toBe('workspace')
  expect(within(pane).getByTestId('workspace-ses_a').dataset.tab).toBe('tasks')
  expect(dock.style.width).toBe('420px')
})

it('UX-07: removing a pane keeps its draft, sends nothing and leaves the session alive', async () => {
  const engine = engineFixture({ sessions: [sessionFixture('ses_a', 'Backend API', 'proj_a'), sessionFixture('ses_b', 'Docs')] })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const user = userEvent.setup()
  const paneA = screen.getByRole('region', { name: 'Backend API' })
  await user.type(within(paneA).getByRole('textbox', { name: 'Mensaje' }), 'borrador pendiente')
  useSessionDockStore.getState().reveal('ses_a', 'files')
  await user.click(within(paneA).getByRole('button', { name: 'Opciones del panel' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Quitar del board' }))
  expect(screen.queryByRole('region', { name: 'Backend API' })).toBeNull()
  expect(useComposerStore.getState().draftsBySession.ses_a?.text).toBe('borrador pendiente')
  expect(engine.sendTo).not.toHaveBeenCalled()
  expect(engine.send).not.toHaveBeenCalled()
  expect(engine.closeSession).not.toHaveBeenCalled()
  expect(engine.cancelTurnFor).not.toHaveBeenCalled()
  // Ni el layout del dock ni la sesión se borran por quitar el panel.
  expect(useSessionDockStore.getState().layoutFor('ses_a')).toMatchObject({ visible: true, activeSurface: 'files' })
})

// Doc 03 §8.3: el panel se revela cuando el agente empieza a usar el browser.
//
// Reportado en uso real: el usuario no abrió el dock, el agente abrió una
// página y no había forma de verla. Que se revele es comodidad —la vista
// maqueta y se captura igual sin panel—, pero sin ella el navegador existe sin
// que nadie se entere.
it('revela el navegador cuando el contexto nativo pasa a estar listo, y sólo una vez', async () => {
  const bridge = createTestBridge()
  const restore = setPlatformForTests(bridge)
  try {
    render(<I18nProvider lang="es">{workspace('ses_a', { focused: true })}</I18nProvider>)
    expect(screen.queryByTestId('session-dock')).toBeNull()

    const ready = {
      session_id: 'ses_a',
      supported: true,
      host_registered: true,
      context_state: 'ready' as const,
      available: true,
      backend: 'electron-native',
      control: 'agent' as const,
      control_state: 'agent' as const,
      control_revision: 1,
      active_target_id: 't1',
      targets: [{ target_id: 't1', url: 'https://example.com/a', title: 'A', active: true }],
    }
    await act(async () => {
      bridge.emitBrowserContext(ready)
    })
    await waitFor(() =>
      expect(screen.getByTestId('session-dock').dataset.surface).toBe('browser'),
    )

    // Cerrarlo es decisión del usuario: otro aviso del mismo contexto no se lo
    // vuelve a abrir en la cara.
    act(() => useSessionDockStore.getState().setVisible('ses_a', false))
    await act(async () => {
      bridge.emitBrowserContext(ready)
    })
    expect(screen.queryByTestId('session-dock')).toBeNull()
  } finally {
    restore()
  }
})

// Doc 03 §8.3: un modal encima retira la vista nativa.
//
// El eslabón que se comprueba aquí es el del medio: que la cuenta global de
// overlays llegue hasta la geometría que se publica. Las dos puntas ya tienen
// prueba propia —el recuento en `stores/overlay`, y que `visible` se apague
// con `overlayDepth > 0` en `ViewLayoutCoordinator`—, pero sin este tramo el
// modal seguiría dibujándose debajo del navegador y las tres pasarían igual.
it('un overlay bloqueante viaja en la geometría del slot', async () => {
  const bridge = createTestBridge()
  const restore = setPlatformForTests(bridge)
  resetOverlaysForTests()
  try {
    bridge.browserContext = {
      session_id: 'ses_a',
      supported: true,
      host_registered: true,
      context_state: 'ready' as const,
      available: true,
      backend: 'electron-native',
      control: 'agent' as const,
      control_state: 'agent' as const,
      control_revision: 1,
      active_target_id: 't1',
      targets: [{ target_id: 't1', url: 'https://example.com/a', title: 'A', active: true }],
    }
    useSessionDockStore.getState().reveal('ses_a', 'browser')
    render(<I18nProvider lang="es">{workspace('ses_a', { focused: true })}</I18nProvider>)
    await waitFor(() => expect(bridge.browserLayouts.length).toBeGreaterThan(0))
    expect(bridge.browserLayouts.at(-1)!.overlayDepth).toBe(0)

    act(() => useOverlayStore.getState().raise('modal-de-prueba'))
    await waitFor(() => expect(bridge.browserLayouts.at(-1)!.overlayDepth).toBe(1))

    act(() => useOverlayStore.getState().drop('modal-de-prueba'))
    await waitFor(() => expect(bridge.browserLayouts.at(-1)!.overlayDepth).toBe(0))
  } finally {
    resetOverlaysForTests()
    restore()
  }
})

it('la pestaña Terminal aparece solo si el Engine anuncia la terminal', () => {
  useSessionDockStore.getState().reveal('ses_t', 'terminal')
  const view = (terminalEnabled: boolean) => (
    <I18nProvider lang="es">
      <SessionWorkspace sessionId="ses_t" record={sessionFixture('ses_t', 'ses_t')} density="normal" focused browserEnabled={false} terminalEnabled={terminalEnabled}>
        <div />
      </SessionWorkspace>
    </I18nProvider>
  )
  const { rerender } = render(view(false))
  // Sin capacidad, una superficie guardada «terminal» cae en Workspace.
  let dock = screen.getByTestId('session-dock')
  expect(dock.dataset.surface).toBe('workspace')
  expect(within(dock).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Archivos', 'Navegador', 'Workspace'])
  rerender(view(true))
  dock = screen.getByTestId('session-dock')
  expect(dock.dataset.surface).toBe('terminal')
  expect(within(dock).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Archivos', 'Navegador', 'Workspace', 'Terminal'])
  expect(screen.getByTestId('terminal-ses_t')).toBeTruthy()
})
