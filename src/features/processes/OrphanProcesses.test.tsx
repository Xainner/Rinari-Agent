// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { installMockPlatform } from '../../test/mockPlatform'
import { I18nProvider } from '../../i18n'
import OrphanProcesses from './OrphanProcesses'
import StopAllButton from './StopAllButton'
import type { ProcessPresentation } from './processesModel'

const { invoke } = installMockPlatform()
afterEach(() => {
  cleanup()
  vi.mocked(invoke).mockReset()
})

const orphan = (id: string, session_id: string, extra: Record<string, unknown> = {}) => ({
  id, session_id, handle: 'proc_001', pid: 4242, command: 'python -m http.server 8099', cwd: 'C:/app', name: null, port: 8099, ...extra,
})

it('lists what an earlier Engine left running and stops it (#90)', async () => {
  let alive = [orphan('o1', 's1'), orphan('o2', 's2', { name: 'vite', port: 5173 })]
  vi.mocked(invoke).mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'process_orphans_list') return { orphans: alive }
    if (command === 'process_orphan_stop') {
      alive = alive.filter((item) => item.id !== args?.id)
      return { stopped: true }
    }
    throw new Error(`Unexpected ${command}`)
  })
  render(<I18nProvider lang="es"><OrphanProcesses sessionId="s1" /></I18nProvider>)
  expect(await screen.findByText('Huérfanos · 2')).toBeTruthy()
  expect(screen.getByText(':5173')).toBeTruthy()
  expect(screen.getByText('otra conversación')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Detener vite' }))
  await waitFor(() => expect(screen.getByText('Huérfanos · 1')).toBeTruthy())
  expect(invoke).toHaveBeenCalledWith('process_orphan_stop', { id: 'o2' })
  cleanup()
  // En el dock, solo los de la conversación.
  alive = [orphan('o3', 's2')]
  render(<I18nProvider lang="es"><OrphanProcesses sessionId="s1" onlySession /></I18nProvider>)
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('process_orphans_list', {}))
  expect(screen.queryByTestId('orphan-processes')).toBeNull()
})

it('«Stop all» asks for a second click and stops only what Rinari runs', () => {
  const item = (id: string, kind: string, running = true) => ({ resource: { id, kind, command: id, cwd: '', running, can_stop: running } }) as unknown as ProcessPresentation
  const stop = vi.fn()
  render(<I18nProvider lang="es"><StopAllButton items={[item('a', 'process'), item('b', 'preview'), item('c', 'pty'), item('d', 'process', false)]} stop={stop} /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Detener todos' }))
  expect(stop).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '¿Detener los 2?' }))
  expect(stop.mock.calls.map(([id]) => id)).toEqual(['a', 'b'])
})
