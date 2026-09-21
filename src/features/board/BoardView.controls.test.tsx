// @vitest-environment jsdom
// Doc 01 §3: el Composer es el único propietario de modelo, modo, razonamiento
// y permisos por sesión. Header y titlebar no compiten con él (UX-01/UX-02).
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../services/desktop', () => ({
  desktopApi: { questions: vi.fn(async () => ({ questions: [] })), readFile: vi.fn(), answer: vi.fn() },
}))
vi.mock('../workspace/WorkspaceView', () => ({
  default: ({ session }: { session: { id: string } | null }) => <div data-testid={`workspace-${session?.id ?? 'none'}`} />,
}))

import { I18nProvider } from '../../i18n'
import type { ModelSummary } from '../../services/engine'
import { useBoardStore, defaultBoard } from '../../stores/board'
import { useComposerStore } from '../../stores/composer'
import AppStatusBar from '../../components/app-shell/AppStatusBar'
import { resetPendingQuestionsForTests } from '../questions/usePendingQuestions'
import BoardView from './BoardView'
import { BoardHarness, engineFixture, sessionFixture } from './testUtils'

beforeEach(() => {
  window.localStorage.clear()
  resetPendingQuestionsForTests()
  useBoardStore.getState().hydrate(defaultBoard())
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(cleanup)

const models: ModelSummary[] = [
  { alias: 'opus', provider: 'anthropic', provider_model_id: 'claude-opus', active: true, capabilities: {} } as unknown as ModelSummary,
  { alias: 'sonnet', provider: 'anthropic', provider_model_id: 'claude-sonnet', active: false, capabilities: {} } as unknown as ModelSummary,
]
const sessions = [sessionFixture('ses_a', 'Backend API', 'proj_a'), sessionFixture('ses_b', 'Docs')]

/** Controles editables de la siguiente petición dentro de un contenedor. */
function editableControls(container: HTMLElement) {
  return {
    modeGroups: within(container).queryAllByRole('group', { name: 'Modo' }),
    modelButtons: within(container).queryAllByTitle('Elegir modelo'),
    modeButtons: within(container).queryAllByRole('button', { name: /^(PLAN|BUILD|REVIEW)$/ }),
  }
}

it('UX-01: one model selector and one mode group per pane, none in the pane header', () => {
  const engine = engineFixture({ sessions, models })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  for (const name of ['Backend API', 'Docs']) {
    const pane = screen.getByRole('region', { name })
    const controls = editableControls(pane)
    expect(controls.modeGroups).toHaveLength(1)
    expect(controls.modelButtons).toHaveLength(1)
    // PLAN/BUILD/REVIEW live once, inside the Composer's mode group.
    expect(controls.modeButtons).toHaveLength(3)
    expect(controls.modeButtons.every((button) => controls.modeGroups[0]!.contains(button))).toBe(true)
    const header = within(pane).getByTestId('pane-header')
    const headerControls = editableControls(header)
    expect(headerControls.modeGroups).toHaveLength(0)
    expect(headerControls.modelButtons).toHaveLength(0)
    expect(headerControls.modeButtons).toHaveLength(0)
    expect(within(header).queryByRole('button', { name: /modelo|model/i })).toBeNull()
  }
})

it('UX-01: the status bar shows identity and view state, never a model or mode editor', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar
        context={<span>ctx</span>}
        selectedView="board"
        onSelectView={() => {}}
        toggleShortcut="mod+b"
        engineState="ready"
        workingCount={1}
        attentionCount={0}
        boardAttentionCount={0}
        attentionMenu={null}
        onOpenMobileSidebar={() => {}}
        onToggleSidebar={() => {}}
        sidebarCollapsed={false}
      />
    </I18nProvider>,
  )
  const bar = screen.getByRole('banner', { name: 'Barra de estado' })
  const controls = editableControls(bar)
  expect(controls.modeGroups).toHaveLength(0)
  expect(controls.modelButtons).toHaveLength(0)
  expect(within(bar).queryByRole('button', { name: /modelo|model|PLAN|BUILD|REVIEW/ })).toBeNull()
})

it('UX-02: changing the mode in pane B while A is running only touches B', async () => {
  const engine = engineFixture({ sessions, models, busySessionIds: new Set(['ses_a']) })
  engine.runtime.getState().dispatch({ type: 'busy/set', sessionId: 'ses_a', busy: true })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const user = userEvent.setup()
  const paneA = screen.getByRole('region', { name: 'Backend API' })
  const paneB = screen.getByRole('region', { name: 'Docs' })
  // A is busy: its mode buttons are guarded; B is free to change.
  const planA = within(within(paneA).getByRole('group', { name: 'Modo' })).getByRole('button', { name: 'PLAN' })
  expect((planA as HTMLButtonElement).disabled).toBe(true)
  await user.click(within(within(paneB).getByRole('group', { name: 'Modo' })).getByRole('button', { name: 'PLAN' }))
  expect(engine.setModeFor).toHaveBeenCalledTimes(1)
  expect(engine.setModeFor).toHaveBeenCalledWith('ses_b', 'plan')
  expect(engine.setMode).not.toHaveBeenCalled()
  // Model change from B's composer binds to B and never rewrites the global default.
  await user.click(within(paneB).getByTitle('Elegir modelo'))
  await user.click(await screen.findByRole('button', { name: /sonnet/ }))
  expect(engine.useModelFor).toHaveBeenCalledWith('ses_b', expect.objectContaining({ alias: 'sonnet' }), { setGlobalDefault: false })
  expect(engine.useModelFor).not.toHaveBeenCalledWith('ses_a', expect.anything(), expect.anything())
  expect(engine.useModel).not.toHaveBeenCalled()
})

it('"Configurar siguiente mensaje" focuses the pane composer instead of opening another editor', async () => {
  const engine = engineFixture({ sessions, models })
  useBoardStore.getState().addPane('ses_a')
  useBoardStore.getState().addPane('ses_b')
  render(<BoardHarness engine={engine}><BoardView /></BoardHarness>)
  const user = userEvent.setup()
  const paneA = screen.getByRole('region', { name: 'Backend API' })
  // B holds focus (last added pane); the request must reach A's own composer.
  expect(screen.getByRole('region', { name: 'Docs' }).getAttribute('data-focused')).toBe('true')
  await user.click(within(paneA).getByRole('button', { name: 'Opciones del panel' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Configurar siguiente mensaje' }))
  await act(async () => {})
  expect(document.activeElement).toBe(within(paneA).getByRole('textbox', { name: 'Mensaje' }))
  expect(paneA.getAttribute('data-focused')).toBe('true')
  // No second editable surface appeared anywhere.
  expect(screen.getAllByRole('group', { name: 'Modo' })).toHaveLength(2)
  expect(screen.getAllByTitle('Elegir modelo')).toHaveLength(2)
})
