// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import ContextSettings from './ContextSettings'

vi.mock('../../services/engine', () => ({
  engineApi: { contextSettingsGet: vi.fn(), contextSettingsSet: vi.fn(), contextStatus: vi.fn(), contextModels: vi.fn() },
  commandMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))

const providers = [{ id: 'p', alias: 'Gateway' }] as never
const models = [
  { id: 'a', alias: 'Endpoint', provider_id: 'p', saved: true },
  { id: 'b', alias: 'Catalogued', provider_id: 'p', saved: true },
  { id: 'c', alias: 'Unknown', provider_id: 'p', saved: true },
  { id: 'd', alias: 'Broken', provider_id: 'p', saved: true },
] as never
const config = { enabled: true, compact_at_percent: 80, model_id: null, model_windows: {} }
const capacity = [
  { model_id: 'a', model_alias: 'Endpoint', provider_alias: 'Gateway', window_tokens: 64000, window_source: 'provider', window_estimated: false },
  { model_id: 'b', model_alias: 'Catalogued', provider_alias: 'Gateway', window_tokens: 1000000, window_source: 'catalog', window_estimated: false, metadata_updated_at: '2026-09-22T22:17:47Z' },
  { model_id: 'c', model_alias: 'Unknown', provider_alias: 'Gateway', window_tokens: 128000, window_source: 'fallback', window_estimated: true },
  { model_id: 'd', model_alias: 'Broken', error: 'metadata unreadable' },
]

beforeEach(() => {
  vi.mocked(engineApi.contextSettingsGet).mockResolvedValue({ ...config })
  vi.mocked(engineApi.contextSettingsSet).mockImplementation(async (value) => value)
  vi.mocked(engineApi.contextModels).mockResolvedValue({ models: capacity } as never)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

const view = () => render(<I18nProvider lang="es"><ContextSettings providers={providers} models={models} /></I18nProvider>)

it('shows every model capacity with its source from one call, and a failing row does not hide the rest', async () => {
  view()
  const row = async (id: string) => within(await screen.findByTestId(`capacity-${id}`))
  expect((await row('a')).getByText('64.000 tokens')).toBeTruthy()
  expect((await row('a')).getByText('Informado por el proveedor')).toBeTruthy()
  expect((await row('b')).getByText(/^Catálogo de modelos · /)).toBeTruthy()
  expect((await row('c')).getByText('Sin confirmar · usando estimación')).toBeTruthy()
  expect((await row('d')).getByText('No se pudo leer la capacidad: metadata unreadable')).toBeTruthy()
  // Opening the screen asks once for all models; no per-row probes.
  expect(engineApi.contextModels).toHaveBeenCalledTimes(1)
  expect(engineApi.contextStatus).not.toHaveBeenCalled()
})

it('refreshes detection explicitly', async () => {
  view()
  await screen.findByTestId('capacity-a')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Actualizar detección' }))
  await waitFor(() => expect(engineApi.contextModels).toHaveBeenLastCalledWith(true))
})

it('saves the behavior, a summarizer and a custom limit, then goes back to automatic', async () => {
  view()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('switch', { name: 'Compactar automáticamente' }))
  await user.selectOptions(screen.getByLabelText('Modelo para resumir'), 'b')
  const limit = screen.getByLabelText('Límite personalizado: Endpoint')
  // The placeholder says what automatic resolves to, so nobody has to guess.
  expect(limit.getAttribute('placeholder')).toBe('Automático · 64.000')
  await user.type(limit, '50000')
  expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(engineApi.contextSettingsSet).toHaveBeenCalledWith({ enabled: false, compact_at_percent: 80, model_id: 'b', model_windows: { a: 50000 } }))
  expect((await screen.findByRole('status')).textContent).toContain('Configuración guardada')
  await user.click(screen.getByRole('button', { name: 'Volver a automático' }))
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(engineApi.contextSettingsSet).toHaveBeenLastCalledWith({ enabled: false, compact_at_percent: 80, model_id: 'b', model_windows: {} }))
})

it('does not save invalid values and can discard pending changes', async () => {
  view()
  const user = userEvent.setup()
  const threshold = await screen.findByLabelText('Umbral de compactación (%)')
  await user.clear(threshold)
  await user.type(threshold, '0')
  expect(screen.getByText('Indica un número entero entre 1 y 100.')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  await user.type(screen.getByLabelText('Límite personalizado: Unknown'), '0')
  expect(screen.getByText('Debe ser un número entero positivo.')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  expect((screen.getByLabelText('Umbral de compactación (%)') as HTMLInputElement).value).toBe('80')
  expect(screen.queryByText('Hay cambios sin guardar.')).toBeNull()
  expect(engineApi.contextSettingsSet).not.toHaveBeenCalled()
})

it('keeps the settings usable when capacity cannot be loaded at all', async () => {
  vi.mocked(engineApi.contextModels).mockRejectedValue(new Error('engine offline'))
  view()
  expect((await screen.findByRole('alert')).textContent).toContain('engine offline')
  expect(screen.getByRole('switch', { name: 'Compactar automáticamente' })).toBeTruthy()
})
