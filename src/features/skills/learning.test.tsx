// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, onEngineEvent, type EngineEventMsg, type SkillProposal } from '../../services/engine'
import PendingSkills from './PendingSkills'
import SkillLearnedNotifier from './SkillLearnedNotifier'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('../../services/engine', () => ({
  commandMessage: (err: unknown) => String(err),
  onEngineEvent: vi.fn(),
  engineApi: {
    skillPendingApprove: vi.fn(async () => ({ skill: {} })),
    skillPendingReject: vi.fn(async () => ({ rejected: true })),
    skillRevert: vi.fn(async () => ({ name: 'deploy-saturno', restored: null, removed: true })),
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const proposal = (partial: Partial<SkillProposal> & { name: string }): SkillProposal => ({
  description: 'Deploy the app to saturno.',
  version: '1.1.0',
  learned_from: 'ses_1',
  proposed_at: '2026-09-24T10:00:00Z',
  update: false,
  review: { verdict: 'ok', content_hash: 'h', files: 1, size: 10, findings: [] },
  skill_md: '---\nname: deploy-saturno\n---\n# Procedure\n1. New step',
  current_skill_md: null,
  ...partial,
})

describe('skills aprendidas', () => {
  it('lista lo que espera aprobación, muestra la versión actual en una actualización y decide', async () => {
    const onChanged = vi.fn()
    render(
      <I18nProvider lang="es">
        <PendingSkills
          proposals={[
            proposal({ name: 'deploy-saturno', update: true, current_skill_md: '# Procedure\n1. Old step' }),
            proposal({ name: 'other-skill' }),
          ]}
          onChanged={onChanged}
        />
      </I18nProvider>,
    )
    const user = userEvent.setup()
    expect(screen.getByRole('region', { name: 'Por aprobar' })).toBeTruthy()
    expect(screen.getByText('Actualización')).toBeTruthy()
    await user.click(screen.getAllByRole('button', { name: 'Ver' })[0])
    expect(screen.getByText(/Old step/)).toBeTruthy()
    expect(screen.getByText(/New step/)).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: 'Aprobar' })[0])
    expect(engineApi.skillPendingApprove).toHaveBeenCalledWith('deploy-saturno')
    await user.click(screen.getAllByRole('button', { name: 'Descartar' })[1])
    expect(engineApi.skillPendingReject).toHaveBeenCalledWith('other-skill')
    expect(onChanged).toHaveBeenCalledTimes(2)
  })

  it('avisa cuando /learn guardó una skill y ofrece deshacer', async () => {
    let listener: ((event: EngineEventMsg) => void) | undefined
    vi.mocked(onEngineEvent).mockImplementation(async (callback) => {
      listener = callback
      return () => undefined
    })
    render(<I18nProvider lang="es"><SkillLearnedNotifier /></I18nProvider>)
    await vi.waitFor(() => expect(listener).toBeTruthy())

    listener!({
      type: 'event',
      event: 'skill.learned',
      payload: { name: 'deploy-saturno', status: 'active', version: '1.0.0', update: false, review: 'ok', session_id: 'ses_1' },
    })
    expect(toast.success).toHaveBeenCalledTimes(1)
    const [message, options] = toast.success.mock.calls[0]
    expect(message).toBe('Skill aprendida: deploy-saturno')
    options.action.onClick()
    expect(engineApi.skillRevert).toHaveBeenCalledWith('deploy-saturno')

    listener!({
      type: 'event',
      event: 'skill.learned',
      payload: { name: 'other-skill', status: 'pending', version: '1.0.0', update: false, review: 'ok', session_id: 'ses_1' },
    })
    expect(toast).toHaveBeenCalledWith('Rinari propone una skill: other-skill', expect.anything())
  })
})
