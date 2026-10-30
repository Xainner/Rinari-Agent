// @vitest-environment jsdom
// Rinari Agency (D-18): las reglas de un agente en el panel lateral. Van por
// permisos: la que crea el agente o el dueño ya existe (no hay propuestas);
// se editan, se prueban, se pausan y muestran su historial.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ScheduledRun, ScheduledTask, ScheduledTaskInput } from '../../services/engine'

const tasks: ScheduledTask[] = []
const runs: ScheduledRun[] = []
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
    scheduleRuns: vi.fn(async () => ({ runs })),
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
  useOptionalEngineData: () => ({ status: { capabilities: { agency_rule_rehearsal_v1: true, agency_audit_v1: true } } }),
}))

import RulesView, { AGENCY_OPEN_RUN_EVENT } from './RulesView'
import { useAgencyStore } from '../../stores/agency'
import { AgencyDataContext } from './AgencyData'
import type { AgencyTeam } from './types'

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

/** A rule as the Engine keeps it (the agent created it, or the owner did). */
const stored = (over: Partial<ScheduledTask> = {}): ScheduledTask => ({
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
  description: '',
  last_run: null,
  ...over,
} as unknown as ScheduledTask)

beforeEach(() => {
  tasks.length = 0
  runs.length = 0
  useAgencyStore.setState({ agentSessions: { ses_1: 'agent_1' } })
})
afterEach(() => { cleanup(); scheduleCreate.mockClear(); scheduleUpdate.mockClear(); scheduleRehearse.mockClear() })

it('a rule the agent created is there once, with its parts, and nothing asks to turn it on', async () => {
  tasks.push(stored(), stored({ id: 'sch_2', name: 'De otro agente', agent_id: 'agent_2' }))
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await waitFor(() => expect(screen.getAllByTestId('agency-rule')).toHaveLength(1))
  const card = screen.getByTestId('agency-rule')
  expect(card.textContent).toContain('gmail · search')
  expect(card.textContent).toContain('telegram · send_message')
  expect(card.textContent).toContain('Máx. 20 al día')
  expect(screen.queryByText('De otro agente')).toBeNull()
  expect(screen.queryByText('Propuesta')).toBeNull()
  expect(screen.queryByText('Activar regla')).toBeNull()
})

it('an active rule of the agent can be paused', async () => {
  tasks.push(stored(), stored({ id: 'sch_2', name: 'Ajena', agent_id: 'agent_9' }))
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await waitFor(() => expect(screen.getAllByTestId('agency-rule')).toHaveLength(1))
  await userEvent.click(screen.getByRole('button', { name: /Pausar/ }))
  await waitFor(() => expect(scheduleUpdate).toHaveBeenCalledWith('sch_1', { enabled: false }))
})

it('«Probar» on a saved rule shows what it would send now, and changes nothing', async () => {
  tasks.push(stored())
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await userEvent.click(await screen.findByTestId('agency-rule-rehearse'))
  expect(scheduleRehearse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Correos de patito', kind: 'tool', agent_id: 'agent_1', tool: rule().tool }))
  expect(scheduleRehearse.mock.calls[0][0]).not.toHaveProperty('id')
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
  expect(scheduleUpdate).not.toHaveBeenCalled()
})

it('the owner writes a new rule and it is created at once, for this agent', async () => {
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
  await waitFor(() => expect(scheduleCreate).toHaveBeenCalledTimes(1))
  expect(scheduleCreate.mock.calls[0][0]).toMatchObject({
    name: 'Avisos de CI',
    kind: 'tool',
    agent_id: 'agent_1',
    tool: { server: 'gmail', tool: 'search', arguments: { query: 'is:unread' }, on_result: 'notify' },
  })
  await waitFor(() => expect(screen.queryByTestId('agency-rule-form')).toBeNull())
})

it('a rule opens prefilled to edit, and saving changes that rule (its destination kept)', async () => {
  tasks.push(stored({ kind: 'agent', tool: null, prompt: 'Resume el día', deliver_to: { kind: 'office', team_id: 'team_1' } }))
  const team = { id: 'team_1', name: 'Mesa de oro', members: ['agent_1'], posts: [] } as unknown as AgencyTeam
  render(
    <AgencyDataContext.Provider value={{ agents: [], teams: [team], reload: () => undefined }}>
      <I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>
    </AgencyDataContext.Provider>,
  )
  // Where it delivers is said by name, never by id.
  expect((await screen.findByTestId('agency-rule-deliver-target')).textContent).toBe('Oficina de Mesa de oro')
  await userEvent.click(screen.getByTestId('agency-rule-edit'))
  const name = await screen.findByTestId('agency-rule-name')
  expect((name as HTMLInputElement).value).toBe('Correos de patito')
  expect((screen.getByTestId('agency-rule-prompt') as HTMLTextAreaElement).value).toBe('Resume el día')
  fireEvent.change(name, { target: { value: 'Resumen diario' } })
  await userEvent.click(screen.getByTestId('agency-rule-add'))
  await waitFor(() => expect(scheduleUpdate).toHaveBeenCalledTimes(1))
  expect(scheduleUpdate.mock.calls[0][0]).toBe('sch_1')
  expect(scheduleUpdate.mock.calls[0][1]).toMatchObject({ name: 'Resumen diario', kind: 'agent', prompt: 'Resume el día', deliver_to: { kind: 'office', team_id: 'team_1' } })
  expect(scheduleCreate).not.toHaveBeenCalled()
})

it('its history lists the runs and opens the conversation of one', async () => {
  tasks.push(stored())
  runs.push(
    { id: 'run_2', task_id: 'sch_1', status: 'failed', trigger: 'manual', scheduled_for: null, started_at: 1_760_000_000, finished_at: null, session_id: null, turn_id: null, summary: null, reason: 'gmail no respondió' },
    { id: 'run_1', task_id: 'sch_1', status: 'completed', trigger: 'schedule', scheduled_for: null, started_at: 1_759_990_000, finished_at: null, session_id: 'ses_run', turn_id: null, summary: 'Nada nuevo', reason: null },
  )
  const opened = vi.fn()
  window.addEventListener(AGENCY_OPEN_RUN_EVENT, opened)
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await userEvent.click(await screen.findByTestId('agency-rule-history'))
  const list = await screen.findByTestId('agency-rule-runs')
  expect(list.textContent).toContain('gmail no respondió')
  expect(list.textContent).toContain('Nada nuevo')
  // Only a run with a conversation offers to open it.
  const open = screen.getAllByTestId('agency-rule-run-open')
  expect(open).toHaveLength(1)
  await userEvent.click(open[0])
  expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ agentId: 'agent_1', sessionId: 'ses_run' })
  window.removeEventListener(AGENCY_OPEN_RUN_EVENT, opened)
})

it('a new rule with something missing says what and creates nothing', async () => {
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await userEvent.click(screen.getByTestId('agency-rule-new'))
  fireEvent.change(await screen.findByTestId('agency-rule-name'), { target: { value: 'Sin conector' } })
  await userEvent.click(screen.getByTestId('agency-rule-add'))
  expect((await screen.findByRole('alert')).textContent).toBe('Elige el conector y la herramienta.')
  expect(scheduleCreate).not.toHaveBeenCalled()
})

it('a new rule respects the limits Rinari checks, and editing clears the error', async () => {
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await userEvent.click(screen.getByTestId('agency-rule-new'))
  fireEvent.change(await screen.findByTestId('agency-rule-name'), { target: { value: 'Límites' } })
  const server = await screen.findByTestId('agency-rule-server')
  await waitFor(() => expect(server.querySelectorAll('option').length).toBe(3))
  fireEvent.change(server, { target: { value: 'gmail' } })
  await waitFor(() => expect(screen.getByTestId('agency-rule-tool').tagName).toBe('SELECT'))
  fireEvent.change(screen.getByTestId('agency-rule-tool'), { target: { value: 'search' } })

  // Una carpeta relativa no se puede vigilar.
  fireEvent.change(screen.getByLabelText('Solo si cambió esta carpeta (opcional)'), { target: { value: 'docs' } })
  await userEvent.click(screen.getByTestId('agency-rule-add'))
  expect((await screen.findByRole('alert')).textContent).toBe('La carpeta tiene que ser una ruta completa, no relativa.')
  // Cambiar un campo quita el error.
  fireEvent.change(screen.getByLabelText('Solo si cambió esta carpeta (opcional)'), { target: { value: '' } })
  expect(screen.queryByRole('alert')).toBeNull()

  // Se mide como Rinari: lo que no es ASCII cuenta como \uXXXX.
  fireEvent.change(screen.getByTestId('agency-rule-args'), { target: { value: JSON.stringify({ q: 'ñ'.repeat(2000) }) } })
  await userEvent.click(screen.getByTestId('agency-rule-add'))
  expect((await screen.findByRole('alert')).textContent).toBe('Los argumentos no pueden pasar de 8000 caracteres.')
  fireEvent.change(screen.getByTestId('agency-rule-args'), { target: { value: '{}' } })

  fireEvent.change(screen.getByLabelText('Máximo al día (opcional)'), { target: { value: '1001' } })
  await userEvent.click(screen.getByTestId('agency-rule-add'))
  expect((await screen.findByRole('alert')).textContent).toBe('El máximo al día es un número entero entre 1 y 1000.')
  expect(screen.getByLabelText('Solo si el resultado dice (texto exacto, opcional)').getAttribute('maxLength')).toBe('200')
  expect(scheduleCreate).not.toHaveBeenCalled()
})

it('a connector rule that hands the result to the agent says what to ask; a delivery is its own group', async () => {
  render(<I18nProvider lang="es"><RulesView sessionId="ses_1" /></I18nProvider>)
  await userEvent.click(screen.getByTestId('agency-rule-new'))
  fireEvent.change(await screen.findByTestId('agency-rule-name'), { target: { value: 'Resumen' } })
  const server = await screen.findByTestId('agency-rule-server')
  await waitFor(() => expect(server.querySelectorAll('option').length).toBe(3))
  fireEvent.change(server, { target: { value: 'gmail' } })
  await waitFor(() => expect(screen.getByTestId('agency-rule-tool').tagName).toBe('SELECT'))
  fireEvent.change(screen.getByTestId('agency-rule-tool'), { target: { value: 'search' } })

  fireEvent.change(screen.getByTestId('agency-rule-on-result'), { target: { value: 'deliver' } })
  const delivery = screen.getByRole('group', { name: 'A dónde lo manda' })
  expect(delivery.querySelector('textarea')?.value).toBe('{}')
  expect(screen.queryByTestId('agency-rule-result-prompt')).toBeNull()
  // Handed to another connector: no «where the result goes» choice.
  expect(screen.queryByTestId('agency-rule-deliver-to')).toBeNull()

  fireEvent.change(screen.getByTestId('agency-rule-on-result'), { target: { value: 'agent' } })
  expect(screen.getByTestId('agency-rule-deliver-to')).toBeTruthy()
  fireEvent.change(screen.getByTestId('agency-rule-result-prompt'), { target: { value: 'Resúmelos en una línea.' } })
  await userEvent.click(screen.getByTestId('agency-rule-add'))
  await waitFor(() => expect(scheduleCreate).toHaveBeenCalledTimes(1))
  expect(scheduleCreate.mock.calls[0][0]).toMatchObject({
    kind: 'tool',
    prompt: 'Resúmelos en una línea.',
    tool: { server: 'gmail', tool: 'search', on_result: 'agent' },
    deliver_to: null,
  })
})
