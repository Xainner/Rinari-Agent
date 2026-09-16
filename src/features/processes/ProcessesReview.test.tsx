// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ProcessRuntimeProvider } from './ProcessRuntimeProvider'
import ProcessesDock, { RECENT_SUCCESS_MS } from './ProcessesDock'
import { useComposerStore } from '../../stores/composer'
import { useUIStore } from '../../stores/ui'
import { I18nProvider } from '../../i18n'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }))
vi.mock('../../lib/clipboard', () => ({ copyText: vi.fn(async () => true) }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  useComposerStore.setState({ sessionKey: 'draft', text: '' })
  useUIStore.setState({ processesInspectorFor: null })
})

function activeRow(id: string, command: string, extra: Record<string, unknown> = {}) {
  return { id, kind: 'process', command, cwd: 'C:/site', running: true, can_stop: true, ...extra }
}

function renderDock(opts: { engineReady?: boolean; epoch?: number; openSignal?: number } = {}) {
  return render(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider
        epoch={opts.epoch ?? 1}
        engineReady={opts.engineReady ?? true}
        hasCapability={true}
        hasIdentity={false}
      >
        <ProcessesDock sessionId="s1" openSignal={opts.openSignal ?? 0} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
}

function mockClock(start: number) {
  let now = start
  const spy = vi.spyOn(Date, 'now').mockImplementation(() => now)
  return {
    advance: (ms: number) => {
      now += ms
    },
    restore: () => spy.mockRestore(),
  }
}

async function expandDock() {
  const dock = await screen.findByTestId('processes-dock')
  const expand = within(dock).queryByRole('button', { name: /Procesos de esta conversación/ })
  if (expand) fireEvent.click(expand)
  return screen.findByTestId('processes-dock')
}

async function openInspectorOnFirstRow() {
  const dock = await screen.findByTestId('processes-dock')
  const expand = within(dock).queryByRole('button', { name: /Procesos de esta conversación/ })
  if (expand) fireEvent.click(expand)
  const toggle = within(await screen.findByTestId('processes-dock')).getByRole('button', { name: /Ver salida/ })
  fireEvent.click(toggle)
  return screen.findByTestId('processes-inspector')
}

it('X-1: stop se recupera tras observación obsoleta en vez de bloquearse', async () => {
  const clock = mockClock(1_700_000_000_000)
  const stopCalls: unknown[] = []
  try {
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === 'workspace_process_list') {
        return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
      }
      if (command === 'workspace_process_read') {
        const id = (args as { id: string }).id
        return { process: activeRow(id, 'npm run dev'), stdout: '', stderr: '', truncated: false }
      }
      if (command === 'workspace_process_stop') {
        stopCalls.push(args)
        return { id: 'process:proc_001', running: false }
      }
      throw new Error(`Unexpected ${String(command)}`)
    })
    renderDock()
    const inspector = await openInspectorOnFirstRow()
    fireEvent.click(within(inspector).getByRole('button', { name: /Detener npm run dev/ }))
    // Pasan 20 s sin cambios: la confirmación detecta observación vieja.
    clock.advance(20_000)
    fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
    expect(await screen.findByText(/obsoleto/)).toBeTruthy()
    expect(stopCalls).toEqual([])
    // Un poll posterior refresca el mapa; el siguiente intento sí envía stop.
    await new Promise((resolve) => setTimeout(resolve, 1700))
    fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
    await waitFor(() => expect(stopCalls).toHaveLength(1), { timeout: 3000 })
  } finally {
    clock.restore()
  }
}, 15000)

it('X-5: sin conexión muestra Estado sin verificar en vez de En ejecución', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    if (command === 'workspace_process_read') {
      return { process: activeRow('process:proc_001', 'npm run dev'), stdout: '', stderr: '', truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  const view = renderDock({ engineReady: true })
  await screen.findByTestId('processes-dock')
  await openInspectorOnFirstRow()
  view.rerender(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={1} engineReady={false} hasCapability={true} hasIdentity={false}>
        <ProcessesDock sessionId="s1" openSignal={0} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
  expect(await screen.findAllByText(/Estado sin verificar/)).not.toHaveLength(0)
})

it('X-5 + X-4: detención confirmada sin botón Detener y con expiración', async () => {
  const clock = mockClock(1_700_000_000_000)
  try {
    let dropped = false
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'workspace_process_list') {
        if (dropped) return { processes: [], truncated: false }
        return {
          processes: [
            {
              id: 'preview:p1',
              kind: 'preview',
              command: 'Vista previa HTML',
              cwd: 'C:/site',
              running: true,
              can_stop: true,
              url: 'http://127.0.0.1:8080/',
            },
          ],
          truncated: false,
        }
      }
      if (command === 'workspace_process_read') {
        if (dropped) throw new Error('NOT_FOUND: Process does not belong to this session')
        const row = {
          id: 'preview:p1',
          kind: 'preview',
          command: 'Vista previa HTML',
          cwd: 'C:/site',
          running: true,
          can_stop: true,
          url: 'http://127.0.0.1:8080/',
        }
        return { process: row, stdout: '', stderr: '', truncated: false }
      }
      if (command === 'workspace_process_stop') {
        dropped = true
        return { id: 'preview:p1', running: false }
      }
      throw new Error(`Unexpected ${String(command)}`)
    })
    renderDock()
    const inspector = await openInspectorOnFirstRow()
    fireEvent.click(within(inspector).getByRole('button', { name: /Detener Vista previa HTML/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
    await waitFor(() => expect(screen.queryByText(/¿Detener/)).toBeNull())
    // Sin botón Detener en la fila confirmada y etiqueta de confirmación.
    expect(await screen.findAllByText(/Detención confirmada/)).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Detener Vista previa HTML/ })).toBeNull()
    // Expira en el siguiente ciclo de poll aunque el engine nunca la re-liste.
    clock.advance(61_000)
    await waitFor(() => expect(screen.queryAllByText(/Detención confirmada/)).toHaveLength(0), { timeout: 8000 })
  } finally {
    clock.restore()
  }
}, 15000)

it('X-2: un cambio solo de readiness actualiza la fila', async () => {
  let readiness = 'unknown'
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev', { readiness })], truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  await screen.findByTestId('processes-dock')
  fireEvent.click(screen.getByRole('button', { name: /Procesos de esta conversación/ }))
  expect(screen.queryByText(/Aceptando conexiones/)).toBeNull()
  readiness = 'listening'
  await waitFor(() => expect(screen.getByText(/Aceptando conexiones/)).toBeTruthy(), { timeout: 5000 })
}, 10000)

it('T-2: STALE_RESOURCE no es "sigue activo"; el error genérico es incierto', async () => {
  let mode: 'stale' | 'generic' = 'stale'
  let stops = 0
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    if (command === 'workspace_process_read') {
      return { process: activeRow('process:proc_001', 'npm run dev'), stdout: '', stderr: '', truncated: false }
    }
    if (command === 'workspace_process_stop') {
      stops += 1
      throw new Error(mode === 'stale' ? 'STALE_RESOURCE: generation mismatch' : 'timeout')
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const inspector = await openInspectorOnFirstRow()
  fireEvent.click(within(inspector).getByRole('button', { name: /Detener npm run dev/ }))
  const listsBeforeStop = vi.mocked(invoke).mock.calls.filter(
    ([command]) => command === 'workspace_process_list',
  ).length
  fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))

  // Mensaje propio de identidad obsoleta, en el diálogo y en el detalle.
  await waitFor(() =>
    expect(screen.getAllByText(/El recurso cambi. desde que fue observado/).length).toBeGreaterThan(0),
  )
  // No se afirma que el proceso siga activo: es otra cosa, y el error crudo
  // del engine nunca se le muestra al usuario.
  expect(screen.queryByText(/El proceso sigue activo/)).toBeNull()
  expect(screen.queryByText(/STALE_RESOURCE/)).toBeNull()
  // Se reconcilia con una observación nueva y no se reintenta solo.
  await waitFor(() =>
    expect(
      vi.mocked(invoke).mock.calls.filter(([command]) => command === 'workspace_process_list').length,
    ).toBeGreaterThan(listsBeforeStop),
  )
  expect(stops).toBe(1)

  mode = 'generic'
  fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
  // El aviso aparece en el diálogo y en el detalle (mismo stopState).
  await waitFor(() => expect(screen.getAllByText(/No se pudo confirmar/)).toHaveLength(2))
  expect(screen.queryByText(/timeout/)).toBeNull()
  expect(stops).toBe(2)
})

it('T-2b: el engine que reporta el recurso vivo sí dice "sigue activo"', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    if (command === 'workspace_process_read') {
      return { process: activeRow('process:proc_001', 'npm run dev'), stdout: '', stderr: '', truncated: false }
    }
    if (command === 'workspace_process_stop') return { id: 'process:proc_001', running: true }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const inspector = await openInspectorOnFirstRow()
  fireEvent.click(within(inspector).getByRole('button', { name: /Detener npm run dev/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
  await waitFor(() => expect(screen.getAllByText(/El proceso sigue activo/).length).toBeGreaterThan(0))
  expect(screen.queryByText(/El recurso cambi. desde que fue observado/)).toBeNull()
})

it('T-3: un cambio de época cierra el diálogo pendiente', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    if (command === 'workspace_process_read') {
      return { process: activeRow('process:proc_001', 'npm run dev'), stdout: '', stderr: '', truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  const view = renderDock({ epoch: 1 })
  const inspector = await openInspectorOnFirstRow()
  fireEvent.click(within(inspector).getByRole('button', { name: /Detener npm run dev/ }))
  expect(await screen.findByText(/¿Detener/)).toBeTruthy()
  view.rerender(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={2} engineReady={true} hasCapability={true} hasIdentity={false}>
        <ProcessesDock sessionId="s1" openSignal={0} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
  await waitFor(() => expect(screen.queryByText(/¿Detener/)).toBeNull())
})

it('T-5: fallo de listado visible con Reintentar y recuperación', async () => {
  let fail = true
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      if (fail) throw new Error('timeout')
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  const view = renderDock({ openSignal: 0 })
  await waitFor(() =>
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('workspace_process_list', { session_id: 's1' }),
  )
  view.rerender(
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={true} hasIdentity={false}>
        <ProcessesDock sessionId="s1" openSignal={1} />
      </ProcessRuntimeProvider>
    </I18nProvider>,
  )
  expect(await screen.findAllByText('timeout')).not.toHaveLength(0)
  fail = false
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
  await screen.findByTestId('processes-dock')
  // Fila en el inspector (la franja sigue minimizada); el error desaparece.
  await waitFor(() => expect(screen.getAllByText('npm run dev')).toHaveLength(1))
  await waitFor(() => expect(screen.queryAllByText('timeout')).toHaveLength(0))
})

it('T-7: pausar congela lecturas; reanudar lee de inmediato', async () => {
  let reads = 0
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    if (command === 'workspace_process_read') {
      reads += 1
      const id = (args as { id: string }).id
      return { process: activeRow(id, 'npm run dev'), stdout: 'x', stderr: '', truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const inspector = await openInspectorOnFirstRow()
  await waitFor(() => expect(reads).toBeGreaterThanOrEqual(1))
  fireEvent.click(within(inspector).getByRole('button', { name: /Pausar vista/ }))
  const frozen = reads
  await new Promise((resolve) => setTimeout(resolve, 1700))
  expect(reads).toBe(frozen)
  fireEvent.click(within(inspector).getByRole('button', { name: /Reanudar vista/ }))
  await waitFor(() => expect(reads).toBeGreaterThan(frozen), { timeout: 3000 })
}, 15000)

it('T-8: éxito reciente expira y ocultar de la franja funciona', async () => {
  const clock = mockClock(1_700_000_000_000)
  try {
    let code: number | null = null
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'workspace_process_list') {
        return {
          processes: [activeRow('process:proc_001', 'npm run dev', { running: code === null, can_stop: code === null, exit_code: code })],
          truncated: false,
        }
      }
      throw new Error(`Unexpected ${String(command)}`)
    })
    renderDock()
    await screen.findByTestId('processes-dock')
    // Termina con éxito en vivo: visible como reciente…
    code = 0
    fireEvent.click(screen.getByRole('button', { name: /Procesos de esta conversación/ }))
    await waitFor(() => expect(screen.getByText(/Finalizado/)).toBeTruthy(), { timeout: 5000 })
    // …y se retira tras 5 s visibles.
    clock.advance(12_000)
    await waitFor(() => expect(screen.queryByTestId('processes-dock')).toBeNull(), { timeout: 4000 })
  } finally {
    clock.restore()
  }
}, 15000)

it('T-9: lista parcial no declara desaparecido al seleccionado', async () => {
  const a = activeRow('process:a', 'npm run dev')
  const b = activeRow('process:b', 'python worker.py')
  let partial = false
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'workspace_process_list') {
      if (!partial) return { processes: [a, b], truncated: false }
      return { processes: [a], truncated: true }
    }
    if (command === 'workspace_process_read') {
      const id = (args as { session_id: string; id: string }).id
      const found = [a, b].find((item) => item.id === id) ?? a
      return { process: found, stdout: 'salida-b', stderr: '', truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const dock = await screen.findByTestId('processes-dock')
  // Seleccionar b y abrir inspector antes del truncamiento.
  fireEvent.click(within(dock).getByRole('button', { name: /Procesos de esta conversación/ }))
  const toggles = within(await screen.findByTestId('processes-dock')).getAllByRole('button', { name: /Ver salida/ })
  fireEvent.click(toggles[1]!)
  const inspector = await screen.findByTestId('processes-inspector')
  expect(within(inspector).getByText('salida-b')).toBeTruthy()
  partial = true
  // Tras el listado parcial, b sigue inspeccionable por lectura
  // individual, sin mensaje de no disponibilidad.
  await new Promise((resolve) => setTimeout(resolve, 1700))
  expect(within(inspector).queryByText(/Ya no está disponible/)).toBeNull()
  expect(within(inspector).getByText('salida-b')).toBeTruthy()
}, 15000)

it('T-10: kind desconocido se representa sin romper', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return {
        processes: [
          { id: 'x:1', kind: 'futura', command: '', cwd: 'C:/s', running: false, can_stop: false, exit_code: 1 },
        ],
        truncated: false,
      }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const dock = await screen.findByTestId('processes-dock')
  const attentionButton = within(dock).getByRole('button', { name: /requiere atención/ })
  expect(attentionButton).toBeTruthy()
  fireEvent.click(attentionButton)
  const inspector = await screen.findByTestId('processes-inspector')
  // Nombre, título de detalle y etiqueta de tipo usan el fallback.
  expect(within(inspector).getAllByText('Recurso')).toHaveLength(3)
})

it('T-11: consulta con sesión cambiada no inserta en otro chat', async () => {
  useComposerStore.setState({ sessionKey: 's2', text: 'borrador ajeno' })
  try {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'workspace_process_list') {
        return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
      }
      if (command === 'workspace_process_read') {
        return { process: activeRow('process:proc_001', 'npm run dev'), stdout: 'salida', stderr: '', truncated: false }
      }
      throw new Error(`Unexpected ${String(command)}`)
    })
    renderDock()
    const inspector = await openInspectorOnFirstRow()
    fireEvent.click(within(inspector).getByRole('button', { name: /Preparar consulta/ }))
    expect(await screen.findByText(/No se envía nada automáticamente/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Añadir al borrador/ }))
    expect(await screen.findByText(/Cambiaste de conversación/)).toBeTruthy()
    expect(useComposerStore.getState().text).toBe('borrador ajeno')
  } finally {
    useComposerStore.setState({ sessionKey: 'draft', text: '' })
  }
})

it('T-13: URLs no http(s) o con credenciales no ofrecen Abrir', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return {
        processes: [
          activeRow('process:ok', 'srv', { url: 'https://127.0.0.1:8080/' }),
          activeRow('process:evil', 'srv', { url: 'javascript:alert(1)' }),
          activeRow('process:creds', 'srv', { url: 'https://user:pass@host/' }),
        ],
        truncated: false,
      }
    }
    if (command === 'workspace_process_read') {
      const id = 'process:ok'
      return { process: activeRow(id, 'srv', { url: 'https://127.0.0.1:8080/' }), stdout: '', stderr: '', truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const dock = await screen.findByTestId('processes-dock')
  fireEvent.click(within(dock).getByRole('button', { name: /Procesos de esta conversación/ }))
  const openButtons = within(await screen.findByTestId('processes-dock')).queryAllByRole('button', { name: /Abrir/ })
  // Solo la fila válida expone Abrir (más el inspector si se abre).
  expect(openButtons).toHaveLength(1)
  fireEvent.click(openButtons[0]!)
  await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://127.0.0.1:8080/'))
  expect(screen.queryByRole('alert')).toBeNull()
  // Un fallo de apertura sí se reporta de forma localizada.
  vi.mocked(openUrl).mockRejectedValueOnce(new Error('nope'))
  fireEvent.click(openButtons[0]!)
  expect(await screen.findByText('nope')).toBeTruthy()
})

it('E-2: fallo de copia en detalle avisa en vez de callar', async () => {  const { copyText } = await import('../../lib/clipboard')
  vi.mocked(copyText).mockResolvedValueOnce(false)
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    if (command === 'workspace_process_read') {
      return { process: activeRow('process:proc_001', 'npm run dev'), stdout: '', stderr: '', truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const inspector = await openInspectorOnFirstRow()
  fireEvent.click(within(inspector).getByRole('button', { name: /Copiar comando/ }))
  expect(await screen.findByText(/No se pudo copiar/)).toBeTruthy()
})

it('V2E-1: una fila corrupta no oculta las válidas y se avisa', async () => {  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return {
        processes: [
          activeRow('process:ok', 'npm run dev'),
          { id: '', kind: 'process', command: 'x', cwd: 'C:/s', running: true, can_stop: true },
        ],
        truncated: false,
      }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const dock = await screen.findByTestId('processes-dock')
  fireEvent.click(within(dock).getByRole('button', { name: /Procesos de esta conversación/ }))
  expect(within(dock).getByText('npm run dev')).toBeTruthy()
  expect(within(dock).getByText(/omitidos por formato inválido/)).toBeTruthy()
})

it('sonda: el cierre del inspector anima la salida (no desaparece en seco)', async () => {  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    if (command === 'workspace_process_read') {
      return { process: activeRow('process:proc_001', 'npm run dev'), stdout: '', stderr: '', truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const inspector = await openInspectorOnFirstRow()
  fireEvent.click(within(inspector).getByRole('button', { name: /Cerrar inspector/ }))
  // Si la salida anima, el inspector sigue montado un instante tras cerrar.
  expect(screen.queryByTestId('processes-inspector')).not.toBeNull()
  await waitFor(() => expect(screen.queryByTestId('processes-inspector')).toBeNull(), { timeout: 3000 })
})

it('auto-cierra el inspector 5s después de quedarse sin activos', async () => {
  let finished = false
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      if (!finished) return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
      return {
        processes: [activeRow('process:proc_001', 'npm run dev', { running: false, can_stop: false, exit_code: 0 })],
        truncated: false,
      }
    }
    if (command === 'workspace_process_stop') return { id: 'process:proc_001', running: false }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  await openInspectorOnFirstRow()
  expect(await screen.findByTestId('processes-inspector')).toBeTruthy()
  finished = true
  // Termina, pasan 5 s sin interacción ni fallos: se cierra del todo.
  await waitFor(() => expect(screen.queryByTestId('processes-inspector')).toBeNull(), { timeout: 15000 })
  // La franja reciente comparte la ventana de 5 s y también se retira.
  await waitFor(() => expect(screen.queryByTestId('processes-dock')).toBeNull(), { timeout: 15000 })
}, 25000)

it('detener el único proceso no genera atención y auto-cierra', async () => {
  let stopped = false
  const stopCalls: unknown[] = []
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'workspace_process_list') {
      if (!stopped) return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
      return {
        processes: [
          activeRow('process:proc_001', 'npm run dev', {
            running: false,
            can_stop: false,
            exit_code: 137,
            exit_reason: 'stopped',
            ended_at: 1_700_000_060,
          }),
        ],
        truncated: false,
      }
    }
    if (command === 'workspace_process_read') {
      const id = (args as { session_id: string; id: string }).id
      const running = !stopped
      return {
        process: activeRow(id, 'npm run dev', running ? {} : { running: false, can_stop: false, exit_code: 137, exit_reason: 'stopped' }),
        stdout: '',
        stderr: '',
        truncated: false,
      }
    }
    if (command === 'workspace_process_stop') {
      stopped = true
      stopCalls.push(args)
      return { id: 'process:proc_001', running: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const inspector = await openInspectorOnFirstRow()
  fireEvent.click(within(inspector).getByRole('button', { name: /Detener npm run dev/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
  await waitFor(() => expect(stopCalls).toHaveLength(1), { timeout: 3000 })
  // Sin aviso de atención por una detención pedida…
  await waitFor(
    () => {
      expect(screen.queryByText(/requiere atención/)).toBeNull()
      expect(screen.queryAllByText(/Detención confirmada/).length).toBeGreaterThanOrEqual(1)
    },
    { timeout: 5000 },
  )
  // …y la vista se cierra sola a los 5 s.
  await waitFor(() => expect(screen.queryByTestId('processes-inspector')).toBeNull(), { timeout: 15000 })
}, 25000)


// -- regresiones de esta integración ---------------------------------------

it('R-1: el tiempo oculto no alarga la ventana de un recurso terminado después', async () => {
  const clock = mockClock(1_700_000_000_000)
  try {
    let running = true
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'workspace_process_list') {
        return {
          processes: [
            { ...activeRow('process:proc_001', 'npm run build'), running, can_stop: running, exit_code: running ? null : 0 },
          ],
          truncated: false,
        }
      }
      if (command === 'workspace_process_read') {
        return { process: activeRow('process:proc_001', 'npm run build'), stdout: '', stderr: '', truncated: false }
      }
      throw new Error(`Unexpected ${String(command)}`)
    })
    renderDock()
    await expandDock()
    await screen.findByText(/npm run build/)

    // La ventana se oculta un buen rato ANTES de que el proceso termine: ese
    // tiempo no pertenece a este recurso y no debe alargar su permanencia.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    clock.advance(600_000)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))

    running = false
    await waitFor(() => expect(screen.queryByText(/En ejecución/)).toBeNull(), { timeout: 5000 })

    // Pasada la ventana de éxito reciente, la fila se retira: antes se quedaba
    // los 10 minutos ocultos más los 5 s.
    clock.advance(RECENT_SUCCESS_MS + 1_000)
    await waitFor(() => expect(screen.queryByText(/npm run build/)).toBeNull(), { timeout: 5000 })
  } finally {
    clock.restore()
  }
})

it('R-2: el mismo dock apuntado a otra sesión no mezcla snapshots', async () => {
  // ChatView remonta el dock con key por sesión, pero el aislamiento no puede
  // depender de eso: aun sin remontar, un cambio de sessionId sólo muestra
  // los recursos de la sesión nueva, con el mismo ID opaco reutilizado.
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    const sessionId = (args as { session_id?: string } | undefined)?.session_id
    const label = sessionId === 's1' ? 'npm run dev' : 'cargo watch'
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', label)], truncated: false }
    }
    if (command === 'workspace_process_read') {
      return { process: activeRow('process:proc_001', label), stdout: '', stderr: '', truncated: false }
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  const tree = (sessionId: string) => (
    <I18nProvider lang="es">
      <ProcessRuntimeProvider epoch={1} engineReady={true} hasCapability={true} hasIdentity={false}>
        <ProcessesDock sessionId={sessionId} openSignal={0} />
      </ProcessRuntimeProvider>
    </I18nProvider>
  )
  const view = render(tree('s1'))
  await expandDock()
  await screen.findByText(/npm run dev/)

  view.rerender(tree('s2'))
  await screen.findByText(/cargo watch/)
  expect(screen.queryByText(/npm run dev/)).toBeNull()
})
