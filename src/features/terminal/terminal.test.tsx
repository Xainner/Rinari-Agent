// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { EngineEventMsg } from '../../services/engine'

let emit: (event: EngineEventMsg) => void = () => {}
vi.mock('../../services/engine', () => ({
  engineApi: {
    ptyShells: vi.fn(),
    ptyStart: vi.fn(),
    ptyList: vi.fn(),
    ptyRead: vi.fn(),
    ptyWrite: vi.fn(async () => ({})),
    ptyResize: vi.fn(async () => ({})),
    ptyTerminate: vi.fn(async () => ({})),
  },
  onEngineEvent: vi.fn(async (listener: (event: EngineEventMsg) => void) => {
    emit = listener
    return () => {}
  }),
}))
vi.mock('../../lib/clipboard', () => ({ copyText: vi.fn(async () => true) }))

// xterm necesita un canvas y medidas reales: se sustituye por un registro.
const { FakeTerminal, terminals } = vi.hoisted(() => {
  const terminals: { written: string[]; options: Record<string, unknown>; type: (data: string) => void; flush: () => void }[] = []
  class FakeTerminal {
    written: string[] = []
    options: Record<string, unknown>
    cols = 80
    rows = 24
    private dataListener: (data: string) => void = () => {}
    constructor(options: Record<string, unknown>) {
      this.options = { ...options }
      terminals.push(this)
    }
    loadAddon() {}
    open() {}
    focus() {}
    dispose() {}
    /** Callbacks de escritura retenidos: xterm procesa la salida de forma asíncrona. */
    held: (() => void)[] = []
    write(data: string, done?: () => void) {
      this.written.push(data)
      if (done) this.held.push(done)
    }
    flush() { for (const done of this.held.splice(0)) done() }
    attachCustomKeyEventHandler() {}
    hasSelection() { return false }
    getSelection() { return '' }
    clearSelection() {}
    onData(listener: (data: string) => void) {
      this.dataListener = listener
      return { dispose() {} }
    }
    type(data: string) { this.dataListener(data) }
  }
  return { FakeTerminal, terminals }
})
vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerminal }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import TerminalPanel, { resetTerminalPanelForTests } from './TerminalPanel'
import XtermView from './XtermView'
import {
  loadTerminalPrefs,
  nextTerminalTitle,
  resetTerminalStoreForTests,
  saveTerminalPrefs,
  TERMINAL_PREFS_KEY,
  useTerminalStore,
} from './terminalStore'

const SHELLS = {
  supported: true,
  shells: [
    { id: 'pwsh', label: 'PowerShell', command: '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo' },
    { id: 'cmd', label: 'Símbolo del sistema', command: 'cmd.exe' },
  ],
}

beforeEach(() => {
  terminals.length = 0
  window.localStorage.clear()
  resetTerminalStoreForTests()
  resetTerminalPanelForTests()
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} }
  vi.mocked(engineApi.ptyShells).mockResolvedValue(SHELLS)
  vi.mocked(engineApi.ptyList).mockResolvedValue({ ptys: [] })
  vi.mocked(engineApi.ptyRead).mockResolvedValue({ pty_id: 'pty_001', alive: true, exit_code: null, data: '', offset: 0 })
  let n = 0
  vi.mocked(engineApi.ptyStart).mockImplementation(async () => ({ pty_id: `pty_00${++n}`, session_id: 'ses_a' }))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const panel = (sessionId = 'ses_a') => render(<I18nProvider lang="es"><TerminalPanel sessionId={sessionId} /></I18nProvider>)

it('titles repeat with a number and closing picks the neighbour', () => {
  const store = useTerminalStore.getState()
  store.add('s', { ptyId: 'a', title: nextTerminalTitle('PowerShell', []) })
  store.add('s', { ptyId: 'b', title: nextTerminalTitle('PowerShell', useTerminalStore.getState().bySession.s) })
  store.add('s', { ptyId: 'c', title: 'cmd' })
  expect(useTerminalStore.getState().bySession.s.map((tab) => tab.title)).toEqual(['PowerShell', 'PowerShell 2', 'cmd'])
  store.select('s', 'b')
  store.remove('s', 'b')
  expect(useTerminalStore.getState().active.s).toBe('c')
  store.remove('s', 'c')
  expect(useTerminalStore.getState().active.s).toBe('a')
  store.markExited('a', 3)
  expect(useTerminalStore.getState().bySession.s[0]).toMatchObject({ exited: true, exitCode: 3 })
})

it('prefs survive a reload and ignore unknown font sizes', () => {
  saveTerminalPrefs({ shellId: 'cmd', fontSize: 15 })
  expect(loadTerminalPrefs()).toEqual({ shellId: 'cmd', fontSize: 15 })
  window.localStorage.setItem(TERMINAL_PREFS_KEY, JSON.stringify({ shellId: 3, fontSize: 99 }))
  expect(loadTerminalPrefs()).toEqual({ shellId: '', fontSize: 13 })
})

it('opens the first terminal by itself with the default shell, in the session', async () => {
  panel()
  await screen.findByRole('tab', { name: /PowerShell/ })
  expect(engineApi.ptyStart).toHaveBeenCalledTimes(1)
  expect(vi.mocked(engineApi.ptyStart).mock.calls[0][0]).toMatchObject({ sessionId: 'ses_a', command: SHELLS.shells[0].command })
})

it('adopts the live terminals of the session after a window reload instead of opening another', async () => {
  vi.mocked(engineApi.ptyList).mockResolvedValue({
    ptys: [
      { pty_id: 'pty_007', command: 'cmd.exe', alive: true, session_id: 'ses_a' },
      { pty_id: 'pty_008', command: 'cmd.exe', alive: true, session_id: 'ses_other' },
      { pty_id: 'pty_009', command: 'cmd.exe', alive: false, session_id: 'ses_a' },
    ],
  })
  panel()
  await screen.findByRole('tab', { name: /Símbolo del sistema/ })
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  expect(engineApi.ptyStart).not.toHaveBeenCalled()
})

it('closing a tab terminates its PTY; closing the last one does not reopen it', async () => {
  panel()
  await screen.findByRole('tab', { name: /PowerShell/ })
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar PowerShell' }))
  await waitFor(() => expect(engineApi.ptyTerminate).toHaveBeenCalledWith('pty_001'))
  cleanup()
  panel()
  expect(await screen.findAllByRole('button', { name: 'Nueva terminal' })).toHaveLength(2)
  expect(screen.queryByRole('tab')).toBeNull()
  expect(engineApi.ptyStart).toHaveBeenCalledTimes(1)
})

it('says so when the Engine has no terminal backend', async () => {
  vi.mocked(engineApi.ptyShells).mockResolvedValue({ supported: false, shells: [] })
  panel()
  await screen.findByText('El Engine no encontró un backend de terminal en este equipo.')
  expect(engineApi.ptyStart).not.toHaveBeenCalled()
})

it('repaints from pty.read and skips the events the repaint already had', async () => {
  vi.mocked(engineApi.ptyRead).mockResolvedValue({ pty_id: 'pty_001', alive: true, exit_code: null, data: 'PS C:\\> ', offset: 8 })
  render(<XtermView ptyId="pty_001" fontSize={13} exited={false} />)
  await waitFor(() => expect(terminals[0]?.written).toEqual(['PS C:\\> ']))
  act(() => {
    emit({ type: 'event', event: 'pty.output', payload: { pty_id: 'pty_001', data: 'PS C:\\> ', offset: 8 } })
    emit({ type: 'event', event: 'pty.output', payload: { pty_id: 'pty_002', data: 'otra', offset: 20 } })
    emit({ type: 'event', event: 'pty.output', payload: { pty_id: 'pty_001', data: 'dir', offset: 11 } })
  })
  expect(terminals[0].written).toEqual(['PS C:\\> ', 'dir'])
  // La respuesta de xterm a una consulta vieja del repintado no llega al shell.
  terminals[0].type('\x1b[?1;2c')
  expect(engineApi.ptyWrite).not.toHaveBeenCalled()
  terminals[0].flush()
  terminals[0].type('\r')
  expect(engineApi.ptyWrite).toHaveBeenCalledWith('pty_001', '\r')
})

it('marks the tab closed when the process exits and stops sending keys', async () => {
  useTerminalStore.getState().add('ses_a', { ptyId: 'pty_001', title: 'PowerShell' })
  const { rerender } = render(<XtermView ptyId="pty_001" fontSize={13} exited={false} />)
  await waitFor(() => expect(terminals).toHaveLength(1))
  act(() => emit({ type: 'event', event: 'pty.exit', payload: { pty_id: 'pty_001', exit_code: 0 } }))
  expect(useTerminalStore.getState().bySession.ses_a[0]).toMatchObject({ exited: true, exitCode: 0 })
  rerender(<XtermView ptyId="pty_001" fontSize={15} exited />)
  terminals[0].type('x')
  expect(engineApi.ptyWrite).not.toHaveBeenCalled()
  expect(terminals[0].options.fontSize).toBe(15)
})
