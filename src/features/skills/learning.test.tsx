// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, onEngineEvent, type EngineEventMsg, type SkillDetail, type SkillProposal } from '../../services/engine'
import { useNotificationCenter } from '../../stores/notificationCenter'
import { useUIStore } from '../../stores/ui'
import PendingSkills from './PendingSkills'
import SkillDetailDialog from './SkillDetailDialog'
import SkillLearnedNotifier from './SkillLearnedNotifier'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('../../services/engine', () => ({
  commandMessage: (err: unknown) => String(err),
  onEngineEvent: vi.fn(),
  engineApi: {
    skillPendingApprove: vi.fn(async () => ({ skill: {} })),
    skillPendingReject: vi.fn(async () => ({ rejected: true })),
    skillRevert: vi.fn(async () => ({ name: 'deploy-saturno', restored: null as string | null, removed: true })),
    skillGet: vi.fn(),
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
    const diff = screen.getByLabelText('Cambios en SKILL.md')
    const rows = (kind: string) => [...diff.querySelectorAll(`[data-diff="${kind}"]`)].map((row) => row.textContent)
    expect(rows('removed')).toEqual([expect.stringContaining('1. Old step')])
    expect(rows('added')).toContainEqual(expect.stringContaining('1. New step'))

    await user.click(screen.getAllByRole('button', { name: 'Aprobar' })[0])
    expect(engineApi.skillPendingApprove).toHaveBeenCalledWith('deploy-saturno')
    await user.click(screen.getAllByRole('button', { name: 'Descartar' })[1])
    expect(engineApi.skillPendingReject).toHaveBeenCalledWith('other-skill')
    expect(onChanged).toHaveBeenCalledTimes(2)
  })

  it('avisa cuando /learn guardó una skill: revisar abre su ficha y deshacer la quita', async () => {
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
    expect(useUIStore.getState()).toMatchObject({ view: 'settings', settingsSection: 'skills', skillFocus: 'deploy-saturno' })
    options.cancel.onClick()
    expect(engineApi.skillRevert).toHaveBeenCalledWith('deploy-saturno')

    listener!({
      type: 'event',
      event: 'skill.learned',
      payload: { name: 'other-skill', status: 'pending', version: '1.0.0', update: false, review: 'ok', session_id: 'ses_1' },
    })
    expect(toast).toHaveBeenCalledWith('Rinari propone una skill: other-skill', expect.anything())
  })

  it('una mejora de una skill aprendida se avisa para revisar, no para aprobar', async () => {
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
      payload: {
        name: 'deploy-saturno',
        status: 'active',
        version: '1.1.0',
        update: true,
        review: 'ok',
        session_id: 'ses_2',
        previous_version: '1.0.0',
      },
    })
    const [message, options] = toast.success.mock.calls[0]
    expect(message).toBe('Rinari actualizó la skill deploy-saturno')
    expect(options.description).toBe('v1.0.0 → v1.1.0. Se aplicó sin aprobación: revísala o deshazla.')
    expect(options.action.label).toBe('Revisar')
    expect(options.cancel.label).toBe('Deshacer')
    const [latest] = useNotificationCenter.getState().items
    expect(latest).toMatchObject({ tone: 'success', target: { kind: 'skills', skill: 'deploy-saturno' } })
  })

  it('la ficha de una skill aprendida muestra el último cambio y lo deshace', async () => {
    const current = '---\nname: deploy-saturno\nversion: 1.1.0\n---\n# Procedure\n1. Build.\n2. Restart.'
    vi.mocked(engineApi.skillGet)
      .mockResolvedValueOnce({ skill: detail({ version: '1.1.0', skill_md: current, previous: { version: '1.0.0', skill_md: current.replace('1.1.0', '1.0.0').replace('2. Restart.', '2. Copy.') } }) })
      .mockResolvedValueOnce({ skill: detail({ version: '1.0.0', previous: null }) })
    vi.mocked(engineApi.skillRevert).mockResolvedValueOnce({ name: 'deploy-saturno', restored: '1.0.0', removed: false })
    const onChanged = vi.fn()
    render(
      <I18nProvider lang="es">
        <SkillDetailDialog name="deploy-saturno" focusChanges onClose={() => undefined} onChanged={onChanged} />
      </I18nProvider>,
    )
    const section = await screen.findByRole('region', { name: 'Último cambio' })
    expect(section.textContent).toContain('De v1.0.0 a v1.1.0')
    const diff = screen.getByLabelText('Cambios en SKILL.md')
    expect([...diff.querySelectorAll('[data-diff="removed"]')].map((row) => row.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('version: 1.0.0'), expect.stringContaining('2. Copy.')]),
    )
    expect([...diff.querySelectorAll('[data-diff="added"]')].map((row) => row.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('2. Restart.')]),
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Volver a v1.0.0' }))
    expect(engineApi.skillRevert).toHaveBeenCalledWith('deploy-saturno')
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: 'Último cambio' })).toBeNull())
    expect(onChanged).toHaveBeenCalled()
  })
})

function detail(partial: Partial<SkillDetail>): SkillDetail {
  return {
    name: 'deploy-saturno',
    description: 'Deploy the app to saturno.',
    version: '1.0.0',
    format: 'rinari',
    risk: 'low',
    origin: 'learned',
    enabled: true,
    status: 'active',
    valid: true,
    error: null,
    issues: [],
    shadows: null,
    editable: true,
    modified: false,
    provenance: { source_kind: 'learned', source: null, installed_at: null, updated_at: null, learned_from: 'ses_1' },
    path: '/skills/deploy-saturno',
    skill_md: '# Procedure\n1. Build.',
    review: { verdict: 'ok', content_hash: 'h', files: 1, size: 10, findings: [] },
    body: '# Procedure\n1. Build.',
    references: [],
    ...partial,
  }
}
