// @vitest-environment jsdom
// «Arma tu equipo con Rinari»: describir, preguntas, revisar la propuesta,
// elegir reutilizar o no, y crearla de una vez; «Para empezar» en el equipo.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n'
import type { AgencyTeam, TeamPlan, TeamSetupItem } from '../types'
import { addRoutine, blockers, removeAgent, removeStep, setFlow } from './planEdit'

let engineListener: ((event: { event: string; payload: unknown }) => void) | null = null

const plan = (): TeamPlan => ({
  team: { name: 'Facturas', purpose: 'Ordenar facturas', manual: 'Lector recibe todo.', chief: 'lector', project_folder: null, work_folders: ['C:/Facturas'] },
  agents: [
    { key: 'lector', name: 'Lector', role: 'Lee', instructions: 'Lee.', permission_profile: 'read-only', uses: [{ kind: 'connector', name: 'correo' }] },
    {
      key: 'archivo', name: 'Archivo', role: 'Guarda', instructions: 'Guarda.', permission_profile: 'workspace',
      uses: [{ kind: 'catalog', id: 'notion', name: 'Notion' }, { kind: 'missing', need: 'enviar SMS' }],
      reuse_agent_id: 'agent_old', reuse_name: 'Archivista', reuse_named: false, reuse: null,
    },
  ],
  flow: {
    name: 'Factura', description: '', steps: [
      { name: 'Leer', agents: ['lector'], instructions: 'Lee la factura', approval: 'auto' },
      { name: 'Guardar', agents: ['archivo'], instructions: 'Guárdala', approval: 'auto' },
    ],
  },
  routines: [{ name: 'Cada día', schedule: { kind: 'daily', time: '09:00' }, starts_flow: true, input: 'Las nuevas', agent: null, prompt: '' }],
  assumptions: ['Las facturas llegan por correo'],
})

const created: AgencyTeam = {
  id: 'team_1', rinari_profile_id: 'default', name: 'Facturas', purpose: '', chief_agent_id: 'a1', connectors: [], budget: {},
  members: ['a1', 'a2'], posts: [], created_at: 1, updated_at: 1, archived_at: null,
}

const api = {
  agencyTeamDraft: vi.fn(async (_input: unknown) => ({ status: 'started' as const, job_id: 'job_1' })),
  agencyTeamCheck: vi.fn(async (input: TeamPlan) => ({ plan: input, notes: [], pending: [{ agent: 'archivo', kind: 'catalog', catalog_id: 'notion', name: 'Notion' }], connectors: { correo: 'connected' } })),
  agencyTeamApply: vi.fn(async (_plan: TeamPlan) => ({ team: created, agents: ['a1', 'a2'], created_agents: ['a1'], flow_id: 'f1', routine_ids: ['r1'], setup: [] as TeamSetupItem[] })),
  agencyTemplates: vi.fn(async () => ({ templates: [{ id: 'tpl', name: 'Contenido', purpose: '', agents: [], plan: { ...plan(), agents: [plan().agents[0]], flow: null, routines: [] } }] })),
  agencyTeamSetup: vi.fn(async () => ({ team_id: 'team_1', setup: [] })),
  agencyTeamSetupResolve: vi.fn(async (_team: string, id: string, action: string) => ({
    team_id: 'team_1',
    setup: [{ id, agent_id: 'a2', agent: 'Archivo', kind: 'missing', need: 'enviar SMS', status: 'done', resolution: action }] as TeamSetupItem[],
  })),
  modelList: vi.fn(async () => ({ models: [] })),
  providerList: vi.fn(async () => ({ providers: [], active_alias: null })),
  mcpCatalogList: vi.fn(async () => ({ entries: [] })),
  mcpList: vi.fn(async () => ({ servers: [{ name: 'correo', scope: 'global', owner: null, enabled: true }] })),
}
vi.mock('../../../services/engine', () => ({
  engineApi: new Proxy({}, { get: (_target, key: string) => (api as Record<string, unknown>)[key] }),
  onEngineEvent: vi.fn(async (listener: (event: { event: string; payload: unknown }) => void) => {
    engineListener = listener
    return () => { engineListener = null }
  }),
  commandMessage: String,
}))
vi.mock('../../connectors/CatalogDialog', () => ({ CatalogDialog: () => null }))
vi.mock('../../connectors/SignInDialog', () => ({
  SignInDialog: () => null,
  useSignIn: (select: (state: { open: () => void }) => unknown) => select({ open: () => {} }),
}))
vi.mock('../../remote/useFolderPicker', () => ({ useFolderPicker: () => ({ pickFolders: async () => ['C:/Otra'], dialog: null }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import TeamBuilder from './TeamBuilder'
import TeamSetup from './TeamSetup'

const wrap = (node: React.ReactNode) => render(<I18nProvider lang="es">{node}</I18nProvider>)

afterEach(() => {
  cleanup()
  engineListener = null
  for (const fn of Object.values(api)) fn.mockClear()
})

async function describeAndPropose() {
  fireEvent.change(screen.getByTestId('team-builder-description'), { target: { value: 'Ordena mis facturas cada día' } })
  fireEvent.click(screen.getByTestId('team-builder-propose'))
  await waitFor(() => expect(api.agencyTeamDraft).toHaveBeenCalled())
  await waitFor(() => expect(engineListener).not.toBeNull())
}

it('edits keep the plan consistent when an agent, a step or the flow goes', () => {
  const without = removeAgent(plan(), 'lector')
  expect(without.team.chief).toBe('archivo')
  expect(without.flow?.steps.map((step) => step.name)).toEqual(['Guardar'])
  const noFlow = setFlow(plan(), null)
  expect(noFlow.routines).toEqual([])
  expect(removeStep(removeStep(plan(), 0), 0).flow).toBeNull()
  expect(addRoutine(noFlow, 'Revisión').routines[0]).toMatchObject({ starts_flow: false, agent: 'lector' })
  expect(blockers(plan()).map((item) => item.key)).toEqual(['reuse'])
})

it('describes, gets the proposal and creates it only after the owner chooses about reuse', async () => {
  const onCreated = vi.fn()
  wrap(<TeamBuilder onCreated={onCreated} onCancel={() => {}} />)
  await describeAndPropose()
  expect(api.agencyTeamDraft.mock.calls[0][0]).toMatchObject({ description: 'Ordena mis facturas cada día', language: 'es' })
  act(() => engineListener!({ event: 'agency.team_draft.ready', payload: { job_id: 'otro', kind: 'plan', plan: plan() } }))
  expect(screen.queryByTestId('team-builder-agent')).toBeNull()
  act(() => engineListener!({ event: 'agency.team_draft.ready', payload: { job_id: 'job_1', kind: 'plan', plan: plan(), pending: [] } }))

  const cards = await screen.findAllByTestId('team-builder-agent')
  expect(cards).toHaveLength(2)
  expect(screen.getByTestId('team-builder-name')).toHaveProperty('value', 'Facturas')
  expect(screen.getAllByTestId('team-builder-step')).toHaveLength(2)
  expect(screen.getByTestId('team-builder-routine')).toBeTruthy()
  expect(screen.getByText('C:/Facturas')).toBeTruthy()
  expect(screen.getByText('Las facturas llegan por correo')).toBeTruthy()
  await waitFor(() => expect(screen.getByTestId('team-builder-pending')).toBeTruthy())

  // A suggested agent waits for the owner's choice: nothing is created until then.
  const create = screen.getByTestId('team-builder-create') as HTMLButtonElement
  expect(create.disabled).toBe(true)
  expect(screen.getByTestId('team-builder-blocker').textContent).toContain('Archivista')
  fireEvent.click(within(cards[1]).getByRole('radio', { name: 'Crear uno nuevo' }))
  expect(create.disabled).toBe(false)
  fireEvent.click(create)
  await waitFor(() => expect(api.agencyTeamApply).toHaveBeenCalled())
  expect(api.agencyTeamApply.mock.calls[0][0].agents[1].reuse).toBe(false)
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
})

it('asks Rinari questions back and sends the answers', async () => {
  wrap(<TeamBuilder onCreated={() => {}} onCancel={() => {}} />)
  await describeAndPropose()
  act(() => engineListener!({ event: 'agency.team_draft.ready', payload: { job_id: 'job_1', kind: 'questions', questions: ['¿En qué carpeta?'] } }))
  const question = await screen.findByTestId('team-builder-question')
  expect(question.textContent).toContain('¿En qué carpeta?')
  fireEvent.change(within(question).getByRole('textbox'), { target: { value: 'C:/Facturas' } })
  fireEvent.click(screen.getByTestId('team-builder-answer'))
  await waitFor(() => expect(api.agencyTeamDraft).toHaveBeenCalledTimes(2))
  expect(api.agencyTeamDraft.mock.calls[1][0]).toMatchObject({ answers: [{ question: '¿En qué carpeta?', answer: 'C:/Facturas' }] })
})

it('opens a template straight in the review', async () => {
  wrap(<TeamBuilder templateId="tpl" onCreated={() => {}} onCancel={() => {}} />)
  const cards = await screen.findAllByTestId('team-builder-agent')
  expect(cards).toHaveLength(1)
  expect(screen.queryByTestId('team-builder-feedback')).toBeNull()
})

it('«Para empezar» settles a piece and says what is left', async () => {
  const onChanged = vi.fn()
  const items: TeamSetupItem[] = [
    { id: 'piece-1', agent_id: 'a2', agent: 'Archivo', kind: 'missing', need: 'enviar SMS', status: 'pending' },
  ]
  wrap(<TeamSetup teamId="team_1" items={items} onChanged={onChanged} />)
  expect(screen.getByText('Algo que pueda: enviar SMS')).toBeTruthy()
  fireEvent.click(screen.getByTestId('agency-team-setup-manual'))
  await waitFor(() => expect(api.agencyTeamSetupResolve).toHaveBeenCalledWith('team_1', 'piece-1', 'manual', undefined))
  await waitFor(() => expect(screen.getByTestId('agency-team-setup-item').dataset.status).toBe('done'))
  expect(onChanged).toHaveBeenCalled()
})
