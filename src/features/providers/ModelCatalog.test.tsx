// @vitest-environment jsdom
// El catálogo no pide guardar modelo por modelo: «Actualizar» registra los
// nuevos en el Engine, el aviso de pendientes solo sale si quedan, y en el
// asistente «Usar» marca tu elección sin tocar el modelo activo.
import { installMockPlatform } from '../../test/mockPlatform'
const host = installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import ModelCatalog from './ModelCatalog'

const model = (alias: string, active = false) => ({ id: 'mdl_' + alias, alias, provider: 'opencode-go', provider_model_id: alias, active, capabilities: {} })
let discovered: string[] = []
let saved: ReturnType<typeof model>[] = []

beforeEach(() => {
  discovered = ['glm-5.3-flash', 'deepseek-v4.1-flash']
  saved = [model('glm-5.3-flash', true), model('deepseek-v4.1-flash')]
  host.invoke.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'model_discover') return { providers: { 'opencode-go': discovered.map((id) => ({ provider_model_id: id, capabilities: {}, availability: 'available' })) } }
    if (name === 'model_list') return { models: saved }
    if (name === 'model_refresh') return { providers: { 'opencode-go': { saved: saved.length, still_available: saved.length, marked_unavailable: 0, discovered: discovered.length, added: args.add_new ? ['kimi-k3'] : [], error: null } } }
    if (name === 'model_use') return { model: model(String(args.reference), true) }
    return {}
  })
})
afterEach(() => { cleanup(); host.bridge.calls.length = 0 })

const view = (props: Partial<Parameters<typeof ModelCatalog>[0]> = {}) => render(<I18nProvider lang="es"><ModelCatalog providerAlias="opencode-go" onChanged={vi.fn()} {...props} /></I18nProvider>)

it('refresh asks the Engine to register new models, and no hint shows when nothing is pending', async () => {
  view()
  await screen.findAllByText('deepseek-v4.1-flash')
  expect(screen.queryByText(/sin guardar/)).toBeNull()
  expect(screen.queryByText(/Guarda con un alias/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
  await waitFor(() => expect(host.bridge.calls.some((call) => call.name === 'model_refresh' && call.args.add_new === true && call.args.provider === 'opencode-go')).toBe(true))
})

it('says how many models are still unsaved when the Engine could not register some', async () => {
  discovered = ['glm-5.3-flash', 'deepseek-v4.1-flash', 'kimi-k3']
  view()
  expect(await screen.findByText('1 modelos aún sin guardar: guárdalos para usarlos en el composer.')).toBeTruthy()
})

it('in the wizard, «Usar» marks the choice without changing the active model', async () => {
  const onChoose = vi.fn()
  view({ choice: { chosen: null, onChoose } })
  const buttons = await screen.findAllByRole('button', { name: 'Usar' })
  // Sin elección todavía: ninguno aparece como activo, tampoco el del Engine.
  expect(buttons).toHaveLength(2)
  await userEvent.click(buttons[1])
  expect(onChoose).toHaveBeenCalledWith('deepseek-v4.1-flash')
  expect(host.bridge.calls.some((call) => call.name === 'model_use')).toBe(false)
})
