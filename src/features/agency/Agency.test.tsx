// @vitest-environment jsdom
// Rinari Agency A1: la tarjeta (D-17), la barra lateral con «Agencia»
// deshabilitada y «Pronto» (D-21), el tutorial (D-20) y la ficha (D-16).
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { AgencyAgent, AgencyStatus } from './types'

const agencyCreateAgent = vi.fn(async (agent: unknown) => ({ agent: { ...(agent as object), id: 'agent_1', session_id: 'ses_1' } }))
const agencyDraft = vi.fn(async (_description: string) => ({ status: 'started', job_id: 'draft_1' }))
let engineListener: ((event: { event: string; payload: unknown }) => void) | null = null
vi.mock('../../services/engine', () => ({
  engineApi: {
    agencyCreateAgent: (agent: unknown) => agencyCreateAgent(agent),
    agencyDraft: (description: string) => agencyDraft(description),
    agencyUpdateAgent: vi.fn(),
    agencyArchiveAgent: vi.fn(),
    modelList: vi.fn(async () => ({ models: [{ id: 'mdl_1', alias: 'rapido', provider: 'local', saved: true }] })),
    mcpList: vi.fn(async () => ({
      servers: [
        { name: 'gmail', scope: 'global', owner: null },
        { name: 'ajeno', scope: 'global', owner: 'agent:otro' },
        { name: 'repo', scope: 'project', owner: null },
      ],
    })),
  },
  onEngineEvent: vi.fn(async (listener: (event: { event: string; payload: unknown }) => void) => {
    engineListener = listener
    return () => { engineListener = null }
  }),
  commandMessage: String,
}))
vi.mock('../rinari/art', () => ({ art: { standing: (pose: string) => `vn-${pose}.webp`, chibi: () => 'chibi.webp' } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import AgencyCard, { agencyStatusLine } from './AgencyCard'
import AgencySidebar from './AgencySidebar'
import AgencyTutorial from './AgencyTutorial'
import AgentForm from './AgentForm'
import { agencyTutorialSeen, markAgencyTutorialSeen } from '../../stores/agency'
import { translate } from '../../i18n'

const t = (key: string, vars?: Record<string, string | number>) => translate('es', key as never, vars)
const status = (over: Partial<AgencyStatus> = {}): AgencyStatus => ({
  agents: 0,
  working: 0,
  needs_you: 0,
  agent_ids: { working: [], needs_you: [] },
  ...over,
})
const agent = (over: Partial<AgencyAgent> = {}): AgencyAgent => ({
  id: 'agent_1',
  rinari_profile_id: 'default',
  name: 'Emails',
  role: 'Lee el correo',
  instructions: '',
  model: null,
  permission_profile: 'workspace',
  connectors: [],
  budget: {},
  ask_new_destinations: null,
  session_id: 'ses_1',
  created_at: 1,
  updated_at: 1,
  archived_at: null,
  ...over,
})

beforeEach(() => window.localStorage.clear())
afterEach(() => { cleanup(); agencyCreateAgent.mockClear() })

it('the card says what happens now, or how many agents there are', () => {
  expect(agencyStatusLine(status(), t)).toBe('Crea tu primer agente')
  expect(agencyStatusLine(status({ agents: 1 }), t)).toBe('1 agente · en calma')
  expect(agencyStatusLine(status({ agents: 5 }), t)).toBe('5 agentes · en calma')
  expect(agencyStatusLine(status({ agents: 5, working: 3, needs_you: 1 }), t)).toBe('3 trabajando · 1 te necesita')
  expect(agencyStatusLine(status({ agents: 5, needs_you: 2 }), t)).toBe('2 te necesitan')
  expect(agencyStatusLine(null, t)).toBe('')
})

it('the card opens the Agency and marks what needs the owner', async () => {
  const onClick = vi.fn()
  render(<I18nProvider lang="es"><AgencyCard mode="enter" status={status({ agents: 2, needs_you: 1 })} onClick={onClick} /></I18nProvider>)
  const card = screen.getByTestId('agency-card')
  expect(card.getAttribute('aria-label')).toBe('Abrir Rinari Agency · 1 te necesita')
  expect(card.querySelector('.agency-card-line.is-attention')).toBeTruthy()
  await userEvent.click(card)
  expect(onClick).toHaveBeenCalledOnce()
})

it('the Agency office is offered disabled, with «Pronto», and teams come later', async () => {
  const onOpenAgent = vi.fn()
  render(
    <I18nProvider lang="es">
      <AgencySidebar
        agents={[agent(), agent({ id: 'agent_2', name: 'Video', role: '' })]}
        status={status({ agents: 2, working: 1, needs_you: 1, agent_ids: { working: ['agent_2'], needs_you: ['agent_1'] } })}
        activeAgentId="agent_2"
        creating={false}
        onOpenAgent={onOpenAgent}
        onNewAgent={() => {}}
        onTutorial={() => {}}
        onLeave={() => {}}
      />
    </I18nProvider>,
  )
  const office = screen.getByTestId('agency-office-soon')
  expect(office.getAttribute('aria-disabled')).toBe('true')
  expect(office.textContent).toContain('Pronto')
  const rows = screen.getAllByTestId('agency-agent-row')
  expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['Emails · Te necesita', 'Video · Trabajando'])
  expect(rows[1].getAttribute('aria-current')).toBe('page')
  await userEvent.click(rows[0])
  expect(onOpenAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent_1' }))
  expect(screen.getByText(/Pronto: oficinas/)).toBeTruthy()
  expect(screen.getByTestId('agency-card').getAttribute('data-mode')).toBe('leave')
})

it('the tutorial walks five steps with Rinari and ends on creating an agent', async () => {
  const onClose = vi.fn()
  render(<I18nProvider lang="es"><AgencyTutorial open onClose={onClose} /></I18nProvider>)
  const pose = () => document.querySelector('.welcome-figure img[data-on]')?.getAttribute('src')
  expect(pose()).toBe('vn-hello.webp')
  expect(screen.getByText(/Así se verá tu oficina más adelante/)).toBeTruthy()
  for (let step = 0; step < 4; step++) {
    await userEvent.click(screen.getByTestId('agency-tutorial-next'))
    // One title per step: the earlier ones do not stay behind.
    expect(document.querySelectorAll('.welcome-title')).toHaveLength(1)
  }
  expect(pose()).toBe('vn-happy.webp')
  // The last step is a choice; templates are not there yet and say so.
  const template = screen.getByTestId('agency-tutorial-template') as HTMLButtonElement
  expect(template.disabled).toBe(true)
  expect(template.textContent).toContain('Pronto')
  await userEvent.click(screen.getByTestId('agency-tutorial-create'))
  expect(onClose).toHaveBeenCalledWith('create')
})

it('the tutorial is seen once per Rinari profile', () => {
  expect(agencyTutorialSeen('default')).toBe(false)
  markAgencyTutorialSeen('default')
  expect(agencyTutorialSeen('default')).toBe(true)
  expect(agencyTutorialSeen('trabajo')).toBe(false)
})

it('the card form offers only everyone\'s connectors and sends what the owner wrote', async () => {
  const onSaved = vi.fn()
  render(<I18nProvider lang="es"><AgentForm onSaved={onSaved} onCancel={() => {}} /></I18nProvider>)
  await waitFor(() => expect(screen.getByText('gmail')).toBeTruthy())
  expect(screen.queryByText('ajeno')).toBeNull()
  expect(screen.queryByText('repo')).toBeNull()
  await userEvent.type(screen.getByTestId('agency-form-name'), 'Emails')
  await userEvent.click(screen.getByRole('button', { name: 'Acceso completo' }))
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.type(screen.getByRole('textbox', { name: 'Tokens al día' }), '50000')
  await userEvent.click(screen.getByTestId('agency-form-submit'))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(agencyCreateAgent).toHaveBeenCalledWith({
    name: 'Emails',
    role: '',
    instructions: '',
    model: null,
    permission_profile: 'full-access',
    ask_new_destinations: null,
    connectors: ['gmail'],
    budget: { daily_tokens: 50000 },
  })
})

it('«Créalo con Rinari» fills the form from the draft and creates nothing', async () => {
  render(<I18nProvider lang="es"><AgentForm draftEnabled onSaved={() => {}} onCancel={() => {}} /></I18nProvider>)
  await userEvent.type(screen.getByTestId('agency-draft-input'), 'una que revise el CI')
  await userEvent.click(screen.getByTestId('agency-draft-fill'))
  expect(agencyDraft).toHaveBeenCalledWith('una que revise el CI')
  await waitFor(() => expect(engineListener).not.toBeNull())
  act(() => engineListener!({ event: 'agency.draft.ready', payload: { job_id: 'otro', draft: { name: 'No' } } }))
  expect((screen.getByTestId('agency-form-name') as HTMLInputElement).value).toBe('')
  act(() => engineListener!({
    event: 'agency.draft.ready',
    payload: { job_id: 'draft_1', draft: { name: 'Centinela', role: 'Vigila el CI', instructions: 'Cada mañana.', permission_profile: 'read-only' } },
  }))
  await waitFor(() => expect((screen.getByTestId('agency-form-name') as HTMLInputElement).value).toBe('Centinela'))
  expect(screen.getByRole('button', { name: 'Solo lectura' }).getAttribute('aria-pressed')).toBe('true')
  expect(agencyCreateAgent).not.toHaveBeenCalled()
})

it('without the capability, «Créalo con Rinari» is not offered', () => {
  render(<I18nProvider lang="es"><AgentForm onSaved={() => {}} onCancel={() => {}} /></I18nProvider>)
  expect(screen.queryByTestId('agency-draft')).toBeNull()
})
