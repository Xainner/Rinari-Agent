// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { I18nProvider } from '../../i18n'
import ModelPicker, { refreshSummary } from './ModelPicker'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const models = [
  { id: 'm1', alias: 'glm', provider: 'opencode-go', provider_id: 'p', provider_model_id: 'glm-5.3', saved: true },
] as never

function picker(onRefreshModels?: () => Promise<never>) {
  render(
    <I18nProvider lang="es">
      <ModelPicker models={models} activeAlias="glm" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} onRefreshModels={onRefreshModels} />
    </I18nProvider>,
  )
}

it('offers the refresh right before managing models and never runs two at once', async () => {
  let finish: (value: unknown) => void = () => {}
  const onRefreshModels = vi.fn(() => new Promise<never>((resolve) => { finish = resolve as never }))
  picker(onRefreshModels)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'glm' }))
  const refresh = screen.getByRole('button', { name: 'Actualizar modelos' })
  const manage = screen.getByRole('button', { name: 'Administrar modelos' })
  expect(refresh.compareDocumentPosition(manage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  await user.click(refresh)
  const busy = screen.getByRole('button', { name: 'Actualizando modelos…' }) as HTMLButtonElement
  expect(busy.disabled).toBe(true)
  await user.click(busy)
  expect(onRefreshModels).toHaveBeenCalledOnce()

  finish({ providers: { 'opencode-go': { saved: 2, still_available: 1, marked_unavailable: 0, discovered: 2, added: ['kimi-k3'], error: null }, chatgpt: { saved: 0, still_available: 0, marked_unavailable: 0, discovered: 0, added: [], error: 'Connect this subscription first.' } } })
  await waitFor(() => expect(toast).toHaveBeenCalledWith('Modelos actualizados', expect.objectContaining({
    description: 'Nuevos: kimi-k3 · No se pudo leer: chatgpt: Connect this subscription first.',
  })))
  // The list stays open to show the refreshed models.
  expect(screen.getByRole('button', { name: 'Actualizar modelos' })).toBeTruthy()
})

it('reports a refresh that failed as an error', async () => {
  picker(vi.fn(() => Promise.reject(new Error('engine offline'))))
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'glm' }))
  await user.click(screen.getByRole('button', { name: 'Actualizar modelos' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^No se pudieron actualizar los modelos: .*engine offline/), expect.anything()))
})

it('is not offered without a refresh command', async () => {
  picker()
  await userEvent.setup().click(screen.getByRole('button', { name: 'glm' }))
  expect(screen.queryByRole('button', { name: 'Actualizar modelos' })).toBeNull()
})

it('summarizes added aliases and failing providers, and tolerates older Engines', () => {
  expect(refreshSummary({ providers: {
    a: { saved: 1, still_available: 1, marked_unavailable: 0, discovered: 1, error: null },
    b: { saved: 0, still_available: 0, marked_unavailable: 0, discovered: 3, added: ['x', 'y'], error: null },
  } })).toEqual({ added: ['x', 'y'], failed: [] })
})
