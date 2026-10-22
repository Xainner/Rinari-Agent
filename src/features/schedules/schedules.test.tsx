// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { EngineEventMsg, ScheduledRun, ScheduledTask } from '../../services/engine'

let emit: (event: EngineEventMsg) => void = () => {}
vi.mock('../../services/engine', () => ({
  engineApi: {
    scheduleList: vi.fn(),
    scheduleGet: vi.fn(),
    scheduleCreate: vi.fn(async () => ({})),
    scheduleUpdate: vi.fn(async () => ({})),
    scheduleDelete: vi.fn(async () => ({ deleted: true })),
    scheduleRunNow: vi.fn(async () => ({})),
    scheduleGrant: vi.fn(async () => ({})),
    sessionGet: vi.fn(async () => { throw new Error('unknown') }),
  },
  onEngineEvent: vi.fn(async (listener: (event: EngineEventMsg) => void) => {
    emit = listener
    return () => {}
  }),
  commandMessage: (error: unknown) => String((error as { message?: string })?.message ?? error),
}))
vi.mock('../engine/EngineContext', () => ({
  useEngineData: () => ({
    projects: [{ id: 'prj_1', name: 'Rinari CLI', permission_profile: 'read-only' }],
    models: [{ id: 'mdl_1', alias: 'main', saved: true }],
  }),
}))
const toasts = vi.hoisted(() => ({ calls: [] as Array<{ kind: string; title: string; options?: { action?: { label: string; onClick: () => void } } }> }))
vi.mock('sonner', () => {
  const make = (kind: string) => (title: string, options?: never) => toasts.calls.push({ kind, title, options })
  return { toast: Object.assign(make('info'), { success: make('success'), error: make('error'), warning: make('warning') }) }
})
const sent = vi.hoisted(() => ({ notifications: [] as Array<{ title: string; body: string; target?: { sessionId?: string } }> }))
vi.mock('../../services/notifications', () => ({
  sendSystemNotification: vi.fn(async (notification) => { sent.notifications.push(notification); return true }),
  onNotificationActivated: vi.fn(async () => () => {}),
}))

import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import { useUIStore } from '../../stores/ui'
import ScheduleForm from './ScheduleForm'
import ScheduleNotifier from './ScheduleNotifier'
import SchedulesView from './SchedulesView'
import { describeSchedule, draftProblem, emptyDraft, runTone, useScheduleForm } from './scheduleModel'
import { resetNotificationCenterForTests, useNotificationCenter } from '../../stores/notificationCenter'
import { translate } from '../../i18n'

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('es', key, vars)

function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'sch_1',
    name: 'Resumen diario',
    kind: 'agent',
    schedule: { kind: 'daily', time: '08:30' },
    prompt: 'Resume los cambios de ayer.',
    project_id: 'prj_1',
    mode: 'build',
    model: null,
    skills: [],
    grants: [{ capability: 'shell.exec', target: null }],
    enabled: true,
    next_run_at: 1_790_000_000,
    created_at: 1,
    updated_at: 1,
    description: 'daily at 08:30',
    last_run: null,
    ...overrides,
  }
}

function run(overrides: Partial<ScheduledRun> = {}): ScheduledRun {
  return {
    id: 'run_1', task_id: 'sch_1', status: 'completed', trigger: 'schedule', scheduled_for: 1_789_900_000,
    started_at: 1_789_900_001, finished_at: 1_789_900_100, session_id: 'ses_run', turn_id: 'turn_1',
    summary: 'Todo en orden.', reason: null, ...overrides,
  }
}

beforeEach(() => {
  toasts.calls.length = 0
  sent.notifications.length = 0
  useScheduleForm.setState({ open: null })
  resetNotificationCenterForTests()
  vi.mocked(engineApi.scheduleList).mockResolvedValue({ tasks: [task()], now: 0 })
  vi.mocked(engineApi.scheduleGet).mockResolvedValue({ task: task(), runs: [run(), run({ id: 'run_0', status: 'skipped', reason: 'missed', session_id: null, summary: null })] })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const wrap = (node: React.ReactNode) => render(<I18nProvider lang="es">{node}</I18nProvider>)

it('describes schedules in the owner language and checks drafts before sending', () => {
  expect(describeSchedule({ kind: 'weekly', days: [0, 1, 2, 3, 4], time: '08:30' }, t, 'es')).toBe('De lunes a viernes a las 08:30')
  expect(describeSchedule({ kind: 'weekly', days: [0, 2], time: '07:05' }, t, 'es')).toBe('Lun, Mié a las 07:05')
  expect(describeSchedule({ kind: 'interval', minutes: 120 }, t, 'es')).toBe('Cada 2 h')
  expect(draftProblem({ ...emptyDraft(), name: 'x' }, t)).toBe('Di qué debe hacer Rinari.')
  // Sin mínimo de 5 minutos (22-oct): 2 minutos y 30 segundos valen; solo el piso del programador.
  expect(draftProblem({ ...emptyDraft(), name: 'x', prompt: 'y', schedule: { kind: 'interval', minutes: 2 } }, t)).toBeNull()
  expect(draftProblem({ ...emptyDraft(), name: 'x', prompt: 'y', schedule: { kind: 'interval', seconds: 30 } }, t)).toBeNull()
  expect(draftProblem({ ...emptyDraft(), name: 'x', prompt: 'y', schedule: { kind: 'interval', seconds: 3 } }, t)).toBe('El intervalo mínimo es de 5 segundos.')
  expect(describeSchedule({ kind: 'interval', seconds: 30 }, t, 'es')).toBe('Cada 30 s')
  expect(describeSchedule({ kind: 'interval', minutes: 1 }, t, 'es')).toBe('Cada 1 min')
  expect(runTone('blocked')).toBe('warn')
})

it('lists tasks with their history and opens the conversation of a run', async () => {
  const onOpenSession = vi.fn()
  wrap(<SchedulesView onOpenSession={onOpenSession} />)
  expect(await screen.findByRole('heading', { name: 'Resumen diario' })).toBeTruthy()
  expect(screen.getAllByText('Cada día a las 08:30').length).toBeGreaterThan(0)
  expect(await screen.findByText('Todo en orden.')).toBeTruthy()
  expect(screen.getByText('La app estaba cerrada a esa hora.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Abrir conversación/ }))
  expect(onOpenSession).toHaveBeenCalledWith('ses_run')
  fireEvent.click(screen.getByRole('button', { name: /Probar ahora/ }))
  await waitFor(() => expect(engineApi.scheduleRunNow).toHaveBeenCalledWith('sch_1'))
  fireEvent.click(screen.getByRole('switch', { name: 'Activar Resumen diario' }))
  await waitFor(() => expect(engineApi.scheduleUpdate).toHaveBeenCalledWith('sch_1', { enabled: false }))
})

it('asks before deleting a task', async () => {
  wrap(<SchedulesView onOpenSession={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Resumen diario' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(engineApi.scheduleDelete).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
  await waitFor(() => expect(engineApi.scheduleDelete).toHaveBeenCalledWith('sch_1'))
})

it('creates a weekly task with its grants', async () => {
  wrap(<ScheduleForm />)
  act(() => useScheduleForm.getState().openNew())
  fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Backup' } })
  fireEvent.change(screen.getByLabelText('Qué debe hacer Rinari'), { target: { value: 'Haz el backup' } })
  fireEvent.change(screen.getByLabelText('Cuándo'), { target: { value: 'weekly' } })
  fireEvent.click(screen.getByRole('button', { name: 'Vie' }))
  fireEvent.change(screen.getByLabelText('Añadir'), { target: { value: 'shell.exec' } })
  fireEvent.click(screen.getByRole('button', { name: 'Añadir' }))
  fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }))
  await waitFor(() => expect(engineApi.scheduleCreate).toHaveBeenCalled())
  const sentTask = vi.mocked(engineApi.scheduleCreate).mock.calls[0][0]
  expect(sentTask).toMatchObject({
    name: 'Backup',
    kind: 'agent',
    schedule: { kind: 'weekly', days: [0, 1, 2, 3], time: '09:00' },
    grants: [{ capability: 'shell.exec', target: null }],
  })
  expect(useScheduleForm.getState().open).toBeNull()
})

it('a task runs in the project permissions unless it has its own; full access asks first (P-5)', async () => {
  wrap(<ScheduleForm />)
  act(() => useScheduleForm.getState().openNew())
  fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Limpieza' } })
  fireEvent.change(screen.getByLabelText('Qué debe hacer Rinari'), { target: { value: 'Borra temporales' } })
  const select = screen.getByTestId('schedule-permission') as HTMLSelectElement
  expect(select.value).toBe('')
  expect(within(select).getByRole('option', { name: 'Los del proyecto (Proyecto)' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Proyecto'), { target: { value: 'prj_1' } })
  expect(within(select).getByRole('option', { name: 'Los del proyecto (Solo lectura)' })).toBeTruthy()
  fireEvent.change(select, { target: { value: 'full-access' } })
  expect(select.value).toBe('')
  fireEvent.click(await screen.findByRole('button', { name: 'Activar acceso completo' }))
  await waitFor(() => expect(select.value).toBe('full-access'))
  fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }))
  await waitFor(() => expect(engineApi.scheduleCreate).toHaveBeenCalled())
  expect(vi.mocked(engineApi.scheduleCreate).mock.calls[0][0]).toMatchObject({ project_id: 'prj_1', permission_profile: 'full-access' })
})

it('shows the Engine refusal as is', async () => {
  vi.mocked(engineApi.scheduleCreate).mockRejectedValueOnce(new Error('INVALID_PARAMS: Unknown model: x'))
  wrap(<ScheduleForm />)
  act(() => useScheduleForm.getState().openProposal({ ...emptyDraft(), name: 'X', prompt: 'Y', grants: [{ capability: 'shell.exec', target: null }] }))
  // A proposal never arrives with permissions.
  expect(screen.queryByText('shell.exec')).toBeNull()
  expect(screen.getByText('Tarea propuesta por Rinari')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'INVALID_PARAMS: Unknown model: x')
})

it('turns engine events into a proposal card, a needs-you alert and a reminder', async () => {
  const onOpenSession = vi.fn()
  wrap(<ScheduleNotifier onOpenSession={onOpenSession} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  act(() => emit({ type: 'event', event: 'schedule.proposed', payload: { proposal: { ...emptyDraft(), name: 'Resumen', prompt: 'p' }, session_id: 'ses_chat' } }))
  const proposal = toasts.calls.find((call) => call.title === 'Rinari propone una tarea: Resumen')
  act(() => proposal?.options?.action?.onClick())
  expect(useUIStore.getState().view).toBe('schedules')
  expect(useScheduleForm.getState().open).toMatchObject({ proposed: true, draft: { name: 'Resumen' } })

  act(() => emit({ type: 'event', event: 'schedule.run.needs_you', payload: { name: 'Backup', session_id: 'ses_run', reason: 'shell.exec: backup.ps1' } }))
  expect(toasts.calls.at(-1)).toMatchObject({ kind: 'warning', title: '«Backup» te necesita' })
  expect(sent.notifications.at(-1)).toMatchObject({ body: 'shell.exec: backup.ps1', target: { sessionId: 'ses_run' } })

  act(() => emit({ type: 'event', event: 'schedule.run.completed', payload: { name: 'Agua', kind: 'reminder', status: 'completed', summary: 'Tomar agua' } }))
  expect(sent.notifications.at(-1)).toMatchObject({ title: 'Agua', body: 'Tomar agua' })
  const count = sent.notifications.length
  act(() => emit({ type: 'event', event: 'schedule.run.completed', payload: { name: 'Agua', kind: 'reminder', status: 'skipped' } }))
  expect(sent.notifications).toHaveLength(count)
})

it('a task the owner asked for is created at once, with undo, and lands in the bell', async () => {
  wrap(<ScheduleNotifier onOpenSession={() => {}} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  act(() => emit({ type: 'event', event: 'schedule.proposed', payload: {
    created: true, session_id: 'ses_chat', proposal: { ...emptyDraft(), name: 'Sacar la basura', prompt: 'p' },
    task: task({ id: 'sch_9', name: 'Sacar la basura', kind: 'reminder', schedule: { kind: 'once', at: '2026-09-24T22:23' } }),
  } }))
  const created = toasts.calls.find((call) => call.title === 'Tarea programada: Sacar la basura')
  expect(created?.kind).toBe('success')
  expect(useScheduleForm.getState().open).toBeNull()
  await waitFor(() => expect(useNotificationCenter.getState().items[0]).toMatchObject({ module: 'schedules', title: 'Tarea programada: Sacar la basura' }))
  act(() => created?.options?.action?.onClick())
  await waitFor(() => expect(engineApi.scheduleDelete).toHaveBeenCalledWith('sch_9'))
  await waitFor(() => expect(useNotificationCenter.getState().items).toHaveLength(0))
})

it('a rule an agent created is said as created, by whom, with undo, and is one Agency entry in the bell', async () => {
  const { useAgencyStore } = await import('../../stores/agency')
  useAgencyStore.setState({ agentNames: { agent_1: 'Emails' } })
  wrap(<ScheduleNotifier onOpenSession={() => {}} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  const created = { type: 'event', event: 'schedule.proposed', payload: {
    created: true, session_id: 'ses_agent',
    proposal: { ...emptyDraft(), name: 'Correos', prompt: 'p', agent_id: 'agent_1' },
    task: task({ id: 'sch_9', name: 'Correos', agent_id: 'agent_1', project_id: null }),
  } } as const
  act(() => emit(created))
  await waitFor(() => expect(toasts.calls.find((call) => call.title === 'Emails creó la regla «Correos»')).toBeTruthy())
  // Nothing to approve: no proposal card, no «propone».
  expect(useScheduleForm.getState().open).toBeNull()
  expect(toasts.calls.some((call) => call.title.includes('propone'))).toBe(false)
  await waitFor(() => expect(useNotificationCenter.getState().items).toHaveLength(1))
  expect(useNotificationCenter.getState().items[0]).toMatchObject({ id: 'created:sch_9', module: 'agency', target: { kind: 'agency-rules', agentId: 'agent_1' } })
  act(() => toasts.calls.find((call) => call.title === 'Emails creó la regla «Correos»')?.options?.action?.onClick())
  await waitFor(() => expect(engineApi.scheduleDelete).toHaveBeenCalledWith('sch_9'))
  await waitFor(() => expect(useNotificationCenter.getState().items).toHaveLength(0))
  useAgencyStore.setState({ agentNames: {} })
})

it('an agent rule from an Engine that only proposed it leaves no card to approve', async () => {
  wrap(<ScheduleNotifier onOpenSession={() => {}} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  act(() => emit({ type: 'event', event: 'schedule.proposed', payload: {
    session_id: 'ses_agent', proposal: { ...emptyDraft(), name: 'Correos', prompt: 'p', agent_id: 'agent_1' },
  } }))
  expect(toasts.calls).toHaveLength(0)
  expect(useScheduleForm.getState().open).toBeNull()
})

it('each bell entry belongs to the profile of its run, so the bell is per profile', async () => {
  const { resetSessionDirectoryForTests } = await import('../notifications/sessionDirectory')
  resetSessionDirectoryForTests()
  vi.mocked(engineApi.sessionGet).mockResolvedValue({ session: { id: 'ses_work', rinari_profile_id: 'work', state: 'idle' } } as never)
  wrap(<ScheduleNotifier onOpenSession={() => {}} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  act(() => emit({ type: 'event', event: 'schedule.run.completed', payload: { name: 'Backup', kind: 'agent', run_id: 'run_8', status: 'failed', session_id: 'ses_work', reason: 'x' } }))
  await waitFor(() => expect(useNotificationCenter.getState().items[0]).toMatchObject({ id: 'run:run_8', profileId: 'work' }))
  resetSessionDirectoryForTests()
  vi.mocked(engineApi.sessionGet).mockRejectedValue(new Error('unknown'))
})

it('a run that needs you and then finishes is one entry in the bell, updated', async () => {
  wrap(<ScheduleNotifier onOpenSession={() => {}} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  act(() => emit({ type: 'event', event: 'schedule.run.needs_you', payload: { name: 'Backup', run_id: 'run_7', session_id: 'ses_run', reason: 'shell.exec' } }))
  act(() => emit({ type: 'event', event: 'schedule.run.completed', payload: { name: 'Backup', kind: 'agent', run_id: 'run_7', status: 'completed', session_id: 'ses_run', summary: 'Hecho' } }))
  await waitFor(() => expect(useNotificationCenter.getState().items[0]).toMatchObject({ tone: 'success', body: 'Hecho', target: { kind: 'session', sessionId: 'ses_run' } }))
  expect(useNotificationCenter.getState().items).toHaveLength(1)
})

it('a command task runs a command with a cron schedule, and its runs show the output (#50)', async () => {
  expect(describeSchedule({ kind: 'cron', expr: '*/15 9-18 * * 1-5' }, t, 'es')).toBe('cron */15 9-18 * * 1-5')
  expect(draftProblem({ ...emptyDraft(), name: 'x', kind: 'command', command: { command: ' ' } }, t)).toBe('Escribe el comando.')
  expect(draftProblem({ ...emptyDraft(), name: 'x', kind: 'command', command: { command: 'npm test' } }, t)).toBeNull()
  expect(draftProblem({ ...emptyDraft(), name: 'x', kind: 'command', command: { command: 'npm test', on_result: 'agent' } }, t)).toBe('Di qué debe hacer Rinari.')
  expect(draftProblem({ ...emptyDraft(), name: 'x', prompt: 'p', schedule: { kind: 'cron', expr: '* * *' } }, t)).toBe('Una expresión cron tiene cinco campos.')

  wrap(<ScheduleForm />)
  act(() => useScheduleForm.getState().openNew())
  fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Copia' } })
  fireEvent.click(screen.getByRole('radio', { name: /Comando/ }))
  // Sin «pasárselo a Rinari», no se pide qué debe hacer.
  expect(screen.queryByLabelText('Qué debe hacer Rinari')).toBeNull()
  fireEvent.change(screen.getByLabelText('Comando'), { target: { value: 'npm run backup' } })
  fireEvent.change(screen.getByLabelText('Carpeta'), { target: { value: 'C:/proyectos/app' } })
  fireEvent.change(screen.getByLabelText('Cuándo'), { target: { value: 'cron' } })
  fireEvent.change(screen.getByLabelText('Expresión cron'), { target: { value: '0 2 * * *' } })
  fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }))
  await waitFor(() => expect(engineApi.scheduleCreate).toHaveBeenCalled())
  expect(vi.mocked(engineApi.scheduleCreate).mock.calls[0][0]).toMatchObject({
    name: 'Copia',
    kind: 'command',
    prompt: '',
    schedule: { kind: 'cron', expr: '0 2 * * *' },
    command: { command: 'npm run backup', cwd: 'C:/proyectos/app', on_result: 'notify_failure' },
  })
  cleanup()

  const commandTask = task({ kind: 'command', prompt: '', command: { command: 'npm run backup', cwd: null, on_result: 'notify_failure' } })
  vi.mocked(engineApi.scheduleList).mockResolvedValue({ tasks: [commandTask], now: 0 })
  vi.mocked(engineApi.scheduleGet).mockResolvedValue({ task: commandTask, runs: [run({ status: 'failed', reason: 'exit code 3', summary: 'npm ERR! missing script', session_id: null })] })
  wrap(<SchedulesView onOpenSession={() => {}} />)
  expect(await screen.findByText('npm run backup')).toBeTruthy()
  fireEvent.click(await screen.findByText('exit code 3'))
  expect(screen.getByText('npm ERR! missing script')).toBeTruthy()
})

it('a command that went well and only reports failures stays quiet (#50)', async () => {
  wrap(<ScheduleNotifier onOpenSession={() => {}} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  act(() => emit({ type: 'event', event: 'schedule.run.completed', payload: { name: 'Copia', kind: 'command', status: 'completed', quiet: true, run_id: 'r1' } }))
  expect(toasts.calls).toHaveLength(0)
  act(() => emit({ type: 'event', event: 'schedule.run.completed', payload: { name: 'Copia', kind: 'command', status: 'failed', reason: 'exit code 3', run_id: 'r2' } }))
  expect(toasts.calls.at(-1)).toMatchObject({ kind: 'error', title: 'Copia: Falló' })
})

it('a task that runs in its conversation leaves model, permissions and grants to it, and can move to a new one', async () => {
  const here = task({ target: 'this_conversation', session_id: 'ses_chat', grants: [], project_id: null })
  wrap(<ScheduleForm />)
  // Lo que quedó oculto del borrador (de antes de elegir «aquí») no se manda.
  act(() => useScheduleForm.getState().openEdit({ ...here, project_id: 'prj_1', model: 'gpt', permission_profile: 'full-access', skills: ['pdf'] }))
  expect(await screen.findByTestId('schedule-target')).toBeTruthy()
  expect(screen.getByTestId('schedule-target-this_conversation').getAttribute('aria-checked')).toBe('true')
  expect(screen.queryByTestId('schedule-permission')).toBeNull()
  expect(screen.queryByLabelText('Proyecto')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(engineApi.scheduleUpdate).toHaveBeenCalledTimes(1))
  expect(vi.mocked(engineApi.scheduleUpdate).mock.calls[0][1]).toMatchObject({ target: 'this_conversation', session_id: 'ses_chat', grants: [], project_id: null, model: null, permission_profile: null, skills: [] })

  act(() => useScheduleForm.getState().openEdit(here))
  fireEvent.click(await screen.findByTestId('schedule-target-new_session'))
  expect(screen.getByTestId('schedule-permission')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(engineApi.scheduleUpdate).toHaveBeenCalledTimes(2))
  expect(vi.mocked(engineApi.scheduleUpdate).mock.calls[1][1]).toMatchObject({ target: 'new_session' })
})

it('a task without a conversation offers no choice of where it runs', async () => {
  wrap(<ScheduleForm />)
  act(() => useScheduleForm.getState().openNew())
  await screen.findByLabelText('Nombre')
  expect(screen.queryByTestId('schedule-target')).toBeNull()
})

it('the detail of a task that runs in its conversation opens that conversation', async () => {
  const here = task({ target: 'this_conversation', session_id: 'ses_chat', grants: [], project_id: null })
  vi.mocked(engineApi.scheduleList).mockResolvedValue({ tasks: [here], now: 0 })
  vi.mocked(engineApi.scheduleGet).mockResolvedValue({ task: here, runs: [run({ status: 'queued', session_id: 'ses_chat', started_at: null, finished_at: null, summary: null })] })
  const onOpenSession = vi.fn()
  wrap(<SchedulesView onOpenSession={onOpenSession} />)
  const where = await screen.findByTestId('schedule-runs-here')
  expect(where.textContent).toContain('En su conversación')
  fireEvent.click(within(where).getByRole('button', { name: 'Abrir conversación' }))
  expect(onOpenSession).toHaveBeenCalledWith('ses_chat')
  expect(await screen.findByText('En cola')).toBeTruthy()
  expect(runTone('queued')).toBe('live')
})

it('keeps a task quiet as its «Avisos» setting says, and «Silenciar» sets it from the toast', async () => {
  wrap(<ScheduleNotifier onOpenSession={() => {}} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  const before = toasts.calls.length
  const run = (notify: string, status: string, id: string) => act(() => emit({ type: 'event', event: 'schedule.run.completed', payload: { task_id: 'sch_radar', run_id: id, name: 'Radar', kind: 'agent', status, notify, summary: 'ok' } }))
  run('problems', 'completed', 'r1')
  run('none', 'failed', 'r2')
  expect(toasts.calls).toHaveLength(before)
  // Lo que falla de una tarea sin avisos queda en la campana, sin saltar.
  await waitFor(() => expect(useNotificationCenter.getState().items.some((item) => item.id === 'run:r2')))
  expect(useNotificationCenter.getState().items.some((item) => item.id === 'run:r1')).toBe(false)
  run('problems', 'failed', 'r3')
  expect(toasts.calls.at(-1)).toMatchObject({ kind: 'error' })
  run('all', 'completed', 'r4')
  const done = toasts.calls.at(-1) as { kind: string; options?: { cancel?: { label: string; onClick: () => void } } }
  expect(done.kind).toBe('success')
  expect(done.options?.cancel?.label).toBe('Silenciar')
  act(() => done.options?.cancel?.onClick())
  expect(engineApi.scheduleUpdate).toHaveBeenCalledWith('sch_radar', { notify: 'problems' })
})
