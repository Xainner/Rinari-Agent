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
