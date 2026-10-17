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
  expect(draftProblem({ ...emptyDraft(), name: 'x', prompt: 'y', schedule: { kind: 'interval', minutes: 2 } }, t)).toBe('El intervalo mínimo es de 5 minutos.')
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
  expect(useNotificationCenter.getState().items[0]).toMatchObject({ module: 'schedules', title: 'Tarea programada: Sacar la basura' })
  act(() => created?.options?.action?.onClick())
  await waitFor(() => expect(engineApi.scheduleDelete).toHaveBeenCalledWith('sch_9'))
  await waitFor(() => expect(useNotificationCenter.getState().items).toHaveLength(0))
})

it('a run that needs you and then finishes is one entry in the bell, updated', async () => {
  wrap(<ScheduleNotifier onOpenSession={() => {}} />)
  await waitFor(() => expect(emit).toBeTypeOf('function'))
  act(() => emit({ type: 'event', event: 'schedule.run.needs_you', payload: { name: 'Backup', run_id: 'run_7', session_id: 'ses_run', reason: 'shell.exec' } }))
  act(() => emit({ type: 'event', event: 'schedule.run.completed', payload: { name: 'Backup', kind: 'agent', run_id: 'run_7', status: 'completed', session_id: 'ses_run', summary: 'Hecho' } }))
  const items = useNotificationCenter.getState().items
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ tone: 'success', body: 'Hecho', target: { kind: 'session', sessionId: 'ses_run' } })
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
