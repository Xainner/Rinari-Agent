// @vitest-environment jsdom
// Rinari Agency A2: equipos en la barra lateral (D-15), su ficha, la oficina
// con @menciones y «/recado» (D-1, D-3), las tarjetas de recado y la pizarra
// (D-14), y lo de toda la Agency en Ajustes (Vía 2 con «Pronto», D-28).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { AgencyAgent, AgencySettingsData, AgencyTeam, Errand, OfficeMessage } from './types'

const agent = (id: string, name: string): AgencyAgent => ({
  id, rinari_profile_id: 'default', name, role: '', instructions: '', model: null, permission_profile: 'workspace',
  connectors: [], budget: {}, ask_new_destinations: null, session_id: `ses_${id}`, created_at: 1, updated_at: 1, archived_at: null,
})
const writer = agent('agent_w', 'Writer')
const video = agent('agent_v', 'Video')
const team: AgencyTeam = {
  id: 'team_1', rinari_profile_id: 'default', name: 'Canal infantil', purpose: 'Historias en 3D', chief_agent_id: 'agent_w',
  connectors: [], budget: {}, members: ['agent_w', 'agent_v'],
  posts: [
    { team_id: 'team_1', agent_id: 'agent_w', session_id: 'post_w', created_at: 1 },
    { team_id: 'team_1', agent_id: 'agent_v', session_id: 'post_v', created_at: 1 },
  ],
  created_at: 1, updated_at: 1, archived_at: null,
}
const errand = (over: Partial<Errand> = {}): Errand => ({
  id: 'err_1', team_id: 'team_1', from_team_id: null, from_agent_id: null, to_agent_id: 'agent_w', title: 'Guion del lunes',
  body: '', done_when: ['30 segundos'], status: 'delivered', result: { summary: 'Un gato astronauta' }, return_reason: null,
  chain_id: 'chain_1', hop: 0, session_id: null, created_at: 1, updated_at: 1, started_at: 1, delivered_at: 2, ...over,
})
const messages: OfficeMessage[] = [
  { id: 'm1', team_id: 'team_1', author_kind: 'owner', agent_id: null, text: '@Writer una idea', mentions: ['agent_w'], errand_id: null, chain_id: 'c1', hop: 0, created_at: 1700000000 },
  { id: 'm1b', team_id: 'team_1', author_kind: 'owner', agent_id: null, text: 'Recado «Guion del lunes»', mentions: [], errand_id: 'err_1', chain_id: 'c2', hop: 0, created_at: 1700000030 },
  { id: 'm2', team_id: 'team_1', author_kind: 'agent', agent_id: 'agent_w', text: 'Entregado', mentions: [], errand_id: 'err_1', chain_id: 'c1', hop: 1, created_at: 1700000060 },
]
let errands: Errand[] = [errand()]
const settings: AgencySettingsData = {
  budget: {}, errand_mode: 'turn', errand_modes: ['turn', 'subagents'], available_errand_modes: ['turn'],
  spend_today: { tokens: 0, cost_usd: null, cost_known: true, calls: 0, budget: {}, over_budget: false },
}

const api = {
  agencyTeam: vi.fn(async () => ({ team, errands, messages })),
  agencyAgents: vi.fn(async () => ({ agents: [writer, video] })),
  agencyOfficePost: vi.fn(async (_teamId: string, _text: string) => ({ message: messages[0] })),
  agencyCreateErrand: vi.fn(async (_teamId: string, _errand: unknown) => ({ errand: errand({ status: 'pending' }) })),
  agencyReviewErrand: vi.fn(async (_id: string, _accepted: boolean, _reason?: string) => ({ errand: errand({ status: 'reviewed' }) })),
  agencyRetryErrand: vi.fn(async (_id: string) => ({ errand: errand({ status: 'pending' }) })),
  agencyCancelErrand: vi.fn(async (_id: string) => ({ errand: errand({ status: 'cancelled' }) })),
  agencyCreateTeam: vi.fn(async (input: unknown) => ({ team: { ...team, ...(input as object) } })),
  agencyUpdateTeam: vi.fn(async (_id: string, _patch: unknown) => ({ team })),
  agencyJoinTeam: vi.fn(async () => ({ team })),
  agencyLeaveTeam: vi.fn(async () => ({ team })),
  agencyArchiveTeam: vi.fn(async () => ({ team })),
  agencyDuplicateTeam: vi.fn(async (_id: string, name: string) => ({ team: { ...team, id: 'team_2', name } })),
  agencySettings: vi.fn(async () => settings),
  agencySetSettings: vi.fn(async (patch: object) => ({ ...settings, ...patch })),
  agencyAgentMemory: vi.fn(async () => ({ records: [], count: 0 })),
  agencyTeamMemory: vi.fn(async () => ({ records: [], count: 0 })),
  agencyTeamRemember: vi.fn(async () => ({ record: {} })),
  mcpList: vi.fn(async () => ({ servers: [{ name: 'youtube-canal', scope: 'global', owner: 'team:team_1' }, { name: 'gmail', scope: 'global', owner: null }, { name: 'mio', scope: 'global', owner: 'agent:agent_w' }] })),
  mcpCatalogList: vi.fn(async () => ({ entries: [] })),
}
vi.mock('../../services/engine', () => ({
  engineApi: new Proxy({}, { get: (_target, key: string) => (api as Record<string, unknown>)[key] }),
  onEngineEvent: vi.fn(async () => () => {}),
  commandMessage: String,
}))
vi.mock('../connectors/CatalogDialog', () => ({ CatalogDialog: () => null }))
vi.mock('../connectors/SignInDialog', () => ({
  SignInDialog: () => null,
  useSignIn: (select: (state: { open: () => void }) => unknown) => select({ open: () => {} }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import AgencySidebar from './AgencySidebar'
import OfficeView, { mentionQuery } from './OfficeView'
import { AgencyDataContext, officeDockKey } from './AgencyData'
import { ErrandPanel } from './OfficePanels'
import { useSessionDockStore } from '../../stores/sessionDock'
import TeamForm from './TeamForm'
import { BoardPanel } from './Board'
import AgencySettings from './AgencySettings'

const wrap = (node: React.ReactNode) => render(<I18nProvider lang="es">{node}</I18nProvider>)

afterEach(() => {
  cleanup()
  errands = [errand()]
  for (const fn of Object.values(api)) fn.mockClear()
})

it('lists each team with its office and its posts, the chief marked', async () => {
  const onOpenOffice = vi.fn()
  const onOpenPost = vi.fn()
  wrap(
    <AgencySidebar
      agents={[writer, video]} status={null} activeAgentId={null} creating={false}
      onOpenAgent={() => {}} onNewAgent={() => {}} onTutorial={() => {}} onLeave={() => {}}
      teams={[team]} activeTeam={{ teamId: 'team_1', agentId: 'agent_v' }}
      onOpenOffice={onOpenOffice} onOpenPost={onOpenPost} onNewTeam={() => {}}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Oficina de Canal infantil' }))
  expect(onOpenOffice).toHaveBeenCalledWith(team)
  const post = screen.getByRole('button', { name: 'Video en Canal infantil' })
  expect(post.getAttribute('aria-current')).toBe('page')
  await userEvent.click(screen.getByRole('button', { name: 'Writer en Canal infantil' }))
  expect(onOpenPost).toHaveBeenCalledWith(team, 'agent_w')
  expect(screen.getByText('Jefe')).toBeTruthy()
})

it('says teams come soon without the capability', () => {
  wrap(<AgencySidebar agents={[]} status={null} activeAgentId={null} creating={false} onOpenAgent={() => {}} onNewAgent={() => {}} onTutorial={() => {}} onLeave={() => {}} />)
  expect(screen.getByText(/Pronto: oficinas/)).toBeTruthy()
  expect(screen.queryByTestId('agency-new-team')).toBeNull()
})

it('reads the @mention being typed', () => {
  expect(mentionQuery('Hola @Wri', 9)).toEqual({ start: 5, query: 'Wri' })
  expect(mentionQuery('correo@video', 12)).toBeNull()
  expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
})

it('posts in the office with an @mention picked from the list', async () => {
  wrap(<OfficeView team={team} agents={[writer, video]} />)
  await waitFor(() => expect(screen.getAllByTestId('agency-office-message')).toHaveLength(3))
  // La tarjeta del recado va una vez, en el mensaje que lo dejó, no también en la entrega.
  expect(screen.getAllByTestId('agency-errand')).toHaveLength(1)
  // El autor de cada mensaje y la tarjeta del recado entregado.
  expect(screen.getAllByText('Tú').length).toBeGreaterThan(0)
  expect(screen.getByText('Un gato astronauta')).toBeTruthy()
  const input = screen.getByTestId('agency-office-input')
  await userEvent.type(input, 'Hola @Vi')
  expect(screen.getByTestId('agency-mention-list')).toBeTruthy()
  await userEvent.keyboard('{Enter}')
  expect((input as HTMLTextAreaElement).value).toBe('Hola @Video ')
  await userEvent.type(input, 'anímalo{Enter}')
  expect(api.agencyOfficePost).toHaveBeenCalledWith('team_1', 'Hola @Video anímalo')
})

it('opens an errand from /recado in the side panel and leaves it on the board for the chief', async () => {
  wrap(<OfficeView team={team} agents={[writer, video]} />)
  const input = screen.getByTestId('agency-office-input')
  await userEvent.type(input, '/recado Guion del martes{Enter}')
  expect(api.agencyOfficePost).not.toHaveBeenCalled()
  // Recado se abre en el panel lateral de la oficina, con el título que traía.
  expect(useSessionDockStore.getState().layoutFor(officeDockKey('team_1')).views).toContain('errand')
  cleanup()
  wrap(<AgencyDataContext.Provider value={{ agents: [writer, video], teams: [team], reload: () => {} }}><ErrandPanel teamId="team_1" /></AgencyDataContext.Provider>)
  expect((screen.getByTestId('agency-errand-title') as HTMLInputElement).value).toBe('Guion del martes')
  fireEvent.change(screen.getByTestId('agency-errand-checks'), { target: { value: '30 segundos\n\nCon gancho' } })
  await userEvent.click(screen.getByTestId('agency-errand-submit'))
  expect(api.agencyCreateErrand).toHaveBeenCalledWith('team_1', {
    title: 'Guion del martes', body: '', done_when: ['30 segundos', 'Con gancho'], to_agent_id: null,
  })
})

it('reviews a delivered errand the owner asked for and sends one back with why', async () => {
  wrap(<OfficeView team={team} agents={[writer, video]} />)
  await waitFor(() => expect(screen.getByTestId('agency-errand-accept')).toBeTruthy())
  await userEvent.click(screen.getByTestId('agency-errand-accept'))
  expect(api.agencyReviewErrand).toHaveBeenCalledWith('err_1', true)
  await userEvent.click(screen.getByRole('button', { name: 'Devolver' }))
  await userEvent.type(screen.getByLabelText('Por qué vuelve'), 'Muy largo')
  await userEvent.click(screen.getAllByRole('button', { name: 'Devolver' }).at(-1)!)
  expect(api.agencyReviewErrand).toHaveBeenCalledWith('err_1', false, 'Muy largo')
})

it('shows the board as a queue and retries a blocked errand', async () => {
  errands = [
    errand({ id: 'e1', title: 'Pendiente', status: 'pending', result: null }),
    errand({ id: 'e2', title: 'Trabado', status: 'blocked', result: null, return_reason: 'Sin red' }),
    errand({ id: 'e3', title: 'Corriendo', status: 'in_progress', result: null }),
    errand({ id: 'e4', title: 'Cancelado', status: 'cancelled', result: null }),
  ]
  wrap(<BoardPanel teamId="team_1" />)
  await waitFor(() => expect(screen.getByText('Pizarra de Canal infantil')).toBeTruthy())
  expect(screen.getByRole('region', { name: 'Pendientes' }).textContent).toContain('Trabado: Sin red')
  expect(screen.getByRole('region', { name: 'En curso' }).textContent).toContain('Corriendo')
  expect(screen.queryByText('Cancelado')).toBeNull()
  await userEvent.click(screen.getByTestId('agency-errand-retry'))
  expect(api.agencyRetryErrand).toHaveBeenCalledWith('e2')
})

it('creates a team with up to eight agents and its chief', async () => {
  const onSaved = vi.fn()
  wrap(<TeamForm agents={[writer, video]} onSaved={onSaved} onCancel={() => {}} />)
  await userEvent.type(screen.getByTestId('agency-team-name'), 'Canal infantil')
  const boxes = screen.getAllByRole('checkbox')
  await userEvent.click(boxes[0])
  await userEvent.click(boxes[1])
  await userEvent.click(screen.getByTestId('agency-team-submit'))
  expect(api.agencyCreateTeam).toHaveBeenCalledWith({
    name: 'Canal infantil', purpose: '', members: ['agent_w', 'agent_v'], chief_agent_id: 'agent_w', connectors: [], budget: {},
  })
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
})

it('changes members one by one and duplicates a team without its accounts', async () => {
  const onSaved = vi.fn()
  const extra = agent('agent_x', 'Extra')
  wrap(<TeamForm agents={[writer, video, extra]} team={team} onSaved={onSaved} onCancel={() => {}} />)
  // Solo se ofrecen los conectores de todos y las cuentas del equipo.
  await waitFor(() => expect(screen.getByText('youtube-canal')).toBeTruthy())
  expect(screen.queryByText('mio')).toBeNull()
  const memberBoxes = screen.getAllByRole('checkbox').slice(0, 3)
  await userEvent.click(memberBoxes[1])
  await userEvent.click(memberBoxes[2])
  await userEvent.click(screen.getByTestId('agency-team-submit'))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(api.agencyJoinTeam).toHaveBeenCalledWith('team_1', 'agent_x')
  expect(api.agencyLeaveTeam).toHaveBeenCalledWith('team_1', 'agent_v')
  await userEvent.click(screen.getByTestId('agency-team-duplicate-open'))
  const name = screen.getByTestId('agency-team-copy-name') as HTMLInputElement
  expect(name.value).toBe('Canal infantil (copia)')
  await userEvent.clear(name)
  await userEvent.type(name, 'Canal de recetas')
  await userEvent.click(screen.getByTestId('agency-team-copy'))
  expect(api.agencyDuplicateTeam).toHaveBeenCalledWith('team_1', 'Canal de recetas')
})

it('settings show each team and the whole Agency, with subagents still to come', async () => {
  wrap(<AgencySettings agents={[writer, video]} teams={[team]} teamsEnabled initialTeamId="team_1" />)
  await waitFor(() => expect(screen.getByText('youtube-canal')).toBeTruthy())
  expect(api.agencyTeamMemory).toHaveBeenCalledWith('team_1')
  expect(screen.queryByText('mio')).toBeNull()
  await userEvent.click(screen.getByTestId('agency-settings-scope-agency'))
  await waitFor(() => expect(screen.getByTestId('agency-errand-mode')).toBeTruthy())
  const later = screen.getByTestId('agency-errand-mode-subagents')
  expect(later.getAttribute('aria-disabled')).toBe('true')
  expect(later.textContent).toContain('Pronto')
  await userEvent.click(later)
  expect(api.agencySetSettings).not.toHaveBeenCalled()
  expect(screen.getByTestId('agency-errand-mode-turn').getAttribute('aria-pressed')).toBe('true')
})
