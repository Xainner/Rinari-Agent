// @vitest-environment jsdom
// El catálogo no pide guardar nada (#93): lo que anuncia el proveedor ya está
// guardado, «Actualizar» registra los nuevos, «Quitar» oculta y «Mostrar»
// recupera, «Editar» cambia el alias (#92), y en el asistente «Usar» marca tu
// elección sin tocar el modelo activo.
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
let hidden: string[] = []

beforeEach(() => {
  discovered = ['glm-5.3-flash', 'deepseek-v4.1-flash']
  saved = [model('glm-5.3-flash', true), model('deepseek-v4.1-flash')]
  hidden = []
  host.invoke.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'model_discover') return { providers: { 'opencode-go': discovered.map((id) => ({ provider_model_id: id, capabilities: {}, availability: 'available' })) } }
    if (name === 'model_list') return { models: saved }
    if (name === 'model_refresh') return { providers: { 'opencode-go': { saved: saved.length, still_available: saved.length, marked_unavailable: 0, discovered: discovered.length, added: args.add_new ? ['kimi-k3'] : [], error: null } } }
    if (name === 'model_use') return { model: model(String(args.reference), true) }
    if (name === 'model_hidden_list') return { hidden }
    if (name === 'model_unhide') { hidden = hidden.filter((id) => id !== args.provider_model_id); return { model: model(String(args.provider_model_id)) } }
    if (name === 'model_remove') { hidden = [...hidden, String(args.reference)]; saved = saved.filter((m) => m.alias !== args.reference); return { removed: {} } }
    if (name === 'model_alias') {
      if (args.new_alias === 'glm-5.3-flash') throw new Error('Model alias already in use: glm-5.3-flash')
      saved = saved.map((m) => (m.alias === args.reference ? { ...m, alias: String(args.new_alias) } : m))
      return { model: {} }
    }
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

it('nothing is «por guardar»: «Quitar» asks, hides, and «Ocultos» shows it again', async () => {
  view()
  const rows = await screen.findAllByTestId('model-row')
  expect(rows).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull()
  await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[1])
  await userEvent.click(await screen.findByRole('button', { name: 'Quitar', hidden: false }))
  await waitFor(() => expect(screen.getAllByTestId('model-row')).toHaveLength(1))
  await userEvent.click(screen.getByRole('button', { name: 'Ocultos (1)' }))
  await userEvent.click(screen.getByRole('button', { name: /Mostrar/ }))
  await waitFor(() => expect(host.bridge.calls.some((call) => call.name === 'model_unhide' && call.args.provider_model_id === 'deepseek-v4.1-flash')).toBe(true))
})

it('«Editar» renames: Enter saves, a taken alias is said under the field, Esc cancels', async () => {
  view()
  await screen.findAllByTestId('model-row')
  await userEvent.click(screen.getAllByRole('button', { name: /Editar/ })[1])
  const field = screen.getByLabelText(/Alias/) as HTMLInputElement
  await userEvent.clear(field)
  await userEvent.type(field, 'glm-5.3-flash{Enter}')
  expect(await screen.findByRole('alert')).toBeTruthy()
  await userEvent.clear(field)
  await userEvent.type(field, 'rápido{Enter}')
  await waitFor(() => expect(screen.queryByTestId('model-editor')).toBeNull())
  expect(await screen.findByText('rápido')).toBeTruthy()
  await userEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
  await userEvent.type(screen.getByLabelText(/Alias/), '{Escape}')
  expect(screen.queryByTestId('model-editor')).toBeNull()
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
