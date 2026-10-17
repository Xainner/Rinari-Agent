// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, type AdvancedSetting } from '../../services/engine'
import AdvancedSettings from './AdvancedSettings'
import ProviderConnectionSettings from '../../features/providers/ProviderConnectionSettings'

vi.mock('../../services/engine', () => ({
  engineApi: {
    executionSettingsGet: vi.fn(),
    executionSettingsSet: vi.fn(),
    advancedSettingsGet: vi.fn(),
    advancedSettingsSet: vi.fn(),
    networkSettingsGet: vi.fn(),
    networkSettingsSet: vi.fn(),
    networkTest: vi.fn(),
    storageUsage: vi.fn(),
    storageClean: vi.fn(),
  },
  commandMessage: (e: unknown) => String(e),
}))
const HOST = {
  startupLimit: 'auto', startupLimitS: 30, lastStartupMs: 4800, startupTimeline: [{ step: 'process', ms: 0 }, { step: 'engine-hello', ms: 4800 }],
  hardwareAcceleration: true, restartRequired: false, detailedLogs: false, detailedLogsUntil: null,
  environment: [{ name: 'RINARI_WHISPER_BIN', value: 'C:/tools/whisper-cli.exe' }], channel: 'stable', packaged: true,
}
const host = { settings: { ...HOST } as Record<string, unknown>, relaunch: vi.fn(async () => {}) }
vi.mock('../../platform', () => ({
  platform: () => ({
    engine: { status: vi.fn().mockResolvedValue({ state: 'ready', engine_version: '0.4.0', protocol_version: 1, detail: null, capabilities: {} }), restart: vi.fn() },
    app: {
      openFolder: vi.fn().mockResolvedValue(undefined),
      hostSettings: async () => ({ ...host.settings }),
      setHostSettings: async (patch: Record<string, unknown>) => {
        host.settings = { ...host.settings, ...patch }
        if ('hardwareAcceleration' in patch) host.settings.restartRequired = true
        if ('detailedLogs' in patch) host.settings.detailedLogsUntil = patch.detailedLogs ? '2026-10-18T09:00:00.000Z' : null
        return { ...host.settings }
      },
      relaunch: host.relaunch,
    },
    opener: { openUrl: vi.fn() },
    updates: { check: vi.fn().mockResolvedValue(null) },
    diagnostics: { export: vi.fn() },
  }),
}))
vi.mock('../../features/processes/OrphanProcesses', () => ({ default: () => null }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

const DEFAULTS = { max_concurrency: 8, timeouts: { connect: 15, first_byte: 120, idle: 120, total: 900 } }
const limit = (key: string, value: number | boolean, def: number | boolean, min: number | null = 1, max: number | null = 100): AdvancedSetting =>
  ({ key, type: typeof value === 'boolean' ? 'bool' : 'int', value, default: def, min, max })
const LIMITS = [
  limit('runtime.emergency.max_model_calls', 500, 500, 1, 100_000),
  limit('runtime.cost.max_turn_cost', 0, 0, 0, null),
  limit('runtime.safeguards.loop_detection', true, true, null, null),
  limit('agents.max_depth', 2, 2, 0, 8),
  limit('permissions.ask_new_destinations', false, false, null, null),
]

beforeEach(() => {
  vi.mocked(engineApi.executionSettingsGet).mockResolvedValue({ settings: { max_concurrency: 8, providers: {}, models: {} }, defaults: DEFAULTS })
  vi.mocked(engineApi.executionSettingsSet).mockImplementation(async (settings) => ({ settings, defaults: DEFAULTS }))
  vi.mocked(engineApi.advancedSettingsGet).mockResolvedValue({ limits: LIMITS })
  vi.mocked(engineApi.advancedSettingsSet).mockImplementation(async (values) => ({
    limits: LIMITS.map((row) => (row.key in values ? { ...row, value: values[row.key] ?? row.default } : row)),
  }))
  vi.mocked(engineApi.networkSettingsGet).mockResolvedValue({
    proxy: { mode: 'system', url: null, bypass: [] }, certificates: { mode: 'system', path: null },
    effective: { proxy: {}, certificates: {}, error: null },
  })
  vi.mocked(engineApi.storageUsage).mockResolvedValue({ home: '~/.rinari', total: 3000, sections: [{ id: 'conversations', bytes: 2000, files: 1 }, { id: 'logs', bytes: 1000, files: 2 }] })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); host.settings = { ...HOST } })

const view = () => render(<I18nProvider lang="es"><AdvancedSettings /></I18nProvider>)
const openCard = async (title: string) => {
  const head = await screen.findByRole('button', { name: new RegExp(title) })
  fireEvent.click(head)
  return head.closest('section') as HTMLElement
}

it('is short: folded cards with a summary each, and the engine state on top', async () => {
  view()
  expect(await screen.findByText('Motor conectado')).toBeTruthy()
  expect(screen.getByText('Normal · 8 a la vez')).toBeTruthy()
  expect(screen.getByText('Sin tope de coste · bucles: vigilados')).toBeTruthy()
  // Folded: no field is on screen until a card opens.
  expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  expect(screen.queryByTestId('advanced-changed')).toBeNull()
})

it('a preset writes the four timeouts; «Normal» puts the defaults back', async () => {
  view()
  const card = await openCard('Conexiones con los modelos')
  await userEvent.click(within(card).getByRole('tab', { name: 'Servidor lento' }))
  await waitFor(() => expect(engineApi.executionSettingsSet).toHaveBeenLastCalledWith(expect.objectContaining({
    timeouts: { connect: 30, first_byte: 600, idle: 300, total: 3600 },
  })))
  await userEvent.click(within(card).getByRole('tab', { name: 'Normal' }))
  await waitFor(() => expect(engineApi.executionSettingsSet).toHaveBeenLastCalledWith(expect.objectContaining({ timeouts: {} })))
  await userEvent.click(within(card).getByRole('tab', { name: 'Personalizado' }))
  expect((within(card).getByLabelText('Primer dato', { exact: false }) as HTMLInputElement).value).toBe('120')
})

it('a limit out of range is marked where it is and not saved; ↺ puts the default back', async () => {
  view()
  const card = await openCard('Límites del turno')
  const depth = within(card).getByLabelText('Niveles de subagentes') as HTMLInputElement
  await userEvent.clear(depth)
  await userEvent.type(depth, '99{Enter}')
  expect(within(card).getByText('Entre 0 y 8')).toBeTruthy()
  expect(engineApi.advancedSettingsSet).not.toHaveBeenCalled()
  await userEvent.clear(depth)
  await userEvent.type(depth, '3{Enter}')
  await waitFor(() => expect(engineApi.advancedSettingsSet).toHaveBeenCalledWith({ 'agents.max_depth': 3 }))
  await userEvent.click(await within(card).findByRole('button', { name: 'Volver a 2' }))
  await waitFor(() => expect(engineApi.advancedSettingsSet).toHaveBeenLastCalledWith({ 'agents.max_depth': null }))
  // The permissions switch is not a limit: it lives in Herramientas.
  expect(within(card).queryByText(/destinos nuevos/)).toBeNull()
})

it('search finds the card and opens it', async () => {
  view()
  await screen.findByText('Motor conectado')
  await userEvent.type(screen.getByRole('searchbox'), 'proxy')
  expect(await screen.findByRole('tab', { name: 'Proxy del sistema' })).toBeTruthy()
  expect(screen.queryByText('Límites del turno')).toBeNull()
})

it('storage measures when opened, biggest first', async () => {
  view()
  const card = await openCard('Almacenamiento')
  const list = await within(card).findByTestId('storage-usage')
  expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Conversaciones2.0 KB', 'Registros1000 B'])
})

it('a provider keeps its own times in Proveedores → Conexión; empty inherits', async () => {
  vi.mocked(engineApi.executionSettingsGet).mockResolvedValue({
    settings: { max_concurrency: 8, providers: { p1: 1 }, models: {}, provider_timeouts: { p1: { first_byte: 300 } } },
    defaults: DEFAULTS,
  })
  render(<I18nProvider lang="es"><ProviderConnectionSettings providerId="p1" /></I18nProvider>)
  const firstByte = await screen.findByLabelText('Primer dato') as HTMLInputElement
  expect(firstByte.value).toBe('300')
  expect((screen.getByLabelText('Conexión') as HTMLInputElement).placeholder).toBe('Hereda: 15 s')
  await userEvent.clear(firstByte)
  fireEvent.blur(firstByte)
  await waitFor(() => expect(engineApi.executionSettingsSet).toHaveBeenLastCalledWith(expect.objectContaining({ provider_timeouts: {} })))
})

it('Almacenamiento: «Limpiar» solo donde se puede, con confirmación, y la sugerencia al pasar de 5 GB (#91)', async () => {
  const GB = 1024 ** 3
  vi.mocked(engineApi.storageUsage).mockResolvedValue({
    home: '~/.rinari', total: 11 * GB,
    sections: [
      { id: 'workspaces', bytes: 7 * GB, files: 10, cleanable: true, reclaimable: 6 * GB },
      { id: 'conversations', bytes: 3 * GB, files: 1, cleanable: false, reclaimable: 0 },
      { id: 'logs', bytes: GB, files: 2, cleanable: true, reclaimable: 0 },
    ],
  })
  vi.mocked(engineApi.storageClean).mockResolvedValue({
    section: 'workspaces', freed: 6 * GB, removed: 4, kept: 0,
    usage: { home: '~/.rinari', total: 5 * GB, sections: [{ id: 'workspaces', bytes: GB, files: 2, cleanable: true, reclaimable: 0 }] },
  })
  view()
  await openCard('Almacenamiento')
  expect((await screen.findByTestId('storage-suggest')).textContent).toContain('6.0 GB')
  expect(screen.queryByTestId('storage-clean-conversations')).toBeNull()
  expect((screen.getByTestId('storage-clean-logs') as HTMLButtonElement).disabled).toBe(true)
  await userEvent.click(screen.getByTestId('storage-clean-workspaces'))
  const dialog = await screen.findByRole('alertdialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Limpiar' }))
  await waitFor(() => expect(engineApi.storageClean).toHaveBeenCalledWith('workspaces'))
  await waitFor(() => expect(screen.queryByTestId('storage-suggest')).toBeNull())
})

it('Motor: límite de arranque, aceleración por hardware con reinicio y el entorno en solo lectura (#70, #96)', async () => {
  view()
  await openCard('Motor')
  const limits = await screen.findByTestId('startup-limit')
  expect(limits.textContent).toContain('Arrancó en 4.8 s')
  await userEvent.click(within(limits).getByRole('tab', { name: '60 s' }))
  await waitFor(() => expect(host.settings.startupLimit).toBe(60))
  expect(screen.getByTestId('engine-environment').textContent).toContain('RINARI_WHISPER_BIN')
  const hardware = screen.getByTestId('hardware-acceleration')
  await userEvent.click(within(hardware).getByRole('switch'))
  await userEvent.click(await within(hardware).findByRole('button', { name: 'Reiniciar ahora' }))
  expect(host.relaunch).toHaveBeenCalled()
})

it('Diagnóstico: registros detallados por 24 h (#96)', async () => {
  view()
  await openCard('Diagnóstico')
  const row = await screen.findByTestId('detailed-logs')
  await userEvent.click(within(row).getByRole('switch'))
  await waitFor(() => expect(row.textContent).toContain('Activos hasta'))
})
