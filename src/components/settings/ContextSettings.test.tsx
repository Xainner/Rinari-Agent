// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import ContextSettings from './ContextSettings'

vi.mock('../../services/engine', () => ({
  engineApi: { contextSettingsGet: vi.fn(), contextSettingsSet: vi.fn(), contextStatus: vi.fn() },
  commandMessage: (error: unknown) => String(error),
}))

it('saves a summarizer and manual window through the engine', async () => {
  vi.mocked(engineApi.contextSettingsGet).mockResolvedValue({ enabled: true, compact_at_percent: 80, model_id: null, model_windows: {} })
  vi.mocked(engineApi.contextSettingsSet).mockImplementation(async value => value)
  render(<I18nProvider lang="es"><ContextSettings providers={[{ id: 'provider', alias: 'Provider' }] as never} models={[{ id: 'model', alias: 'Selected', provider_id: 'provider', saved: true }] as never} /></I18nProvider>)
  const user = userEvent.setup()
  await user.selectOptions(await screen.findByLabelText('Modelo para resumir'), 'model')
  await user.type(screen.getByLabelText('Contexto: Selected'), '64000')
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(engineApi.contextSettingsSet).toHaveBeenCalledWith({ enabled: true, compact_at_percent: 80, model_id: 'model', model_windows: { model: 64000 } }))
  expect((await screen.findByRole('status')).textContent).toContain('Configuración guardada')
})
