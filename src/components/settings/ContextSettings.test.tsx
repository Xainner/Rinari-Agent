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
] as never
const config = { enabled: true, compact_at_percent: 80, model_id: null, model_windows: {} }

beforeEach(() => {
  vi.mocked(engineApi.contextSettingsGet).mockResolvedValue({ ...config })
  vi.mocked(engineApi.contextSettingsSet).mockImplementation(async (value) => value)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

const view = () => render(<I18nProvider lang="es"><ContextSettings providers={providers} models={models} /></I18nProvider>)

it('only configures behavior: the threshold lives there and nothing is set per model', async () => {
  view()
  const behavior = (await screen.findByRole('switch', { name: 'Compactar automáticamente' })).closest('section') as HTMLElement
  expect(within(behavior).getByLabelText('Umbral de compactación (%)')).toBeTruthy()
  expect(within(behavior).getByLabelText('Modelo para resumir')).toBeTruthy()
  expect(screen.queryByText('Avanzado')).toBeNull()
  expect(screen.queryByText('Capacidad por modelo')).toBeNull()
  expect(screen.queryByLabelText(/Límite personalizado/)).toBeNull()
  // The capacities come from the providers; this screen does not probe them.
  expect(engineApi.contextModels).not.toHaveBeenCalled()
  expect(engineApi.contextStatus).not.toHaveBeenCalled()
})

it('saves the behavior and keeps a capacity fixed from the CLI as it is', async () => {
  vi.mocked(engineApi.contextSettingsGet).mockResolvedValue({ ...config, model_windows: { a: 50000 } })
  view()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('switch', { name: 'Compactar automáticamente' }))
  await user.selectOptions(screen.getByLabelText('Modelo para resumir'), 'b')
  const threshold = screen.getByLabelText('Umbral de compactación (%)')
  await user.clear(threshold)
  await user.type(threshold, '85')
  expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(engineApi.contextSettingsSet).toHaveBeenCalledWith({
    enabled: false, compact_at_percent: 85, model_id: 'b', model_windows: { a: 50000 },
  }))
  expect((await screen.findByRole('status')).textContent).toContain('Configuración guardada')
})

it('does not save an invalid threshold and can discard pending changes', async () => {
  view()
  const user = userEvent.setup()
  const threshold = await screen.findByLabelText('Umbral de compactación (%)')
  await user.clear(threshold)
  await user.type(threshold, '0')
  expect(screen.getByText('Indica un número entero entre 1 y 100.')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  expect((screen.getByLabelText('Umbral de compactación (%)') as HTMLInputElement).value).toBe('80')
  expect(screen.queryByText('Hay cambios sin guardar.')).toBeNull()
  expect(engineApi.contextSettingsSet).not.toHaveBeenCalled()
})

it('reports a settings load failure', async () => {
  vi.mocked(engineApi.contextSettingsGet).mockRejectedValue(new Error('engine offline'))
  view()
  expect((await screen.findByRole('alert')).textContent).toContain('engine offline')
})
