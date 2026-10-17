// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, type ChildSession } from '../../services/engine'
import { desktopApi, type QuestionRequest } from '../../services/desktop'
import { ChildRow, useSessionChildren } from './ChildrenDock'
import { OfferCard, offerOf } from './OfferCard'
import { applyChildEvent, useChildrenStore } from './childrenStore'

vi.mock('../../services/engine', () => ({
  engineApi: {
    sessionChildrenList: vi.fn(),
    sessionChildIntegrate: vi.fn(),
    sessionChildDiscard: vi.fn(),
    sessionChildrenIsolation: vi.fn(),
  },
  commandMessage: (e: unknown) => String(e),
}))
vi.mock('../../services/desktop', () => ({ desktopApi: { answer: vi.fn().mockResolvedValue({}) } }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))
const selectSession = vi.fn()
vi.mock('../engine/EngineContext', () => ({
  useOptionalEngineCommands: () => ({ selectSession }),
  useOptionalEngineData: () => ({ sessionsById: {} }),
}))

const child = (overrides: Partial<ChildSession> = {}): ChildSession => ({
  child_session_id: 'ses_child',
  parent_session_id: 'ses_mother',
  title: 'Migrar pagos',
  origin: 'start',
  context: 'brief',
  isolation: 'worktree',
  worktree_path: 'C:/app/.rinari-worktrees/rinari/child-migrar-pagos',
  branch: 'rinari/child-migrar-pagos',
  state: 'working',
  report: null,
  reported: true,
  resolution: null,
  created_at: '',
  updated_at: '',
  ...overrides,
})

beforeEach(() => {
  useChildrenStore.setState({ byParent: {}, loaded: {}, hidden: {} })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function Rows({ sessionId }: { sessionId: string }) {
  const children = useSessionChildren(sessionId)
  return <>{children.map((item) => <ChildRow key={item.child_session_id} child={item} />)}</>
}
const dock = () => render(<I18nProvider lang="es"><Rows sessionId="ses_mother" /></I18nProvider>)

it('shows a working child, then its report with the owner\'s merge decision', async () => {
  vi.mocked(engineApi.sessionChildrenList).mockResolvedValue({ session_id: 'ses_mother', children: [child()] })
  dock()
  expect(await screen.findByText('Migrar pagos')).toBeTruthy()
  expect(screen.getByText('Trabajando')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Integrar rama/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Abrir/ }))
  expect(selectSession).toHaveBeenCalledWith('ses_child')

  applyChildEvent('session.child.updated', {
    session_id: 'ses_mother',
    child: child({ state: 'completed', report: { summary: 'Migré 3 módulos y pasan las pruebas.', files: ['a.py', 'b.py'] } }),
  })
  expect(await screen.findByText('Migré 3 módulos y pasan las pruebas.')).toBeTruthy()
  expect(screen.getByText(/2 archivos/)).toBeTruthy()
  vi.mocked(engineApi.sessionChildIntegrate).mockResolvedValue({ child_session_id: 'ses_child', integrated: false, conflicts: ['pagos.py'] })
  fireEvent.click(screen.getByRole('button', { name: /Integrar rama/ }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByText('pagos.py')).toBeTruthy()
  vi.mocked(engineApi.sessionChildIntegrate).mockResolvedValue({ child_session_id: 'ses_child', integrated: true, conflicts: [] })
  fireEvent.click(screen.getByRole('button', { name: /Integrar rama/ }))
  await waitFor(() => expect(screen.getByText(/Rama integrada/)).toBeTruthy())
  expect(screen.queryByRole('button', { name: /Integrar rama/ })).toBeNull()
})

it('a finished child reads like a session: no check, no «Misma carpeta»', async () => {
  vi.mocked(engineApi.sessionChildrenList).mockResolvedValue({ session_id: 'ses_mother', children: [] })
  const { container } = dock()
  await waitFor(() => expect(engineApi.sessionChildrenList).toHaveBeenCalled())
  expect(container.querySelector('[data-testid="child-card"]')).toBeNull()
  applyChildEvent('session.child.updated', { child: child({ branch: null, isolation: 'same', state: 'completed', report: { summary: 'Listo.', text: 'Listo. ' + 'detalle '.repeat(40) } }) })
  expect(await screen.findByText('Listo.')).toBeTruthy()
  expect(screen.queryByText('Misma carpeta')).toBeNull()
  expect(container.querySelector('.r-check')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Leer todo|Ver todo|Leer/ }))
  expect(screen.getByText(/detalle detalle/)).toBeTruthy()
})

it('an offer waits for «Nueva sesión» or «Hazlo aquí»', async () => {
  const request = {
    request_id: 'q1', session_id: 'ses_mother', turn_id: 't1', status: 'pending',
    questions: [{ id: 'offer', title: 'Migrar pagos', options: [{ label: 'new_session' }, { label: 'here' }] }],
    offer: { title: 'Migrar pagos', prompt: 'Migra el módulo de pagos a la API nueva.', reason: 'Es grande y va aparte.', context: 'brief', isolation: 'auto' },
  } as unknown as QuestionRequest
  const offer = offerOf(request)
  expect(offer?.title).toBe('Migrar pagos')
  expect(offerOf({ ...request, offer: undefined } as unknown as QuestionRequest)).toBeNull()
  const onResolved = vi.fn()
  render(<I18nProvider lang="es"><OfferCard request={request} offer={offer!} onResolved={onResolved} /></I18nProvider>)
  expect(screen.getByText('¿Lo hago en una sesión nueva?')).toBeTruthy()
  expect(screen.getByText('Es grande y va aparte.')).toBeTruthy()
  expect(screen.getByText('Solo el encargo')).toBeTruthy()
  expect(screen.getByText('Rama propia si es un repo')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Nueva sesión' }))
  await waitFor(() => expect(desktopApi.answer).toHaveBeenCalledWith(request, { offer: 'new_session' }, false))
  expect(onResolved).toHaveBeenCalled()
})

it('a note lets the owner change how its child opens before starting it', async () => {
  const { StickyNote } = await import('../followups/StickyNote')
  const { useFollowupStore } = await import('../followups/followupStore')
  const accept = vi.fn().mockResolvedValue({ suggestion: {}, session: { title: 'Pruebas' }, turn: null, already_accepted: false })
  Object.assign(engineApi, { followupAccept: accept, followupList: vi.fn().mockResolvedValue({ suggestions: [] }), followupDismiss: vi.fn() })
  useFollowupStore.setState({
    bySession: { ses_mother: [{ id: 'n1', session_id: 'ses_mother', title: 'Pruebas', prompt: 'Añade las pruebas que faltan.', rationale: '', status: 'pending', kind: 'plan_step', context: 'brief', isolation: 'auto' } as never] },
    loaded: { ses_mother: true },
    live: {},
  })
  render(<I18nProvider lang="es"><StickyNote sessionId="ses_mother" /></I18nProvider>)
  expect(screen.getByText('Paso del plan')).toBeTruthy()
  fireEvent.click(screen.getByTestId('note-context'))
  fireEvent.click(screen.getByTestId('note-isolation'))
  expect(screen.getByTestId('note-context').textContent).toBe('Con esta conversación')
  expect(screen.getByTestId('note-isolation').textContent).toBe('Misma carpeta')
  fireEvent.click(screen.getByRole('button', { name: /Hacer en otra conversación/ }))
  await waitFor(() => expect(accept).toHaveBeenCalledWith('n1', { context: 'fork', isolation: 'same' }))
})

it('the chat shows a brief, a message from the mother and a report as folded lines', async () => {
  const { default: MessageBubble } = await import('../../components/MessageBubble')
  const brief = render(
    <I18nProvider lang="es">
      <MessageBubble message={{ id: 'm1', role: 'user', createdAt: 0, content: 'Migra el módulo de pagos.', origin: { kind: 'user', source: 'child_brief', parent_session_id: 'ses_mother' } as never }} />
    </I18nProvider>,
  )
  expect(screen.getByTestId('child-brief').textContent).toContain('Encargo recibido de')
  expect(screen.queryByText('Migra el módulo de pagos.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Desplegar' }))
  expect(screen.getByText('Migra el módulo de pagos.')).toBeTruthy()
  expect(screen.queryByTestId('user-message-bubble')).toBeNull()
  brief.unmount()
  const mother = render(
    <I18nProvider lang="es">
      <MessageBubble message={{ id: 'm2', role: 'user', createdAt: 0, content: 'Usa la versión 2.', origin: { kind: 'user', source: 'parent_message', parent_session_id: 'ses_mother' } as never }} />
    </I18nProvider>,
  )
  expect(screen.getByTestId('mother-message').textContent).toContain('Mensaje recibido de')
  expect(screen.queryByTestId('user-message-bubble')).toBeNull()
  mother.unmount()
  useChildrenStore.setState({ byParent: { ses_mother: [child({ state: 'completed', report: { summary: 'Migré 3 módulos.', text: 'Migré 3 módulos y pasan las pruebas.' } })] }, loaded: {}, hidden: {} })
  render(
    <I18nProvider lang="es">
      <MessageBubble message={{ id: 'm3', role: 'user', createdAt: 0, content: '«Migrar pagos»', origin: { kind: 'automation', source: 'child_report', children: ['ses_child'] } as never }} />
    </I18nProvider>,
  )
  const report = screen.getByTestId('child-report-separator')
  expect(report.textContent).toContain('Informe recibido de')
  expect(report.textContent).toContain('Migrar pagos')
  fireEvent.click(screen.getByRole('button', { name: 'Desplegar' }))
  expect(screen.getByText('Migré 3 módulos y pasan las pruebas.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Migrar pagos' }))
  expect(selectSession).toHaveBeenCalledWith('ses_child')
})

it('a report keeps what that child said then, and one read mid-turn shows as the same line (#100)', async () => {
  const { SteerBubble } = await import('../activity/SteerBubble')
  const { default: MessageBubble } = await import('../../components/MessageBubble')
  useChildrenStore.setState({ byParent: { ses_mother: [child({ state: 'completed', report: { summary: 'Informe nuevo.', text: 'Informe nuevo.' } })] }, loaded: {}, hidden: {} })
  const old = render(
    <I18nProvider lang="es">
      <MessageBubble message={{ id: 'm4', role: 'user', createdAt: 0, content: '«Migrar pagos»', origin: { kind: 'automation', source: 'child_report', children: ['ses_child'], reports: { ses_child: 'Informe viejo.' } } as never }} />
    </I18nProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Desplegar' }))
  expect(screen.getByText('Informe viejo.')).toBeTruthy()
  expect(screen.queryByText('Informe nuevo.')).toBeNull()
  old.unmount()
  render(
    <I18nProvider lang="es">
      <SteerBubble item={{ id: 'steer:s1', type: 'steer', activitySeq: 1, occurredAt: 0, steerId: 's1', content: '«Migrar pagos»', status: 'applied', source: 'child_report', children: ['ses_child'], reports: { ses_child: 'Lo leí a mitad de turno.' } }} sessionId="ses_mother" />
    </I18nProvider>,
  )
  expect(screen.getByTestId('child-report-separator').textContent).toContain('Informe recibido de')
  expect(screen.queryByTestId('steer-message')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Desplegar' }))
  expect(screen.getByText('Lo leí a mitad de turno.')).toBeTruthy()
})
