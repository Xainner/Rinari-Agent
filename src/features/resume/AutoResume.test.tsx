// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import type { SessionResume } from '../../types/protocol.generated'
import { AutoResume } from './AutoResume'
import ResumeSetting from './ResumeSetting'
import { applyResumeEvent, useResumeStore } from './resumeStore'

function resume(partial: Partial<SessionResume> = {}): SessionResume {
  return {
    session_id: 's1',
    provider_id: 'prv_1',
    mode: 'at',
    resume_at: new Date(Date.now() + 12 * 60_000).toISOString(),
    state: 'waiting',
    attempts: 0,
    goal_id: null,
    reason: '',
    revision: 2,
    updated_at: new Date().toISOString(),
    ...partial,
  }
}

beforeEach(() => {
  useResumeStore.setState({ bySession: {} })
  vi.spyOn(engineApi, 'sessionResume').mockResolvedValue({ resume: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const mount = (props: { resetsAt?: string; failedAt?: number } = {}) =>
  render(<I18nProvider lang="es"><AutoResume sessionId="s1" {...props} /></I18nProvider>)

describe('AutoResume (plan 0.4.0 #24)', () => {
  it('offers to continue by itself, with the reset time when the provider gave one', async () => {
    const arm = vi.spyOn(engineApi, 'resumeArm').mockResolvedValue({ resume: resume() })
    const resetsAt = '2026-10-16T17:40:00Z'
    mount({ resetsAt })
    const offer = await screen.findByRole('button', { name: /Continuar automáticamente cuando se restablezca \(≈/ })
    await userEvent.click(offer)
    expect(arm).toHaveBeenCalledWith('s1', resetsAt)
    expect(await screen.findByText(/Continuará sola a las/)).toBeTruthy()
    expect(screen.getByText('Rinari debe seguir abierta (puede estar en la bandeja).')).toBeTruthy()
  })

  it('armed: resume now or cancel', async () => {
    vi.mocked(engineApi.sessionResume).mockResolvedValue({ resume: resume() })
    const now = vi.spyOn(engineApi, 'resumeNow').mockResolvedValue({ resume: resume({ revision: 3, resume_at: new Date(Date.now() + 86_400_000).toISOString() }), continued: true })
    const cancel = vi.spyOn(engineApi, 'resumeCancel').mockResolvedValue({ resume: resume({ state: 'cancelled', revision: 4 }) })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /Reanudar ahora/ }))
    expect(now).toHaveBeenCalledWith('s1')
    await userEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
    expect(cancel).toHaveBeenCalledWith('s1')
  })

  it('a credit-only provider waits for balance', async () => {
    vi.mocked(engineApi.sessionResume).mockResolvedValue({ resume: resume({ mode: 'poll' }) })
    mount()
    expect(await screen.findByText('Continuará sola cuando vuelva a haber saldo')).toBeTruthy()
  })

  it('an older failure does not offer again once a resume ran after it', async () => {
    vi.mocked(engineApi.sessionResume).mockResolvedValue({ resume: resume({ state: 'done', updated_at: new Date().toISOString() }) })
    mount({ failedAt: Date.now() - 60_000 })
    await waitFor(() => expect(engineApi.sessionResume).toHaveBeenCalled())
    expect(screen.queryByTestId('auto-resume')).toBeNull()
  })

  it('live updates come from session.resume.updated and say when it continued', () => {
    expect(applyResumeEvent({ session_id: 's1', resume: resume({ revision: 9 }), continued: true })).toEqual({ sessionId: 's1', continued: true })
    applyResumeEvent({ session_id: 's1', resume: resume({ revision: 8, state: 'cancelled' }) })
    expect(useResumeStore.getState().bySession.s1?.revision).toBe(9)
  })
})

describe('ResumeSetting', () => {
  it('asks by default and stores the choice', async () => {
    vi.spyOn(engineApi, 'resumeSettings').mockResolvedValue({ auto_resume_on_limits: 'ask' })
    const set = vi.spyOn(engineApi, 'setResumeSettings').mockResolvedValue({ auto_resume_on_limits: 'always' })
    render(<I18nProvider lang="es"><ResumeSetting /></I18nProvider>)
    expect((await screen.findByRole('radio', { name: 'Preguntar' })).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(screen.getByRole('radio', { name: 'Continuar siempre sola' }))
    expect(set).toHaveBeenCalledWith('always')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Continuar siempre sola' }).getAttribute('aria-checked')).toBe('true'))
  })
})
