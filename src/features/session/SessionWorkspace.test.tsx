// @vitest-environment jsdom
// Doc 01 §5: un workspace visual por sesión (chat + panel lateral con sus
// vistas en mosaico, #47) compartido por Normal y Boards (UX-07, UX-08, UX-09).
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
vi.mock('../workspace/ChangesPanel', () => ({ default: ({ path }: { path: string }) => <div data-testid={`changes-${path}`} /> }))
vi.mock('../workspace/CheckpointsPanel', () => ({ default: () => <div data-testid="checkpoints" /> }))
vi.mock('../workspace/ArtifactsPanel', () => ({ default: () => <div data-testid="artifacts" /> }))
vi.mock('../summary/SummaryPanel', () => ({ default: () => <div data-testid="summary-panel" /> }))

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

it('mounts one dock per session; a file link reveals Files in that dock only', async () => {
  render(<I18nProvider lang="es">{workspace('ses_a')}{workspace('ses_b', { focused: false })}</I18nProvider>)
  expect(screen.queryByTestId('session-dock')).toBeNull()
  const user = userEvent.setup()
  await user.click(screen.getByText('Open plan ses_a'))
  const dock = await screen.findByTestId('session-dock')
  expect(dock.dataset.sessionId).toBe('ses_a')
  expect(dock.dataset.views).toBe('files')
  expect(within(dock).getAllByTestId('dock-view').map((tile) => tile.getAttribute('aria-label'))).toEqual(['Archivos'])
  expect(await within(dock).findByRole('heading', { name: 'Planning document' })).toBeTruthy()
  // Artefactos vive al pie de Archivos (#47).
  expect(within(dock).getByText('Artefactos')).toBeTruthy()
  expect(screen.getAllByTestId('session-dock')).toHaveLength(1)
  // El chat sigue montado al lado: el panel ocupa espacio real, no lo cubre.
  expect(screen.getByTestId('chat-ses_a')).toBeTruthy()
  expect(dock.closest('.session-workspace')?.getAttribute('data-dock')).toBe('docked')
})

it.each([
  ['es', 'Panel lateral de la sesión', 'Cerrar Archivos', 'Ancho del panel lateral'],
  ['en', 'Session side panel', 'Close Files', 'Side panel width'],
] as const)('uses consistent side panel names in %s, including each view close button', (lang, label, close, width) => {
  useSessionDockStore.getState().reveal('ses_a', 'files')
  render(<I18nProvider lang={lang}>{workspace('ses_a')}</I18nProvider>)
  expect(screen.getByRole('complementary', { name: label })).toBeTruthy()
  const button = screen.getByRole('button', { name: close })
  expect(button.title).toBe(close)
  expect(screen.getByRole('separator', { name: width })).toBeTruthy()
  fireEvent.click(button)
  expect(screen.queryByTestId('session-dock')).toBeNull()
  expect(screen.getByTestId('chat-ses_a')).toBeTruthy()
})

it('stacks views in the mosaic, amplifies one and Escape gives the width back', async () => {
  useSessionDockStore.getState().reveal('ses_a', 'files')
  useSessionDockStore.getState().reveal('ses_a', 'workspace', { workspaceTab: 'checkpoints' })
  render(<I18nProvider lang="es">{workspace('ses_a')}</I18nProvider>)
  const dock = screen.getByTestId('session-dock')
  expect(dock.dataset.views).toBe('files changes')
  // Revelar hacia Checkpoints abre su sección al pie de Cambios.
  await waitFor(() => expect(within(dock).getByTestId('checkpoints')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Ampliar Cambios' }))
  expect(screen.getByTestId('session-dock').dataset.views).toBe('changes')
  expect(screen.getByTestId('session-dock').closest('.session-workspace')?.getAttribute('data-amp')).toBe('true')
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(screen.getByTestId('session-dock').dataset.views).toBe('files changes'))
})

it('#82: el Resumen flota sobre el chat; no abre el panel, no cambia sus vistas y Esc lo cierra', async () => {
  useSessionDockStore.getState().reveal('ses_a', 'files')
  render(<I18nProvider lang="es">{workspace('ses_a')}</I18nProvider>)
  const workspaceEl = screen.getByTestId('session-dock').closest('.session-workspace')!
  act(() => useSessionDockStore.getState().toggleSummary('ses_a'))
  const summary = screen.getByTestId('summary-dock')
  // Dentro de la columna del chat, encima; el panel sigue igual, con sus vistas.
  expect(summary.closest('.session-workspace-chat')).toBeTruthy()
  expect(summary.className).toBe('summary-float')
  expect(screen.getByTestId('session-dock').dataset.views).toBe('files')
  expect(workspaceEl.getAttribute('data-dock')).toBe('docked')
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByTestId('summary-dock')).toBeNull())
  expect(screen.getByTestId('session-dock').dataset.views).toBe('files')
  // Sin vistas, abrirlo no muestra el panel.
  act(() => useSessionDockStore.getState().closeView('ses_a', 'files'))
  act(() => useSessionDockStore.getState().toggleSummary('ses_a'))
  expect(screen.getByTestId('summary-dock')).toBeTruthy()
  expect(screen.queryByTestId('session-dock')).toBeNull()
  expect(workspaceEl.getAttribute('data-dock')).toBe('hidden')
})

it('con el chat muy angosto el Resumen se aparta sin cerrarse y vuelve solo al haber sitio', async () => {
  render(<I18nProvider lang="es">{workspace('ses_a')}</I18nProvider>)
  const chat = document.querySelector('.session-workspace-chat') as HTMLElement
  let width = 600
  chat.getBoundingClientRect = () => ({ width, height: 700, top: 0, left: 0, right: width, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  act(() => useSessionDockStore.getState().toggleSummary('ses_a'))
  await waitFor(() => expect(screen.queryByTestId('summary-dock')).toBeNull())
  expect(useSessionDockStore.getState().summaries).not.toEqual({})
  // Vuelve a haber sitio (el observador de la columna avisa): regresa solo.
  width = 900
  for (const observer of resizeObservers) if (observer.element === chat) act(() => observer.callback([{ contentRect: { width } }]))
  expect(screen.getByTestId('summary-dock')).toBeTruthy()
  // En el borde no parpadea: 740 está entre los dos umbrales y sigue a la vista.
  width = 740
  for (const observer of resizeObservers) if (observer.element === chat) act(() => observer.callback([{ contentRect: { width } }]))
  expect(screen.getByTestId('summary-dock').hasAttribute('data-leaving')).toBe(false)
})

it('al cambiar de conversación en el mismo espacio, el panel y el Resumen no animan su entrada ni su salida', () => {
  useSessionDockStore.getState().reveal('ses_a', 'files')
  useSessionDockStore.getState().toggleSummary('ses_b')
  const view = render(<I18nProvider lang="es">{workspace('ses_a')}</I18nProvider>)
  expect(screen.getByTestId('session-dock').hasAttribute('data-entering')).toBe(false)
  // ses_b: sin panel y con su Resumen abierto. El panel de ses_a no se pliega con un fantasma.
  view.rerender(<I18nProvider lang="es">{workspace('ses_b')}</I18nProvider>)
  expect(screen.queryByTestId('session-dock')).toBeNull()
  expect(document.querySelector('.pane-dock-ghost')).toBeNull()
  expect(screen.getByTestId('summary-dock').hasAttribute('data-still')).toBe(true)
  // De vuelta a ses_a: su panel aparece tal cual y el Resumen de ses_b no se queda saliendo.
  view.rerender(<I18nProvider lang="es">{workspace('ses_a')}</I18nProvider>)
  expect(screen.getByTestId('session-dock').hasAttribute('data-entering')).toBe(false)
  expect(screen.queryByTestId('summary-dock')).toBeNull()
  // Abrirlo uno mismo sí entra con movimiento.
  act(() => useSessionDockStore.getState().toggleSummary('ses_a'))
  expect(screen.getByTestId('summary-dock').hasAttribute('data-still')).toBe(false)
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
  useSessionDockStore.getState().reveal('ses_a', 'files')
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
  expect(screen.getByTestId('session-dock').contains(document.activeElement)).toBe(true)
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
  useSessionDockStore.getState().reveal('ses_a', 'workspace', { workspaceTab: 'artifacts' })
  useSessionDockStore.getState().setWidth('ses_a', 420)
  const normal = render(<I18nProvider lang="es">{workspace('ses_a')}</I18nProvider>)
  expect(screen.getByTestId('session-dock').dataset.views).toBe('files')
  expect(screen.getByTestId('session-dock').style.width).toBe('420px')
  normal.unmount()

  const engine = engineFixture({ sessions: [sessionFixture('ses_a', 'Backend API', 'proj_a')] })
  useBoardStore.getState().addPane('ses_a')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const pane = screen.getByRole('region', { name: 'Backend API' })
  const dock = within(pane).getByTestId('session-dock')
  expect(dock.dataset.views).toBe('files')
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
  expect(useSessionDockStore.getState().layoutFor('ses_a')).toMatchObject({ visible: true, views: ['files'] })
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
      expect(screen.getByTestId('session-dock').dataset.views).toBe('browser'),
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

it('la vista Terminal aparece solo si el Engine anuncia la terminal', () => {
  useSessionDockStore.getState().reveal('ses_t', 'terminal')
  const view = (terminalEnabled: boolean) => (
    <I18nProvider lang="es">
      <SessionWorkspace sessionId="ses_t" record={sessionFixture('ses_t', 'ses_t')} density="normal" focused browserEnabled={false} terminalEnabled={terminalEnabled}>
        <div />
      </SessionWorkspace>
    </I18nProvider>
  )
  const { rerender } = render(view(false))
  // Sin capacidad, una vista guardada «terminal» no se muestra.
  expect(screen.getByTestId('session-dock').dataset.views).toBe('')
  expect(screen.queryByTestId('terminal-ses_t')).toBeNull()
  rerender(view(true))
  expect(screen.getByTestId('session-dock').dataset.views).toBe('terminal')
  expect(screen.getByTestId('terminal-ses_t')).toBeTruthy()
})
