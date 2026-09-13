// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import VisionSettings from './VisionSettings'

vi.mock('../../services/engine', () => ({
  engineApi: { visionSettingsGet: vi.fn(), visionSettingsSet: vi.fn() },
  commandMessage: (e: unknown) => String(e),
}))

it('saves an unknown visual model without confirmation', async () => {
  vi.mocked(engineApi.visionSettingsGet).mockResolvedValue({ mode: 'dedicated', model_id: 'a', confirm_unknown: true })
  vi.mocked(engineApi.visionSettingsSet).mockImplementation(async c => c)
  render(<I18nProvider lang="es"><VisionSettings providers={[{ id: 'p', alias: 'Proveedor' }] as never}
    models={[{ id: 'a', alias: 'Primero', provider_id: 'p', capabilities: {} }, { id: 'b', alias: 'Segundo', provider_id: 'p', capabilities: {} }] as never} /></I18nProvider>)
  const user = userEvent.setup()
  await screen.findByLabelText('Modelo visual')
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByRole('group', { name: 'Proveedor' })).toBeTruthy()
  await user.selectOptions(screen.getByLabelText('Modelo visual'), 'b')
  expect(screen.queryByRole('checkbox')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(engineApi.visionSettingsSet).toHaveBeenCalledWith({ mode: 'dedicated', model_id: 'b', confirm_unknown: true }))
  expect((await screen.findByRole('status')).textContent).toContain('Configuración guardada.')
})


it('persists a model capability without a chat confirmation', async () => {
  vi.mocked(engineApi.visionSettingsGet).mockResolvedValue({ mode: 'automatic', model_id: null, confirm_unknown: false, model_overrides: {} })
  vi.mocked(engineApi.visionSettingsSet).mockImplementation(async c => c)
  render(<I18nProvider lang="es"><VisionSettings providers={[]} models={[{ id: 'main', alias: 'Principal', saved: true }] as never} /></I18nProvider>)
  const selector = await screen.findByLabelText('Visión: Principal')
  await userEvent.selectOptions(selector, 'true')
  await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' }).at(-1)!)
  await waitFor(() => expect(engineApi.visionSettingsSet).toHaveBeenLastCalledWith(expect.objectContaining({ model_overrides: { main: true } })))
})

it('saves shared execution overrides and restores inheritance', async () => {
  vi.mocked(engineApi.visionSettingsGet).mockResolvedValue({ mode: 'automatic', model_id: null, confirm_unknown: false,
    execution: { max_concurrency: 8, providers: { p: 1 }, models: { m: 2048 } } })
  vi.mocked(engineApi.visionSettingsSet).mockImplementation(async c => c)
  render(<I18nProvider lang="es"><VisionSettings providers={[{ id: 'p', alias: 'Destino' }] as never}
    models={[{ id: 'm', alias: 'Modelo', saved: true }] as never} /></I18nProvider>)
  const parallel = await screen.findByLabelText('Concurrencia: Destino')
  await userEvent.clear(parallel)
  const output = screen.getByLabelText('Máximo de tokens de salida: Modelo')
  await userEvent.clear(output)
  await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' }).at(-1)!)
  await waitFor(() => expect(engineApi.visionSettingsSet).toHaveBeenLastCalledWith(expect.objectContaining({
    execution: { max_concurrency: 8, providers: {}, models: {} }
  })))
})
