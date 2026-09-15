import { describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { isManagedProcess, isProcessListResult, isProcessOutput, isProcessStopResult, processesApi } from './processes'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('processesApi', () => {
  it('no lista sin sesión ni crea sesión implícita', async () => {
    await expect(processesApi.list('')).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('envía snake_case con sesión e ID íntegros', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ processes: [], truncated: false })
    await processesApi.list('s1')
    expect(invoke).toHaveBeenCalledWith('workspace_process_list', { session_id: 's1' })
    vi.mocked(invoke).mockResolvedValueOnce({
      process: { id: 'process:proc_001', kind: 'process', command: 'npm run dev', cwd: 'C:/s', running: true, can_stop: true },
      stdout: '',
      stderr: '',
      truncated: false,
    })
    await processesApi.read('s1', 'process:proc_001')
    expect(invoke).toHaveBeenCalledWith('workspace_process_read', { session_id: 's1', id: 'process:proc_001' })
  })

  it('rechaza respuestas malformadas en vez de actualizar la UI', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ processes: [{ id: '', running: true }] })
    await expect(processesApi.list('s1')).rejects.toThrow(/malformada/)
  })

  it('acepta nulos explícitos del engine en filas activas', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      processes: [
        {
          id: 'process:proc_001',
          kind: 'process',
          command: 'python -m http.server 8080',
          cwd: 'C:/site',
          running: true,
          can_stop: true,
          pid: 9640,
          started_at: 1750000000,
          exit_code: null,
          ended_at: null,
          exit_reason: null,
          generation: 1,
          engine_instance_id: 'boot-1',
          readiness: 'unknown',
          readiness_checked_at: null,
          url: null,
        },
      ],
      truncated: false,
      total: 1,
      next_cursor: null,
      engine_instance_id: 'boot-1',
    })
    const listed = await processesApi.list('s1')
    expect(listed.processes).toHaveLength(1)
    expect(listed.processes[0]?.running).toBe(true)
  })

  it('reenvía cursor y límite solo cuando se piden', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ processes: [], truncated: false })
    await processesApi.list('s1')
    expect(invoke).toHaveBeenCalledWith('workspace_process_list', { session_id: 's1' })
    vi.mocked(invoke).mockResolvedValueOnce({ processes: [], truncated: true, total: 3, next_cursor: 'o2' })
    await processesApi.list('s1', { cursor: 'o0', limit: 2 })
    expect(invoke).toHaveBeenCalledWith('workspace_process_list', {
      session_id: 's1',
      cursor: 'o0',
      limit: 2,
    })
  })

  it('acepta campos de identidad y los reenvía como precondiciones', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      processes: [
        {
          id: 'process:proc_001',
          kind: 'process',
          command: 'npm run dev',
          cwd: 'C:/s',
          running: false,
          can_stop: false,
          exit_code: 0,
          generation: 4,
          ended_at: 1700000100,
          exit_reason: 'exited',
          readiness: 'unknown',
          readiness_checked_at: null,
        },
      ],
      truncated: false,
      total: 1,
      next_cursor: null,
      engine_instance_id: 'boot-9',
    })
    const listed = await processesApi.list('s1')
    expect(listed.total).toBe(1)
    expect(listed.engine_instance_id).toBe('boot-9')
    expect(listed.processes[0]?.generation).toBe(4)
    expect(listed.processes[0]?.exit_reason).toBe('exited')

    vi.mocked(invoke).mockResolvedValueOnce({ id: 'process:proc_001', running: false })
    await processesApi.stop('s1', 'process:proc_001', {
      engine_instance_id: 'boot-9',
      generation: 4,
    })
    expect(invoke).toHaveBeenCalledWith('workspace_process_stop', {
      session_id: 's1',
      id: 'process:proc_001',
      engine_instance_id: 'boot-9',
      generation: 4,
    })
  })
})

describe('validadores', () => {
  it('acepta el contrato documentado y rechaza stop temerario', () => {
    expect(
      isManagedProcess({ id: 'process:proc_001', kind: 'process', command: 'npm run dev', cwd: 'C:/s', running: true, can_stop: true }),
    ).toBe(true)
    expect(isManagedProcess({ id: 'process:proc_001', running: true })).toBe(false)
    expect(isProcessListResult({ processes: [], truncated: false })).toBe(true)
    expect(
      isProcessOutput({ process: { id: 'a', kind: 'process', command: 'c', cwd: 'd', running: false, can_stop: false }, stdout: '', stderr: '', truncated: false }),
    ).toBe(true)
    expect(isProcessStopResult({ id: 'process:proc_001', running: false })).toBe(true)
    expect(isProcessStopResult({ running: false })).toBe(false)
  })
})
