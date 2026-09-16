// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ProcessRuntimeProvider } from './ProcessRuntimeProvider'
import { useSessionProcesses } from './useSessionProcesses'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function Probe({ sessionId, observeOutput = false }: { sessionId: string; observeOutput?: boolean }) {
  const snap = useSessionProcesses(sessionId, { observeOutput })
  useEffect(() => {}, [snap])
  return (
    <div data-testid={`rows-${sessionId}${observeOutput ? '-out' : ''}`}>
      {snap.ordered.map((item) => item.resource.id).join(',')}
    </div>
  )
}

it('aísla sesiones y comparte un solo poller por sesión', async () => {
  const rowA = { id: 'process:proc_001', kind: 'process', command: 'npm run dev', cwd: 'C:/a', running: true, can_stop: true }
  const rowB = { id: 'process:proc_001', kind: 'process', command: 'python worker.py', cwd: 'C:/b', running: true, can_stop: true }
  const listCalls: string[] = []
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'workspace_process_list') {
      const sessionId = (args as { session_id: string }).session_id
      listCalls.push(sessionId)
      if (sessionId === 'A') return { processes: [rowA], truncated: false }
      if (sessionId === 'B') return { processes: [rowB], truncated: false }
      return { processes: [], truncated: false }
    }
    throw new Error(`Unexpected command ${String(command)}`)
  })

  render(
    <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={true} hasIdentity={false}>
      <Probe sessionId="A" />
      <Probe sessionId="A" observeOutput={true} />
      <Probe sessionId="B" />
    </ProcessRuntimeProvider>,
  )

  await waitFor(() => expect(screen.getByTestId('rows-A').textContent).toBe('process:proc_001'))
  await waitFor(() => expect(screen.getByTestId('rows-B').textContent).toBe('process:proc_001'))
  // Mismo ID opaco en dos sesiones: cada ámbito conserva su propio snapshot.
  expect(screen.getByTestId('rows-A').textContent).toBe('process:proc_001')
  expect(screen.getByTestId('rows-B').textContent).toBe('process:proc_001')
  // Dos suscriptores sobre A comparten una sola consulta inicial, no una por fila.
  expect(listCalls.filter((id) => id === 'A')).toHaveLength(1)
  expect(listCalls.filter((id) => id === 'B')).toHaveLength(1)
  expect(invoke).toHaveBeenCalledWith('workspace_process_list', { session_id: 'A' })
  expect(invoke).toHaveBeenCalledWith('workspace_process_list', { session_id: 'B' })
})

it('no llama al engine sin capability', async () => {
  vi.mocked(invoke).mockResolvedValue({ processes: [], truncated: false })
  render(
    <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={false} hasIdentity={false}>
      <Probe sessionId="A" />
    </ProcessRuntimeProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('rows-A').textContent).toBe(''))
  expect(invoke).not.toHaveBeenCalled()
})
