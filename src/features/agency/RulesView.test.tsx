// @vitest-environment jsdom
// Rinari Agency (D-18): las reglas de un agente en el panel lateral. Una
// propuesta solo se crea cuando el dueño la activa; las activas se pausan.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ScheduledTask, ScheduledTaskInput } from '../../services/engine'

const tasks: ScheduledTask[] = []
const scheduleCreate = vi.fn(async (task: unknown) => ({ task }))
const scheduleUpdate = vi.fn(async (id: string, patch: unknown) => ({ task: { id, ...(patch as object) } }))
const scheduleRehearse = vi.fn(async (_task: unknown) => ({ status: 'started', job_id: 'reh_1' }))
let engineListener: ((event: { event: string; payload: unknown }) => void) | null = null
vi.mock('../../services/engine', () => ({
  engineApi: {
    scheduleList: vi.fn(async () => ({ tasks, now: 0 })),
    scheduleCreate: (task: unknown) => scheduleCreate(task),
    scheduleUpdate: (id: string, patch: unknown) => scheduleUpdate(id, patch),
    scheduleDelete: vi.fn(),
    scheduleRunNow: vi.fn(),
    scheduleRehearse: (task: unknown) => scheduleRehearse(task),
    agencyAgent: vi.fn(async () => ({ agent: { id: 'agent_1', connectors: ['gmail', 'telegram'] }, sessions: [] })),
    mcpToolsList: vi.fn(async (name: string) => ({ server: { name, tools: name === 'gmail' ? [{ name: 'search', listed: true }] : [{ name: 'send_message', listed: true }] } })),
  },
  onEngineEvent: vi.fn(async (listener: (event: { event: string; payload: unknown }) => void) => {
    engineListener = listener
    return () => {}
  }),
  commandMessage: String,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../engine/EngineContext', () => ({
  useOptionalEngineData: () => ({ status: { capabilities: { agency_rule_rehearsal_v1: true } } }),
}))

import RulesView from './RulesView'
import { useAgencyStore } from '../../stores/agency'

const rule = (over: Partial<ScheduledTaskInput> = {}): ScheduledTaskInput => ({
  name: 'Correos de patito',
  kind: 'tool',
  schedule: { kind: 'interval', minutes: 15 },
  prompt: '',
  agent_id: 'agent_1',
  tool: {
    server: 'gmail',
    tool: 'search',
    arguments: { query: 'from:x@patito.com' },
    on_result: 'deliver',
    deliver: { server: 'telegram', tool: 'send_message', arguments: { text: '{result}' } },
    max_per_day: 20,
  },
  ...over,
})

beforeEach(() => {
  tasks.length = 0
  useAgencyStore.setState({ proposals: [], agentSessions: { ses_1: 'agent_1' } })
})
afterEach(() => { cleanup(); scheduleCreate.mockClear(); scheduleUpdate.mockClear() })

it('a proposed rule shows its parts and is created only when the owner turns it on', async () => {
  const proposal = rule()
  act(() => {
    useAgencyStore.getState().addProposal(proposal)
    useAgencyStore.getState().addProposal(rule({ name: 'De otro agente', agent_id: 'agent_2' }))
  })
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  const card = screen.getByTestId('agency-rule-proposal')
  expect(card.textContent).toContain('gmail · search')
  expect(card.textContent).toContain('telegram · send_message')
  expect(card.textContent).toContain('Máx. 20 al día')
  expect(screen.queryByText('De otro agente')).toBeNull()
  expect(scheduleCreate).not.toHaveBeenCalled()
  await userEvent.click(screen.getByTestId('agency-rule-activate'))
  await waitFor(() => expect(scheduleCreate).toHaveBeenCalledWith(proposal))
  expect(useAgencyStore.getState().proposals.map((item) => item.name)).toEqual(['De otro agente'])
})

it('an active rule of the agent can be paused', async () => {
  tasks.push({
    ...(rule() as ScheduledTask),
    id: 'sch_1',
    enabled: true,
    mode: 'build',
    skills: [],
    grants: [],
    project_id: null,
    model: null,
    next_run_at: null,
    created_at: 0,
    updated_at: 0,
    last_run: null,
  } as unknown as ScheduledTask)
  tasks.push({ ...(tasks[0] as object), id: 'sch_2', name: 'Ajena', agent_id: 'agent_9' } as ScheduledTask)
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await waitFor(() => expect(screen.getAllByTestId('agency-rule')).toHaveLength(1))
  await userEvent.click(screen.getByRole('button', { name: /Pausar/ }))
  await waitFor(() => expect(scheduleUpdate).toHaveBeenCalledWith('sch_1', { enabled: false }))
})

it('«Probar» shows what the rule would send now, and creates nothing', async () => {
  const proposal = rule()
  act(() => useAgencyStore.getState().addProposal(proposal))
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await userEvent.click(screen.getByTestId('agency-rule-rehearse'))
  expect(scheduleRehearse).toHaveBeenCalledWith(proposal)
  act(() => engineListener!({
    event: 'schedule.rehearsed',
    payload: {
      job_id: 'reh_1',
      outcome: 'would_run',
      result: 'Factura 42',
      delivery: { server: 'telegram', tool: 'send_message', arguments: { text: 'Factura 42' } },
    },
  }))
  const box = await screen.findByTestId('agency-rule-rehearsal')
  expect(box.getAttribute('data-outcome')).toBe('would_run')
  expect(box.textContent).toContain('telegram · send_message')
  expect(scheduleCreate).not.toHaveBeenCalled()
})

it('the owner writes a new rule: it waits as a proposal to try and turn on, nothing is created yet', async () => {
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await userEvent.click(screen.getByTestId('agency-rule-new'))
  fireEvent.change(await screen.findByTestId('agency-rule-name'), { target: { value: 'Avisos de CI' } })
  const server = await screen.findByTestId('agency-rule-server')
  await waitFor(() => expect(server.querySelectorAll('option').length).toBe(3))
  fireEvent.change(server, { target: { value: 'gmail' } })
  await waitFor(() => expect(screen.getByTestId('agency-rule-tool').tagName).toBe('SELECT'))
  fireEvent.change(screen.getByTestId('agency-rule-tool'), { target: { value: 'search' } })
  fireEvent.change(screen.getByTestId('agency-rule-args'), { target: { value: '{"query": "is:unread"}' } })
  await userEvent.click(screen.getByTestId('agency-rule-add'))
  const card = await screen.findByTestId('agency-rule-proposal')
  expect(card.textContent).toContain('gmail · search')
  expect(scheduleCreate).not.toHaveBeenCalled()
  expect(useAgencyStore.getState().proposals[0]).toMatchObject({
    name: 'Avisos de CI',
    kind: 'tool',
    agent_id: 'agent_1',
    tool: { server: 'gmail', tool: 'search', arguments: { query: 'is:unread' }, on_result: 'notify' },
  })
})

it('a new rule with something missing says what and adds nothing', async () => {
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await userEvent.click(screen.getByTestId('agency-rule-new'))
  fireEvent.change(await screen.findByTestId('agency-rule-name'), { target: { value: 'Sin conector' } })
  await userEvent.click(screen.getByTestId('agency-rule-add'))
  expect((await screen.findByRole('alert')).textContent).toBe('Elige el conector y la herramienta.')
  expect(useAgencyStore.getState().proposals).toEqual([])
})
