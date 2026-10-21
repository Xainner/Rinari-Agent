// @vitest-environment jsdom
// Rinari Agency: lo que encontró la revisión de Rinari-Agent#114, cada cosa con
// su prueba: el ensayo que llega antes de responder, los dobles clics, los
// avisos de la oficina como datos, «Reanudar», volver a entrar a la Agency,
// propuestas sin duplicar y lo que la Agency le pasa a un agente.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ScheduledTaskInput } from '../../services/engine'
import type { AgencyAgent, AgencyTeam, OfficeMessage } from './types'

type Listener = (event: { event: string; payload: unknown }) => void
const listeners = new Set<Listener>()
const emit = (event: string, payload: unknown) => { for (const listener of [...listeners]) listener({ event, payload }) }

let resolveCreate: (() => void) | null = null
const api = {
  scheduleList: vi.fn(async () => ({ tasks: [], now: 0 })),
  // The Engine answers «not rehearsable» before the command itself returns.
  scheduleRehearse: vi.fn(async () => {
    emit('schedule.rehearsed', { job_id: 'reh_1', outcome: 'not_rehearsable', reason: 'no es de lectura' })
    return { status: 'started', job_id: 'reh_1' }
  }),
  scheduleCreate: vi.fn(() => new Promise((resolve) => { resolveCreate = () => resolve({ task: {} }) })),
  agencyTeam: vi.fn(async () => ({ team: null, errands: [], messages: officeMessages })),
  agencyOfficePost: vi.fn(() => new Promise(() => {})),
}
let officeMessages: OfficeMessage[] = []
vi.mock('../../services/engine', () => ({
  engineApi: new Proxy({}, { get: (_target, key: string) => (api as Record<string, unknown>)[key] }),
  onEngineEvent: vi.fn(async (listener: Listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }),
  commandMessage: String,
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }))
vi.mock('../engine/EngineContext', () => ({
  useOptionalEngineData: () => ({ status: { capabilities: { agency_rule_rehearsal_v1: true } } }),
}))

import RulesView from './RulesView'
import OfficeView from './OfficeView'
import AgencySidebar from './AgencySidebar'
import MessageBubble from '../../components/MessageBubble'
import { useAgencyStore, isAgencySession } from '../../stores/agency'
import { enterAgencySession } from './openAgencySession'

const wrap = (node: React.ReactNode) => render(<I18nProvider lang="es">{node}</I18nProvider>)
const proposal = (over: Partial<ScheduledTaskInput> = {}): ScheduledTaskInput => ({
  name: 'Correos', kind: 'tool', schedule: { kind: 'interval', minutes: 15 }, prompt: '', agent_id: 'agent_1',
  tool: { server: 'gmail', tool: 'search', arguments: {}, on_result: 'deliver', deliver: null, max_per_day: 20 } as never,
  ...over,
})
const agent = (id: string, name: string): AgencyAgent => ({
  id, rinari_profile_id: 'default', name, role: '', instructions: '', model: null, permission_profile: 'workspace',
  connectors: [], budget: {}, ask_new_destinations: null, session_id: `ses_${id}`, created_at: 1, updated_at: 1, archived_at: null,
})
const team: AgencyTeam = {
  id: 'team_1', rinari_profile_id: 'default', name: 'Canal', purpose: '', chief_agent_id: 'w', connectors: [], budget: {},
  members: ['w'], posts: [{ team_id: 'team_1', agent_id: 'w', session_id: 'post_w', created_at: 1 }],
  created_at: 1, updated_at: 1, archived_at: null,
}

beforeEach(() => {
  useAgencyStore.setState({
    space: 'rinari', page: { kind: 'home' }, proposals: [], returnTo: null,
    agentSessions: { ses_1: 'agent_1' }, postSessions: { post_w: { teamId: 'team_1', agentId: 'w' } }, sessionLabels: {},
  })
  officeMessages = []
})
afterEach(() => { cleanup(); listeners.clear(); for (const fn of Object.values(api)) fn.mockClear() })

it('a rehearsal answered before the command returns is not lost', async () => {
  useAgencyStore.getState().addProposal(proposal())
  wrap(<RulesView sessionId="ses_1" />)
  await userEvent.click(await screen.findByTestId('agency-rule-rehearse'))
  await waitFor(() => expect(screen.getByTestId('agency-rule-rehearsal').getAttribute('data-outcome')).toBe('not_rehearsable'))
  expect((screen.getByTestId('agency-rule-rehearse') as HTMLButtonElement).disabled).toBe(false)
})

it('a double click on «Activar» creates the rule once', async () => {
  useAgencyStore.getState().addProposal(proposal())
  wrap(<RulesView sessionId="ses_1" />)
  const button = await screen.findByTestId('agency-rule-activate')
  await userEvent.dblClick(button)
  expect(api.scheduleCreate).toHaveBeenCalledTimes(1)
  await act(async () => { resolveCreate?.() })
})

it('the same proposal twice is one card, and switching profile clears them', () => {
  useAgencyStore.getState().addProposal(proposal())
  useAgencyStore.getState().addProposal(proposal())
  useAgencyStore.getState().addProposal(proposal({ name: 'Otra' }))
  expect(useAgencyStore.getState().proposals).toHaveLength(2)
  useAgencyStore.getState().clearProposals()
  expect(useAgencyStore.getState().proposals).toHaveLength(0)
})

it('a double Enter in the office posts once', async () => {
  wrap(<OfficeView team={team} agents={[agent('w', 'Writer')]} onEditTeam={() => {}} />)
  const input = screen.getByTestId('agency-office-input')
  await userEvent.type(input, 'hola{Enter}{Enter}')
  expect(api.agencyOfficePost).toHaveBeenCalledTimes(1)
  expect((input as HTMLTextAreaElement).value).toBe('')
})

it('a failed office post comes back only into an empty box', async () => {
  let fail: (() => void) | null = null
  api.agencyOfficePost.mockImplementation(() => new Promise((_resolve, reject) => { fail = () => reject(new Error('caído')) }))
  wrap(<OfficeView team={team} agents={[agent('w', 'Writer')]} onEditTeam={() => {}} />)
  const input = screen.getByTestId('agency-office-input') as HTMLTextAreaElement
  await userEvent.type(input, 'primero{Enter}')
  await userEvent.type(input, 'segundo')
  await act(async () => { fail?.() })
  expect(input.value).toBe('segundo')
  api.agencyOfficePost.mockImplementation(() => new Promise(() => {}))
})

it('the office words the Engine notices in the owner language', async () => {
  officeMessages = [
    { id: 'm1', team_id: 'team_1', author_kind: 'owner', agent_id: null, text: 'Guion', mentions: [], errand_id: null, chain_id: 'c', hop: 0, created_at: 1, system: true, notice: { kind: 'errand', title: 'Guion' } },
    { id: 'm2', team_id: 'team_1', author_kind: 'agent', agent_id: 'w', text: 'Writer', mentions: [], errand_id: null, chain_id: 'c', hop: 0, created_at: 2, system: true, notice: { kind: 'wait', for: 'Video' } },
    { id: 'm3', team_id: 'team_1', author_kind: 'agent', agent_id: 'w', text: 'Un gato', mentions: [], errand_id: null, chain_id: 'c', hop: 1, created_at: 3, notice: { kind: 'delivered', title: 'Guion', to: 'Emails' } },
  ]
  wrap(<OfficeView team={team} agents={[agent('w', 'Writer')]} onEditTeam={() => {}} />)
  await waitFor(() => expect(screen.getByText('Dejó un recado: «Guion»')).toBeTruthy())
  expect(screen.getByText('Espera a Video.')).toBeTruthy()
  expect(screen.getByText('Entregó «Guion» a Emails')).toBeTruthy()
  expect(screen.getByText('Un gato')).toBeTruthy()
})

it('a stopped Agency offers to resume instead of stopping again', async () => {
  const onResume = vi.fn()
  wrap(
    <AgencySidebar
      agents={[agent('w', 'Writer')]} status={null} activeAgentId={null} creating={false}
      onOpenAgent={() => {}} onNewAgent={() => {}} onTutorial={() => {}} onLeave={() => {}}
      onStopAll={() => {}} halted onResume={onResume}
    />,
  )
  expect(screen.queryByTestId('agency-stop-all')).toBeNull()
  await userEvent.click(screen.getByTestId('agency-resume'))
  expect(onResume).toHaveBeenCalled()
})

it('entering the Agency again never shows a Rinari conversation as the agent', () => {
  useAgencyStore.getState().openAgent('agent_1')
  useAgencyStore.getState().leave()
  useAgencyStore.getState().enter()
  expect(useAgencyStore.getState().page).toEqual({ kind: 'home' })
})

it('a notification of an Agency conversation opens it inside the Agency', () => {
  expect(enterAgencySession('post_w', 'ses_rinari')).toBe(true)
  const state = useAgencyStore.getState()
  expect(state.space).toBe('agency')
  expect(state.page).toEqual({ kind: 'post', teamId: 'team_1', agentId: 'w' })
  expect(state.returnTo).toBe('ses_rinari')
  expect(isAgencySession('post_w')).toBe(true)
  expect(enterAgencySession('ses_other', null)).toBe(false)
})

it('what the Agency hands an agent is not shown as the owner\'s message', () => {
  wrap(
    <MessageBubble
      message={{ id: 'u1', role: 'user', content: '[Errand of the team «Canal»] …', origin: { kind: 'agency_errand', from_label: 'Writer' } as never } as never}
    />,
  )
  const bubble = screen.getByTestId('agency-bubble')
  expect(bubble.getAttribute('data-origin')).toBe('agency_errand')
  expect(screen.getByText('Recado de Writer')).toBeTruthy()
})
