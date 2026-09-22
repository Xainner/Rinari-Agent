// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { invoke } = installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { ProcessRuntimeProvider } from './ProcessRuntimeProvider'
import { useSessionProcesses, type SessionProcesses } from './useSessionProcesses'
import { I18nProvider } from '../../i18n'

afterEach(() => { cleanup(); vi.clearAllMocks() })

function Probe({ sessionId, onSnap }: { sessionId: string; onSnap: (snap: SessionProcesses) => void }) {
  const snap = useSessionProcesses(sessionId, { observeOutput: false })
  useEffect(() => {
    onSnap(snap)
  }, [snap, onSnap])
  return (
    <div data-testid={`rows-${sessionId}`}>
      {snap.ordered.map((item) => item.resource.command).join(',')}
    </div>
  )
}

function bootRow(command: string, generation: number) {
  return {
    id: 'process:proc_001',
    kind: 'process',
    command,
    cwd: 'C:/a',
    running: true,
    can_stop: true,
    generation,
  }
}

it('envía precondiciones de identidad en stop cuando hay capability', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [bootRow('npm run dev', 3)], truncated: false, engine_instance_id: 'boot-1' }
    }
    if (command === 'workspace_process_stop') return { id: 'process:proc_001', running: false }
    throw new Error(`Unexpected ${String(command)}`)
  })
  let latest: SessionProcesses | null = null
  render(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={true} hasIdentity={true}>
        <Probe sessionId="A" onSnap={(snap) => { latest = snap }} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('rows-A').textContent).toBe('npm run dev'))
  await latest!.stop('process:proc_001')
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('workspace_process_stop', {
      session_id: 'A',
      id: 'process:proc_001',
      engine_instance_id: 'boot-1',
      generation: 3,
    }),
  )
})

it('sin capability no envía precondiciones (compatibilidad)', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [bootRow('npm run dev', 3)], truncated: false }
    }
    if (command === 'workspace_process_stop') return { id: 'process:proc_001', running: false }
    throw new Error(`Unexpected ${String(command)}`)
  })
  let latest: SessionProcesses | null = null
  render(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={true} hasIdentity={false}>
        <Probe sessionId="A" onSnap={(snap) => { latest = snap }} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('rows-A').textContent).toBe('npm run dev'))
  await latest!.stop('process:proc_001')
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('workspace_process_stop', {
      session_id: 'A',
      id: 'process:proc_001',
    }),
  )
})

it('un cambio de instancia invisible reinicia el ámbito sin reproducir nada', async () => {
  let instance = 'boot-1'
  let command = 'npm run dev'
  const stopCalls: unknown[] = []
  vi.mocked(invoke).mockImplementation(async (commandName, args) => {
    if (commandName === 'workspace_process_list') {
      return {
        processes: [bootRow(command, 1)],
        truncated: false,
        engine_instance_id: instance,
      }
    }
    if (commandName === 'workspace_process_stop') {
      stopCalls.push(args)
      return { id: 'process:proc_001', running: false }
    }
    throw new Error(`Unexpected ${String(commandName)}`)
  })
  let latest: SessionProcesses | null = null
  render(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={7} engineReady={true} hasCapability={true} hasIdentity={true}>
        <Probe sessionId="A" onSnap={(snap) => { latest = snap }} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('rows-A').textContent).toBe('npm run dev'))
  // El engine se reinicia de forma invisible: misma época local, nueva instancia.
  instance = 'boot-2'
  command = 'python worker.py'
  await waitFor(() => expect(screen.getByTestId('rows-A').textContent).toBe('python worker.py'), {
    timeout: 5000,
  })
  expect(stopCalls).toEqual([])
  expect(latest!.selectedId).toBeNull()
}, 10000)
