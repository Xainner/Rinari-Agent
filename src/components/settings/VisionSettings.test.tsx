// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import ExecutionSettings from './ExecutionSettings'
import VisionSettings from './VisionSettings'

vi.mock('../../services/engine', () => ({
  engineApi: { visionSettingsGet: vi.fn(), visionSettingsSet: vi.fn() },
  commandMessage: (e: unknown) => String(e),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const providers = [{ id: 'p', alias: 'Proveedor' }] as never
const models = [
  { id: 'sees', alias: 'Ve', provider_id: 'p', capabilities: { vision: true } },
  { id: 'unknown', alias: 'Quizás', provider_id: 'p', capabilities: {} },
  { id: 'blind', alias: 'Ciego', provider_id: 'p', capabilities: { vision: false } },
] as never

it('choosing the auxiliary model saves at once and leaves the execution policy alone', async () => {
  vi.mocked(engineApi.visionSettingsGet).mockResolvedValue({
    mode: 'dedicated', model_id: null, confirm_unknown: false, model_overrides: {},
    execution: { max_concurrency: 8, providers: {}, models: {} },
  })
  vi.mocked(engineApi.visionSettingsSet).mockImplementation(async (c) => ({ ...c, execution: { max_concurrency: 8, providers: {}, models: {} } }))
  render(<I18nProvider lang="es"><VisionSettings providers={providers} models={models} /></I18nProvider>)
  const select = await screen.findByLabelText('Modelo visual auxiliar')
  // What the catalog says cannot see is not offered; unknown is marked.
  expect(screen.queryByRole('option', { name: /Ciego/ })).toBeNull()
  expect(screen.getByRole('option', { name: 'Quizás · sin confirmar' })).toBeTruthy()
  // No per-model capability list any more: the catalog knows.
  expect(screen.queryByText(/Capacidad visual por modelo/)).toBeNull()
  await userEvent.selectOptions(select, 'sees')
  await waitFor(() => expect(engineApi.visionSettingsSet).toHaveBeenCalledTimes(1))
  const sent = vi.mocked(engineApi.visionSettingsSet).mock.calls[0][0]
  expect(sent).toMatchObject({ mode: 'dedicated', model_id: 'sees' })
  expect(sent).not.toHaveProperty('execution')
})

it('native mode saves on click; auxiliary waits for its model', async () => {
  vi.mocked(engineApi.visionSettingsGet).mockResolvedValue({ mode: 'automatic', model_id: null, confirm_unknown: false, model_overrides: {} })
  vi.mocked(engineApi.visionSettingsSet).mockImplementation(async (c) => c)
  render(<I18nProvider lang="es"><VisionSettings providers={providers} models={models} /></I18nProvider>)
  await userEvent.click(await screen.findByRole('radio', { name: /Auxiliar/ }))
  expect(engineApi.visionSettingsSet).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Modelo visual auxiliar')).toBeTruthy()
  await userEvent.click(screen.getByRole('radio', { name: /Nativo/ }))
  await waitFor(() => expect(engineApi.visionSettingsSet).toHaveBeenCalledWith(expect.objectContaining({ mode: 'conversation' })))
})

it('execution overrides clear back to inheritance from Advanced', async () => {
  vi.mocked(engineApi.visionSettingsGet).mockResolvedValue({
    mode: 'automatic', model_id: null, confirm_unknown: false,
    execution: { max_concurrency: 8, providers: { p: 1 }, models: { sees: 2048 } },
  })
  vi.mocked(engineApi.visionSettingsSet).mockImplementation(async (c) => c)
  render(<I18nProvider lang="es"><ExecutionSettings providers={providers} models={models} /></I18nProvider>)
  await userEvent.clear(await screen.findByLabelText('Llamadas simultáneas por proveedor: Proveedor'))
  await userEvent.clear(screen.getByLabelText('Ve'))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(engineApi.visionSettingsSet).toHaveBeenLastCalledWith(expect.objectContaining({
    execution: { max_concurrency: 8, providers: {}, models: {} },
  })))
})
