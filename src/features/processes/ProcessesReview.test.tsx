// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ProcessRuntimeProvider } from './ProcessRuntimeProvider'
import ProcessesDock from './ProcessesDock'
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

async function openInspectorOnFirstRow() {
  const dock = await screen.findByTestId('processes-dock')
  const toggle = within(dock).getByRole('button', { name: /Ver salida/ })
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
  const dock = await screen.findByTestId('processes-dock')
  fireEvent.click(within(dock).getByRole('button', { name: /Ver salida/ }))
  await screen.findByTestId('processes-inspector')
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
  expect(screen.queryByText(/Aceptando conexiones/)).toBeNull()
  readiness = 'listening'
  await waitFor(() => expect(screen.getByText(/Aceptando conexiones/)).toBeTruthy(), { timeout: 5000 })
}, 10000)

it('T-2: stop con STALE_RESOURCE falla con mensaje; error genérico es incierto', async () => {
  let mode: 'stale' | 'generic' = 'stale'
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'workspace_process_list') {
      return { processes: [activeRow('process:proc_001', 'npm run dev')], truncated: false }
    }
    if (command === 'workspace_process_read') {
      return { process: activeRow('process:proc_001', 'npm run dev'), stdout: '', stderr: '', truncated: false }
    }
    if (command === 'workspace_process_stop') {
      throw new Error(mode === 'stale' ? 'STALE_RESOURCE: generation mismatch' : 'timeout')
    }
    throw new Error(`Unexpected ${String(command)}`)
  })
  renderDock()
  const inspector = await openInspectorOnFirstRow()
  fireEvent.click(within(inspector).getByRole('button', { name: /Detener npm run dev/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
  expect(await screen.findByText(/STALE_RESOURCE/)).toBeTruthy()
  mode = 'generic'
  fireEvent.click(screen.getByRole('button', { name: /^Detener$/ }))
  // El aviso aparece en el diálogo y en el detalle (mismo stopState).
  await waitFor(() => expect(screen.getAllByText(/No se pudo confirmar/)).toHaveLength(2))
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
  expect(await screen.findByText('timeout')).toBeTruthy()
  fail = false
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
  await screen.findByTestId('processes-dock')
  // Fila en franja e inspector; el error desaparece.
  await waitFor(() => expect(screen.getAllByText('npm run dev')).toHaveLength(2))
  await waitFor(() => expect(screen.queryByText('timeout')).toBeNull())
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
    await waitFor(() => expect(screen.getByText(/Finalizado/)).toBeTruthy(), { timeout: 5000 })
    // …y se retira tras 12 s visibles.
    clock.advance(20_000)
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
  const toggles = within(dock).getAllByRole('button', { name: /Ver salida/ })
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
  const openButtons = within(dock).queryAllByRole('button', { name: /Abrir/ })
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

it('E-2: fallo de copia en detalle avisa en vez de callar', async () => {
  const { copyText } = await import('../../lib/clipboard')
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
