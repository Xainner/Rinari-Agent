import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ info: vi.fn(), warning: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { applyTrustChangedEvent, resetTrustWarningsForTest, warnUntrustedOnce } from './trustWarning'

describe('applyTrustChangedEvent (#38)', () => {
  beforeEach(() => {
    for (const fn of Object.values(toast)) fn.mockReset()
  })

  it('a git init that kept the trust is only reported', () => {
    applyTrustChangedEvent({ path: 'C:/p', project_id: 'prj_1', state: 'trusted', previous_state: 'trusted', reason: 'git-init' })
    expect(toast.info).toHaveBeenCalledTimes(1)
    expect(toast.info.mock.calls[0][1]).toMatchObject({ id: 'project-trust-prj_1' })
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('a changed identity asks to trust again right away, with the action', () => {
    applyTrustChangedEvent({ path: 'C:/p', project_id: 'prj_1', state: 'revalidation-required', previous_state: 'trusted', reason: 'identity-changed' })
    expect(toast.warning).toHaveBeenCalledTimes(1)
    const options = toast.warning.mock.calls[0][1]
    expect(options.id).toBe('project-trust-prj_1')
    expect(options.action).toBeTruthy()
  })

  it('ignores a malformed event', () => {
    applyTrustChangedEvent({ state: 'revalidation-required' })
    applyTrustChangedEvent(undefined)
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })
})

describe('warnUntrustedOnce (H-16)', () => {
  beforeEach(() => {
    for (const fn of Object.values(toast)) fn.mockReset()
    resetTrustWarningsForTest()
  })

  it('warns once per project per run, however many conversations open', () => {
    expect(warnUntrustedOnce('prj_1', 'C:/p', 'untrusted', 'project-trust-prj_1')).toBe(true)
    expect(warnUntrustedOnce('prj_1', 'C:/p', 'untrusted', 'project-trust-prj_1')).toBe(false)
    expect(warnUntrustedOnce('prj_1', 'C:/p', 'untrusted', 'project-trust-prj_1')).toBe(false)
    expect(toast.warning).toHaveBeenCalledTimes(1)
  })

  it('another project, or a changed trust state, still warns', () => {
    warnUntrustedOnce('prj_1', 'C:/p', 'untrusted', 'project-trust-prj_1')
    warnUntrustedOnce('prj_2', 'C:/q', 'untrusted', 'project-trust-prj_2')
    warnUntrustedOnce('prj_1', 'C:/p', 'revalidation-required', 'project-trust-prj_1')
    expect(toast.warning).toHaveBeenCalledTimes(3)
  })
})
