// @vitest-environment jsdom
// Replanteo de la Agency (22-oct), fases 2 a 4: el manual del equipo, sus
// rutinas y flujos en «Trabajo del equipo», los avisos de un flujo en la
// oficina y el gasto de hoy y de 7 días en la ficha.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { AgencyAgent, AgencyFlow, AgencyTeam, AgentSpend, FlowRun, OfficeMessage, TeamOverview } from './types'

const agent = (id: string, name: string): AgencyAgent => ({
  id, rinari_profile_id: 'default', name, role: '', instructions: '', model: null, permission_profile: 'workspace',
  connectors: [], budget: {}, ask_new_destinations: null, session_id: `ses_${id}`, created_at: 1, updated_at: 1, archived_at: null,
})
const writer = agent('agent_w', 'Writer')
const image = agent('agent_i', 'Image')
const team: AgencyTeam = {
  id: 'team_1', rinari_profile_id: 'default', name: 'Estudio', purpose: '', chief_agent_id: 'agent_w',
  connectors: [], budget: { daily_usd: 2 }, members: ['agent_w', 'agent_i'],
  posts: [
    { team_id: 'team_1', agent_id: 'agent_w', session_id: 'post_w', created_at: 1 },
    { team_id: 'team_1', agent_id: 'agent_i', session_id: 'post_i', created_at: 1 },
  ],
  created_at: 1, updated_at: 1, archived_at: null, manual: 'Image dibuja; Writer revisa.',
}
const spend = (tokens: number, cost: number | null): AgentSpend => ({
  tokens, cost_usd: cost, cost_known: cost !== null, calls: 1, budget: {}, over_budget: false,
})
const flow: AgencyFlow = {
  id: 'flow_1', team_id: 'team_1', name: 'Pieza', description: '', created_at: 1, updated_at: 1,
  steps: [{ name: 'Personaje', agents: ['agent_i'], agent_names: ['Image'], instructions: 'Dibuja', approval: 'auto' }],
}
const run: FlowRun = {
  id: 'run_1', flow_id: 'flow_1', team_id: 'team_1', status: 'running', step: 0, input: '', outputs: [], started_by: null,
  created_at: 1, updated_at: 1, finished_at: null, flow: 'Pieza', steps: 1, step_name: 'Personaje',
}
const overview = (): TeamOverview => ({
  team: { ...team, stopped: false },
  routines: [{
    id: 'sch_1', name: 'Noticias', agent_id: 'agent_i', agent: 'Image', schedule: { kind: 'interval', minutes: 30 }, prompt: 'Revisa',
    enabled: true, paused_by: null, next_run_at: 1700000000, last: { status: 'completed', finished_at: 1699990000, summary: '', session_id: 'post_i' },
  }],
  flows: [flow],
  runs: [run],
  errands: { pending: 1, delivered: 2 },
  activity: [],
  spend: {
    today: spend(1200, 0.5),
    week: spend(9000, 3.25),
    agents: [{ agent_id: 'agent_i', name: 'Image', today: spend(1200, 0.5), week: spend(9000, 3.25) }],
  },
})

let officeMessages: OfficeMessage[] = []
const api = {
  agencyTeam: vi.fn(async () => ({ team, errands: [], messages: officeMessages })),
  agencyAgents: vi.fn(async () => ({ agents: [writer, image] })),
  agencyTeamOverview: vi.fn(async (_teamId: string) => overview()),
  agencyUpdateTeam: vi.fn(async (_id: string, _patch: unknown) => ({ team })),
  agencyCreateRoutine: vi.fn(async (..._args: unknown[]) => ({ routine: overview().routines[0] })),
  agencySaveFlow: vi.fn(async (_teamId: string, _flow: unknown) => ({ flow })),
  agencyStartFlow: vi.fn(async (_teamId: string, _flowId: string, _input: string) => ({ run })),
  agencyCancelFlowRun: vi.fn(async (_runId: string) => ({ run: { ...run, status: 'cancelled' } })),
  agencyDeleteFlow: vi.fn(async (_flowId: string) => ({ deleted: 'flow_1' })),
  mcpList: vi.fn(async () => ({ servers: [] })),
  mcpCatalogList: vi.fn(async () => ({ entries: [] })),
}
vi.mock('../../services/engine', () => ({
  engineApi: new Proxy({}, { get: (_target, key: string) => (api as Record<string, unknown>)[key] }),
  onEngineEvent: vi.fn(async () => () => {}),
  commandMessage: String,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { AgencyDataContext } from './AgencyData'
import { TeamWorkPanel } from './TeamWork'
import { TeamPanel } from './OfficePanels'
import OfficeView from './OfficeView'

const wrap = (node: React.ReactNode) => render(
  <I18nProvider lang="es">
    <AgencyDataContext.Provider value={{ agents: [writer, image], teams: [team], reload: () => {} }}>{node}</AgencyDataContext.Provider>
  </I18nProvider>,
)

afterEach(() => {
  cleanup()
  for (const fn of Object.values(api)) fn.mockClear()
})

it('edits the manual and saves it as the team patch', async () => {
  wrap(<TeamWorkPanel teamId="team_1" />)
  const text = await screen.findByTestId('agency-work-manual-text') as HTMLTextAreaElement
  expect(text.value).toBe('Image dibuja; Writer revisa.')
  expect(screen.queryByTestId('agency-work-manual-save')).toBeNull()
  fireEvent.change(text, { target: { value: 'Cada mañana Image revisa las noticias.' } })
  await userEvent.click(screen.getByTestId('agency-work-manual-save'))
  expect(api.agencyUpdateTeam).toHaveBeenCalledWith('team_1', { manual: 'Cada mañana Image revisa las noticias.' })
})

it('lists the routines in words and creates one for a teammate', async () => {
  wrap(<TeamWorkPanel teamId="team_1" />)
  const routine = await screen.findByTestId('agency-routine')
  expect(routine.textContent).toContain('Noticias')
  expect(routine.textContent).toContain('Image')
  expect(routine.textContent).toContain('30')
  await userEvent.click(screen.getByTestId('agency-routine-new'))
  fireEvent.change(screen.getByTestId('agency-routine-name'), { target: { value: 'Resumen' } })
  fireEvent.change(screen.getByTestId('agency-routine-prompt'), { target: { value: 'Resume el día' } })
  await userEvent.click(screen.getByTestId('agency-routine-save'))
  // Sin elegir: el jefe, que es quien suele repartir.
  expect(api.agencyCreateRoutine).toHaveBeenCalledWith('team_1', 'agent_w', 'Resumen', { kind: 'interval', minutes: 60 }, 'Resume el día')
})

it('builds a flow step by step and runs one with what it starts from', async () => {
  wrap(<TeamWorkPanel teamId="team_1" />)
  await screen.findByTestId('agency-flow')
  await userEvent.click(screen.getByTestId('agency-flow-new'))
  const editor = screen.getByTestId('agency-flow-editor')
  expect(within(editor).getByTestId('agency-flow-save')).toHaveProperty('disabled', true)
  fireEvent.change(within(editor).getByTestId('agency-flow-name'), { target: { value: 'Video' } })
  fireEvent.change(within(editor).getByTestId('agency-flow-step-name'), { target: { value: 'Guion' } })
  await userEvent.click(within(editor).getAllByTestId('agency-flow-step-agent')[0])
  await userEvent.click(within(editor).getByTestId('agency-flow-save'))
  expect(api.agencySaveFlow).toHaveBeenCalledWith('team_1', {
    name: 'Video',
    description: '',
    steps: [{ name: 'Guion', agents: ['agent_w'], instructions: '', approval: 'chief' }],
  })

  await userEvent.click(screen.getByTestId('agency-flow-run'))
  fireEvent.change(screen.getByTestId('agency-flow-input'), { target: { value: 'Un zorro' } })
  await userEvent.click(screen.getByTestId('agency-flow-start'))
  expect(api.agencyStartFlow).toHaveBeenCalledWith('team_1', 'flow_1', 'Un zorro')

  const runItem = screen.getByTestId('agency-flow-run-item')
  expect(runItem.textContent).toContain('Paso 1 de 1: Personaje')
  await userEvent.click(within(runItem).getByTestId('agency-flow-cancel'))
  expect(api.agencyCancelFlowRun).toHaveBeenCalledWith('run_1')
})

it('asks a second time before deleting a flow', async () => {
  wrap(<TeamWorkPanel teamId="team_1" />)
  await userEvent.click(await screen.findByTestId('agency-flow-delete'))
  expect(api.agencyDeleteFlow).not.toHaveBeenCalled()
  await userEvent.click(screen.getByTestId('agency-flow-delete-confirm'))
  expect(api.agencyDeleteFlow).toHaveBeenCalledWith('flow_1')
})

it('shows the spend of today and of 7 days, and the board in figures, on the team card', async () => {
  wrap(<TeamPanel teamId="team_1" />)
  const spent = await screen.findByTestId('agency-team-spend')
  await waitFor(() => expect(spent.textContent).toContain('Últimos 7 días'))
  expect(spent.textContent).toContain('9000')
  expect(spent.textContent).toContain('Image')
  expect(screen.getByTestId('agency-team-board-counts').textContent).toContain('1 abiertos · 2 por revisar · 0 trabados')
})

it('words a flow in the office and folds what each step delivered', async () => {
  const notice = (state: 'started' | 'done', text: string): OfficeMessage => ({
    id: `m_${state}`, team_id: 'team_1', author_kind: 'system', agent_id: null, text, mentions: [], errand_id: null,
    chain_id: 'c1', hop: 0, created_at: 1700000000, system: state === 'started',
    notice: { kind: 'flow', state, flow: 'Pieza', run_id: 'run_1' },
  })
  officeMessages = [
    notice('started', 'Pieza'),
    notice('done', '@Writer The flow «Pieza» is done. What each step delivered:\n\n[Personaje · Image]\nEl zorro ártico'),
  ]
  wrap(<OfficeView team={team} agents={[writer, image]} />)
  const [started, done] = await screen.findAllByTestId('agency-flow-notice')
  expect(started.textContent).toBe('Empezó el flujo «Pieza».')
  expect(done.textContent).toContain('Terminó el flujo «Pieza».')
  // The sentence for the model stays out; what each step delivered is folded.
  expect(done.textContent).not.toContain('The flow')
  expect(done.querySelector('details')?.textContent).toContain('El zorro ártico')
  officeMessages = []
})
