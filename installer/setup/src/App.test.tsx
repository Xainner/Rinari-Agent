// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const native = vi.hoisted(() => ({ invoke: vi.fn(), close: vi.fn(), listen: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ close: native.close }) }))

const status = {
  installed: false, legacy_install: false, version: null, available_version: '0.2.4',
  update_available: false, install_dir: 'C:\\isolated\\Rinari Agent', scope: 'user',
  start_menu: false, desktop: false, cli_path: false, required_bytes: 1,
  available_bytes: 100, conflicting_cli: null,
}
function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const calls = () => native.invoke.mock.calls.map(([name]) => name)
async function ready() {
  render(<App />)
  await screen.findByText('Rinari Agent 0.2.4')
  return screen.getByRole('button', { name: 'Run Rinari Agent' })
}

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en')
  window.history.replaceState({}, '', '/?screen=ready')
  native.listen.mockResolvedValue(() => {})
  native.close.mockResolvedValue(undefined)
  native.invoke.mockImplementation(async (name: string) => {
    if (name === 'setup_status') return status
    if (name === 'setup_operation_state') return { active: false, cancellable: false }
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('installer Ready launch and close', () => {
  it('stays open on Ready and waits for launch success before requesting a guarded close', async () => {
    const launch = deferred()
    const button = await ready()
    expect(calls()).toEqual(['setup_status'])
    expect(native.close).not.toHaveBeenCalled()
    native.invoke.mockImplementationOnce(() => launch.promise)
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Starting Rinari Agent…' }).hasAttribute('disabled')).toBe(true)
    expect(native.close).not.toHaveBeenCalled()
    expect(calls()).not.toContain('setup_operation_state')
    await act(async () => launch.resolve())
    expect(calls()).toEqual(['setup_status', 'launch_agent', 'setup_operation_state'])
    expect(native.close).toHaveBeenCalledTimes(1)
  })

  it('ignores repeated clicks while launching and while closing', async () => {
    const launch = deferred(), close = deferred()
    const button = await ready()
    native.invoke.mockImplementationOnce(() => launch.promise)
    native.close.mockReturnValue(close.promise)
    act(() => { button.click(); button.click() })
    expect(calls().filter((name) => name === 'launch_agent')).toHaveLength(1)
    await act(async () => launch.resolve())
    fireEvent.click(screen.getByRole('button', { name: 'Closing the installer…' }))
    expect(native.close).toHaveBeenCalledTimes(1)
    await act(async () => close.resolve())
  })

  it.each(['en', 'es'])('shows launch failure and retries successfully in %s', async (locale) => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(locale)
    render(<App />)
    await screen.findByText('Rinari Agent 0.2.4')
    const name = locale === 'es' ? 'Ejecutar Rinari Agent' : 'Run Rinari Agent'
    native.invoke.mockRejectedValueOnce('OS error 2')
    fireEvent.click(screen.getByRole('button', { name }))
    expect((await screen.findByRole('alert')).textContent).toContain(locale === 'es' ? 'No se pudo iniciar' : 'Could not start')
    expect(screen.getByRole('alert').textContent).toContain('OS error 2')
    expect(native.close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name }))
    await waitFor(() => expect(native.close).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(calls().filter((call) => call === 'launch_agent')).toHaveLength(2)
  })

  it('retries only closing if Agent launched but closing failed', async () => {
    const button = await ready()
    native.close.mockRejectedValueOnce('Window close failed')
    fireEvent.click(button)
    expect((await screen.findByRole('alert')).textContent).toContain('Could not close')
    fireEvent.click(screen.getByRole('button', { name: 'Retry closing' }))
    await waitFor(() => expect(native.close).toHaveBeenCalledTimes(2))
    expect(calls().filter((call) => call === 'launch_agent')).toHaveLength(1)
  })

  it('does not relaunch if the operation-state request fails', async () => {
    const button = await ready()
    native.invoke.mockResolvedValueOnce(undefined).mockRejectedValueOnce('IPC unavailable')
    fireEvent.click(button)
    await screen.findByRole('alert')
    expect(native.close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry closing' }))
    await waitFor(() => expect(native.close).toHaveBeenCalledTimes(1))
    expect(calls().filter((call) => call === 'launch_agent')).toHaveLength(1)
  })

  it.each([true, false])('preserves the active-operation guard (cancellable=%s)', async (cancellable) => {
    const button = await ready()
    native.invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ active: true, cancellable })
    fireEvent.click(button)
    expect((await screen.findByRole('alert')).textContent).toContain('operation is still running')
    expect(calls().includes('cancel_operation')).toBe(cancellable)
    expect(native.close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry closing' }))
    await waitFor(() => expect(native.close).toHaveBeenCalledTimes(1))
    expect(calls().filter((call) => call === 'launch_agent')).toHaveLength(1)
  })

  it('can close without launching Agent', async () => {
    await ready()
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)
    await waitFor(() => expect(native.close).toHaveBeenCalledTimes(1))
    expect(calls()).not.toContain('launch_agent')
  })

  it.each(['install', 'update'])('uses the same launch flow after %s completes', async (operation) => {
    window.history.replaceState({}, '', '/')
    if (operation === 'update') native.invoke.mockResolvedValueOnce({ ...status, installed: true, version: '0.2.3', update_available: true })
    render(<App />)
    const button = await screen.findByRole('button', { name: operation === 'install' ? 'Install Rinari Agent' : /^Update/ })
    fireEvent.click(button)
    const launch = await screen.findByRole('button', { name: 'Run Rinari Agent' })
    expect(native.close).not.toHaveBeenCalled()
    fireEvent.click(launch)
    await waitFor(() => expect(native.close).toHaveBeenCalledTimes(1))
    expect(calls()).toContain('execute_plan')
  })

  it('simulates launch and close in the browser preview without native calls', async () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Run Rinari Agent' }))
    await screen.findByText('Preview: launch and close simulated.')
    expect(native.invoke).not.toHaveBeenCalled()
    expect(native.close).not.toHaveBeenCalled()
  })
})
