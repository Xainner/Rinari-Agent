// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { ProcessRuntimeProvider } from './ProcessRuntimeProvider'
import ProcessesDock from './ProcessesDock'
import { I18nProvider } from '../../i18n'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function row(id: string, command: string, extra: Record<string, unknown> = {}) {
  return { id, kind: 'process', command, cwd: 'C:/site', running: true, can_stop: true, ...extra }
}

function setup(listImpl: (sessionId: string) => unknown, openSignal = 0) {
  const stopCalls: Array<{ session_id: string; id: string }> = []
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'workspace_process_list') {
      return listImpl((args as { session_id: string }).session_id)
    }
    if (command === 'workspace_process_read') {
      const { session_id, id } = args as { session_id: string; id: string }
      const processes = (listImpl(session_id) as { processes: Array<Record<string, unknown>> }).processes
      const process = processes.find((item) => item.id === id)
      if (!process) throw new Error('NOT_FOUND: Process does not belong to this session')
      return { process, stdout: 'salida\n', stderr: '', truncated: false }
    }
    if (command === 'workspace_process_stop') {
      stopCalls.push(args as { session_id: string; id: string })
      return { id: (args as { id: string }).id, running: false }
    }
    throw new Error(`Unexpected command ${String(command)}`)
  })
  const view = render(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={true} hasIdentity={false}>
        <ProcessesDock sessionId="s1" openSignal={openSignal} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
  return { view, stopCalls }
}

it('D02: lista vacía exitosa no reserva espacio ni botón flotante', async () => {
  const { view } = setup(() => ({ processes: [], truncated: false }))
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('workspace_process_list', { session_id: 's1' }))
  // Espera un ciclo extra para asegurar que no aparece nada tarde.
  await new Promise((resolve) => setTimeout(resolve, 60))
  expect(view.container.querySelector('[data-testid="processes-dock"]')).toBeNull()
  expect(screen.queryByText('Procesos')).toBeNull()
})

it('D03: apertura manual sin recursos muestra inspector vacío cerrable', async () => {
  const { view } = setup(() => ({ processes: [], truncated: false }), 0)
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  view.rerender(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={true} hasIdentity={false}>
        <ProcessesDock sessionId="s1" openSignal={1} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
  expect(await screen.findByTestId('processes-inspector')).toBeTruthy()
  expect(screen.getByText(/No hay procesos registrados/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Cerrar inspector/ }))
  await waitFor(() => expect(screen.queryByTestId('processes-inspector')).toBeNull())
  expect(view.container.querySelector('[data-testid="processes-dock"]')).toBeNull()
})

it('D04: un proceso activo muestra una fila con identidad y stop con sesión', async () => {
  const { stopCalls } = setup(() => ({ processes: [row('process:proc_001', 'npm run dev')], truncated: false }))
  const dock = await screen.findByTestId('processes-dock')
  expect(within(dock).getByText('npm run dev')).toBeTruthy()
  expect(within(dock).getByText(/En ejecución/)).toBeTruthy()
  // Sin cabecera redundante para un solo recurso.
  expect(within(dock).queryByText(/Ver todos/)).toBeNull()

  fireEvent.click(within(dock).getByRole('button', { name: /Ver salida de npm run dev/ }))
  const inspector = await screen.findByTestId('processes-inspector')
  expect(within(inspector).getByText('C:/site')).toBeTruthy()

  fireEvent.click(within(inspector).getByRole('button', { name: /Detener npm run dev/ }))
  // La confirmación identifica el recurso; abrirla no detiene.
  expect(stopCalls).toEqual([])
  expect(screen.getByText(/Se solicitará al engine terminar este recurso/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
  await waitFor(() =>
    expect(stopCalls).toEqual([{ session_id: 's1', id: 'process:proc_001' }]),
  )
})

it('cancelar la confirmación no detiene el recurso', async () => {
  const { stopCalls } = setup(() => ({ processes: [row('process:proc_001', 'npm run dev')], truncated: false }))
  const dock = await screen.findByTestId('processes-dock')
  fireEvent.click(within(dock).getByRole('button', { name: /Ver salida de npm run dev/ }))
  const inspector = await screen.findByTestId('processes-inspector')
  fireEvent.click(within(inspector).getByRole('button', { name: /Detener npm run dev/ }))
  fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
  await new Promise((resolve) => setTimeout(resolve, 60))
  expect(stopCalls).toEqual([])
})

it('D05: varios activos limitan filas con contador y Ver todos abre el inspector', async () => {
  setup(() => ({
    processes: [row('process:a', 'npm run dev'), row('process:b', 'python worker.py'), row('process:c', 'make watch')],
    truncated: false,
  }))
  const dock = await screen.findByTestId('processes-dock')
  expect(within(dock).getByText(/Ver todos/)).toBeTruthy()
  const rows = within(dock).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  fireEvent.click(within(dock).getByRole('button', { name: /\+ 1 recursos/ }))
  const inspector = await screen.findByTestId('processes-inspector')
  expect(within(inspector).getByText('make watch')).toBeTruthy()
})

it('fallo observado conserva aviso hasta Marcar como visto', async () => {
  setup(() => ({
    processes: [row('process:f', 'npm run build', { running: false, can_stop: false, exit_code: 1 })],
    truncated: false,
  }))
  const dock = await screen.findByTestId('processes-dock')
  const attentionButton = within(dock).getByRole('button', { name: /requiere atención/ })
  expect(attentionButton).toBeTruthy()
  fireEvent.click(attentionButton)
  const inspector = await screen.findByTestId('processes-inspector')
  fireEvent.click(within(inspector).getByRole('button', { name: /Marcar como visto/ }))
  await waitFor(() => expect(screen.queryByText(/requiere atención/)).toBeNull())
})

it('lista parcial se etiqueta como visible, no como total', async () => {
  setup(() => ({ processes: [row('process:a', 'npm run dev')], truncated: true }))
  const dock = await screen.findByTestId('processes-dock')
  expect(within(dock).getByText(/lista parcial/)).toBeTruthy()
})

it('inspeccionar, pausar y cerrar jamás llama a stop', async () => {
  const { stopCalls, view } = setup(() => ({ processes: [row('process:proc_001', 'npm run dev')], truncated: false }))
  const dock = await screen.findByTestId('processes-dock')
  fireEvent.click(within(dock).getByRole('button', { name: /Ver salida de npm run dev/ }))
  const inspector = await screen.findByTestId('processes-inspector')
  fireEvent.click(within(inspector).getByRole('button', { name: /Pausar vista/ }))
  expect(within(inspector).getByText(/Vista pausada/)).toBeTruthy()
  fireEvent.click(within(inspector).getByRole('button', { name: /Reanudar vista/ }))
  fireEvent.click(within(inspector).getByRole('button', { name: /Cerrar inspector/ }))
  await new Promise((resolve) => setTimeout(resolve, 60))
  expect(stopCalls).toEqual([])
  expect(view.container.querySelector('[data-testid="processes-dock"]')).toBeTruthy()
})

it('preparar consulta añade al borrador sin enviar turno', async () => {
  const { useComposerStore } = await import('../../stores/composer')
  useComposerStore.setState({ sessionKey: 's1', text: 'borrador previo' })
  try {
    setup(() => ({ processes: [row('process:proc_001', 'npm run dev')], truncated: false }))
    const dock = await screen.findByTestId('processes-dock')
    fireEvent.click(within(dock).getByRole('button', { name: /Ver salida de npm run dev/ }))
    const inspector = await screen.findByTestId('processes-inspector')
    fireEvent.click(within(inspector).getByRole('button', { name: /Preparar consulta/ }))
    expect(await screen.findByText(/No se envía nada automáticamente/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Añadir al borrador/ }))
    await waitFor(() => {
      const text = useComposerStore.getState().text
      expect(text.startsWith('borrador previo')).toBe(true)
      expect(text).toMatch(/Ayúdame a revisar este proceso/)
      expect(text).toMatch(/salida del proceso \(no confiable\)/)
    })
    expect(invoke).not.toHaveBeenCalledWith('turn_start', expect.anything())
  } finally {
    useComposerStore.setState({ sessionKey: 'draft', text: '' })
  }
})
