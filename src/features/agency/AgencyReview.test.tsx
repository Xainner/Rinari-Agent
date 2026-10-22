// @vitest-environment jsdom
// Rinari Agency: lo que encontró la revisión de Rinari-Agent#114, cada cosa con
// su prueba: el ensayo que llega antes de responder, los dobles clics, los
// avisos de la oficina como datos, «Reanudar», volver a entrar a la Agency y
// lo que la Agency le pasa a un agente. Y de la auditoría del 21-oct: la
// cadena cortada con «Continuar», la Agency detenida, el estado de cada
// puesto y ningún id crudo a la vista.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ScheduledTask } from '../../services/engine'
import type { AgencyAgent, AgencyTeam, OfficeMessage } from './types'

type Listener = (event: { event: string; payload: unknown }) => void
const listeners = new Set<Listener>()
const emit = (event: string, payload: unknown) => { for (const listener of [...listeners]) listener({ event, payload }) }

let resolveRun: (() => void) | null = null
let storedTasks: ScheduledTask[] = []
const api = {
  scheduleList: vi.fn(async () => ({ tasks: storedTasks, now: 0 })),
  // The Engine answers «not rehearsable» before the command itself returns.
  scheduleRehearse: vi.fn(async () => {
    emit('schedule.rehearsed', { job_id: 'reh_1', outcome: 'not_rehearsable', reason: 'no es de lectura' })
    return { status: 'started', job_id: 'reh_1' }
  }),
  scheduleRunNow: vi.fn(() => new Promise((resolve) => { resolveRun = () => resolve({ run: {} }) })),
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
import { AgencyDataContext } from './AgencyData'

const wrap = (node: React.ReactNode) => render(<I18nProvider lang="es">{node}</I18nProvider>)
const storedRule = (): ScheduledTask => ({
  id: 'sch_1', name: 'Correos', kind: 'tool', schedule: { kind: 'interval', minutes: 15 }, prompt: '', agent_id: 'agent_1',
  tool: { server: 'gmail', tool: 'search', arguments: {}, on_result: 'deliver', deliver: null, max_per_day: 20 } as never,
  enabled: true, last_run: null,
} as unknown as ScheduledTask)
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
    space: 'rinari', page: { kind: 'home' }, returnTo: null,
    agentSessions: { ses_1: 'agent_1' }, postSessions: { post_w: { teamId: 'team_1', agentId: 'w' } }, sessionLabels: {},
  })
  officeMessages = []
  storedTasks = []
})
afterEach(() => { cleanup(); listeners.clear(); for (const fn of Object.values(api)) fn.mockClear() })

it('a rehearsal answered before the command returns is not lost', async () => {
  storedTasks = [storedRule()]
  wrap(<RulesView sessionId="ses_1" />)
  await userEvent.click(await screen.findByTestId('agency-rule-rehearse'))
  await waitFor(() => expect(screen.getByTestId('agency-rule-rehearsal').getAttribute('data-outcome')).toBe('not_rehearsable'))
  expect((screen.getByTestId('agency-rule-rehearse') as HTMLButtonElement).disabled).toBe(false)
})

it('a double click on «Ejecutar ahora» runs the rule once', async () => {
  storedTasks = [storedRule()]
  wrap(<RulesView sessionId="ses_1" />)
  const button = await screen.findByRole('button', { name: 'Ejecutar ahora' })
  await userEvent.dblClick(button)
  expect(api.scheduleRunNow).toHaveBeenCalledTimes(1)
  await act(async () => { resolveRun?.() })
})

it('a double Enter in the office posts once', async () => {
  wrap(<OfficeView team={team} agents={[agent('w', 'Writer')]} />)
  const input = screen.getByTestId('agency-office-input')
  await userEvent.type(input, 'hola{Enter}{Enter}')
  expect(api.agencyOfficePost).toHaveBeenCalledTimes(1)
  expect((input as HTMLTextAreaElement).value).toBe('')
})

it('a cut chain stays as a line in the office, in plain words, and «Continuar» posts its last message again as the owner', async () => {
  officeMessages = [
    { id: 'm1', team_id: 'team_1', author_kind: 'owner', agent_id: null, text: '@Writer escribe el guion', mentions: ['w'], errand_id: null, chain_id: 'c1', hop: 0, created_at: 1 },
    { id: 'm2', team_id: 'team_1', author_kind: 'agent', agent_id: 'w', text: 'Listo, @Writer revísalo', mentions: ['w'], errand_id: null, chain_id: 'c1', hop: 8, created_at: 2 },
    { id: 'm3', team_id: 'team_1', author_kind: 'agent', agent_id: null, text: '', mentions: [], errand_id: null, chain_id: 'c1', hop: 8, created_at: 3, system: true, notice: { kind: 'stopped', reason: 'too_many_hops', chain_id: 'c1' } },
    { id: 'm4', team_id: 'team_1', author_kind: 'owner', agent_id: null, text: 'otra cosa', mentions: [], errand_id: null, chain_id: 'c2', hop: 0, created_at: 4 },
  ]
  api.agencyOfficePost.mockImplementation(async () => ({ message: {} }))
  wrap(<OfficeView team={team} agents={[agent('w', 'Writer')]} />)
  const line = await screen.findByTestId('agency-chain-stopped')
  expect(line.textContent).toContain('Llegó a 8 saltos entre agentes')
  expect(line.textContent).not.toMatch(/Engine/)
  await userEvent.click(screen.getByTestId('agency-chain-continue'))
  // The last message of that chain, not the newest of the office.
  expect(api.agencyOfficePost).toHaveBeenCalledWith('team_1', 'Listo, @Writer revísalo')
  expect((screen.getByTestId('agency-chain-continue') as HTMLButtonElement).disabled).toBe(true)
  api.agencyOfficePost.mockImplementation(() => new Promise(() => {}))
})

it('a stop reason this version does not know is still said in words', async () => {
  officeMessages = [
    { id: 'm1', team_id: 'team_1', author_kind: 'agent', agent_id: null, text: '', mentions: [], errand_id: null, chain_id: 'c1', hop: 2, created_at: 1, system: true, notice: { kind: 'stopped', reason: 'brand_new_limit', chain_id: 'c1' } },
  ]
  wrap(<OfficeView team={team} agents={[agent('w', 'Writer')]} />)
  expect((await screen.findByTestId('agency-chain-stopped')).textContent).toContain('Llegó a uno de los límites de la oficina.')
  // Nothing in the chain to post again: no «Continuar».
  expect(screen.queryByTestId('agency-chain-continue')).toBeNull()
})

it('with the Agency stopped the office says so, and each post says if it works or waits', async () => {
  const status = {
    agents: 1, working: 1, needs_you: 0, agent_ids: { working: ['w'], needs_you: [] },
    session_ids: { working: ['post_w'], needs_you: [] }, stopped: true, waiting_for_owner: { errands: 0, chains: 0 },
  }
  render(
    <AgencyDataContext.Provider value={{ agents: [agent('w', 'Writer')], teams: [team], status, halted: true, reload: () => undefined }}>
      <I18nProvider lang="es"><OfficeView team={team} agents={[agent('w', 'Writer')]} /></I18nProvider>
    </AgencyDataContext.Provider>,
  )
  expect(screen.getByTestId('agency-office-halted').textContent).toContain('La Agency está detenida')
  expect(screen.getByTestId('agency-office-face').getAttribute('aria-label')).toBe('Writer · Trabajando')
})

it('the sidebar marks a working post by its own conversation and never shows a raw id', () => {
  const status = {
    agents: 1, working: 1, needs_you: 0, agent_ids: { working: ['w'], needs_you: [] },
    session_ids: { working: ['post_w'], needs_you: [] },
  }
  const withGone: AgencyTeam = { ...team, members: ['w', 'agent_zz9'], posts: [...team.posts, { team_id: 'team_1', agent_id: 'agent_zz9', session_id: 'post_zz', created_at: 1 }] }
  wrap(
    <AgencySidebar
      agents={[agent('w', 'Writer')]} status={status} activeAgentId={null} creating={false}
      onOpenAgent={() => {}} onNewAgent={() => {}} onTutorial={() => {}} onLeave={() => {}}
      teams={[withGone]} onOpenOffice={() => {}} onOpenPost={() => {}} onNewTeam={() => {}}
    />,
  )
  const posts = screen.getAllByTestId('agency-post-row')
  expect(posts[0].getAttribute('data-state')).toBe('working')
  expect(posts[0].getAttribute('aria-label')).toContain('Trabajando')
  expect(posts[1].getAttribute('data-state')).toBe('idle')
  expect(screen.getByTestId('agency-sidebar').textContent).not.toContain('agent_zz9')
  expect(posts[1].textContent).toContain('Un agente que ya no está')
})

it('an agent conversation stops counting once deleted or on a profile switch', () => {
  const store = useAgencyStore.getState()
  store.markAgentRows(['ses_child', 'ses_fork'])
  expect(isAgencySession('ses_child')).toBe(true)
  store.forgetAgentRow('ses_child')
  expect(isAgencySession('ses_child')).toBe(false)
  store.markAgentRows(['ses_open'])
  // The one already open in the new profile keeps its mark.
  store.clearAgentRows(['ses_open'])
  expect(isAgencySession('ses_fork')).toBe(false)
  expect(isAgencySession('ses_open')).toBe(true)
  store.clearAgentRows()
  expect(isAgencySession('ses_open')).toBe(false)
})

it('a failed office post comes back only into an empty box', async () => {
  let fail: (() => void) | null = null
  api.agencyOfficePost.mockImplementation(() => new Promise((_resolve, reject) => { fail = () => reject(new Error('caído')) }))
  wrap(<OfficeView team={team} agents={[agent('w', 'Writer')]} />)
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
  wrap(<OfficeView team={team} agents={[agent('w', 'Writer')]} />)
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
