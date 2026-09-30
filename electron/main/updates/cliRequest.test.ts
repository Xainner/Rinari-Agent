import { describe, expect, it, vi } from 'vitest'

import { runRequestedUpdate, updateRequestFromData, wantsUpdate } from './cliRequest'

function updates(available: boolean, prompt = vi.fn(() => undefined)) {
  return {
    check: vi.fn(async () => (available ? { version: '0.2.1', unsigned: true } as never : null)),
    download: vi.fn(async () => ({}) as never),
    prompt,
  }
}

describe('update requested by the CLI', () => {
  it('checks, downloads and asks with the app dialog', async () => {
    const service = updates(true)
    await expect(runRequestedUpdate(service)).resolves.toBe('asked')
    expect(service.download).toHaveBeenCalledOnce()
    expect(service.prompt).toHaveBeenCalledOnce()
  })

  it('does nothing when there is no newer version', async () => {
    const service = updates(false)
    await expect(runRequestedUpdate(service)).resolves.toBe('current')
    expect(service.download).not.toHaveBeenCalled()
  })

  it('reports a failure without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const service = updates(true, vi.fn(() => { throw new Error('boom') }))
    await expect(runRequestedUpdate(service)).resolves.toBe('failed')
    warn.mockRestore()
  })

  it('reads the flag from argv and from the second instance data', () => {
    expect(wantsUpdate(['rinari-agent.exe', '--update'])).toBe(true)
    expect(wantsUpdate(['electron', 'main.cjs', '--update'], 2)).toBe(true)
    expect(wantsUpdate(['rinari-agent.exe', 'C:/repo'])).toBe(false)
    expect(updateRequestFromData({ handoff: null, update: true })).toBe(true)
    expect(updateRequestFromData({ update: 'yes' })).toBe(false)
    expect(updateRequestFromData(null)).toBe(false)
  })
})
