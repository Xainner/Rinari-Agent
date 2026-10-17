// @vitest-environment jsdom
// Ajustes → Perfiles (#86): la tarjeta dice lo que es el perfil y el
// formulario no pide id ni modo; el alma por defecto es la de Rinari.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'

const api = vi.hoisted(() => ({
  bundleList: vi.fn(),
  bundleCreate: vi.fn(async () => ({ profile: {} })),
  bundleUpdate: vi.fn(async () => ({ profile: {} })),
  bundleRemove: vi.fn(),
  soulList: vi.fn(async () => ({ souls: [{ id: 'rinari-default', name: 'Rinari', version: '1', description: '', source: 'bundled' }, { id: 'seria', name: 'Seria', version: '1', description: '', source: 'user' }], active_id: null })),
  agentList: vi.fn(async () => ({ agents: [{ name: 'main', description: '', profile: '', provenance: '', tool_allowlist: [], budget: {}, assignment: { model: 'sonnet', fallback: null, enabled: true } }, { name: 'explore', description: '', profile: '', provenance: '', tool_allowlist: [], budget: {}, assignment: { model: null, fallback: null, enabled: true } }] })),
  modelList: vi.fn(async () => ({ models: [{ id: 'm1', alias: 'sonnet', provider: 'anthropic' }, { id: 'm2', alias: 'flash', provider: 'google' }] })),
}))
vi.mock('../../services/engine', () => ({ engineApi: api, commandMessage: String }))
const activate = vi.fn(async () => true)
vi.mock('../profiles/profileStore', () => ({ useProfileStore: { getState: () => ({ activate }) } }))
vi.mock('../rinari/art', () => ({ art: { chibi: () => '' } }))

import ProfilesView from './ProfilesView'

beforeEach(() => {
  api.bundleList.mockResolvedValue({
    profiles: [
      { id: 'default', name: 'Default', description: '', soul_id: null, agents: {}, builtin: true, active: true, counts: { projects: 3, sessions: 12 } },
      { id: 'trabajo', name: 'Trabajo', description: 'Oficina', soul_id: 'seria', agents: { explore: { model: 'flash' } }, active: false, counts: { projects: 1, sessions: 2 } },
    ],
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('each card says its soul, each agent model (or «como el general») and its work', async () => {
  render(<I18nProvider lang="es"><ProfilesView onChanged={() => {}} /></I18nProvider>)
  const cards = await screen.findAllByTestId('profile-card')
  await waitFor(() => expect(cards[1].textContent).toContain('Seria'))
  expect(cards[0].textContent).toContain('Rinari')
  expect(cards[0].textContent).toContain('En uso')
  expect(cards[1].textContent).toContain('flash · google')
  expect(cards[1].textContent).toContain('como el general (sonnet · anthropic)')
  expect(cards[1].textContent).toContain('Proyectos: 1 · Conversaciones: 2')
  await userEvent.click(within(cards[1]).getByRole('button', { name: 'Usar este perfil' }))
  expect(activate).toHaveBeenCalledWith('trabajo')
})

it('creating asks no id and no mode, and starts with Rinari’s soul', async () => {
  render(<I18nProvider lang="es"><ProfilesView onChanged={() => {}} /></I18nProvider>)
  await userEvent.click(await screen.findByRole('button', { name: 'Crear perfil' }))
  const form = await screen.findByTestId('profile-form')
  expect(within(form).queryByText(/ID/)).toBeNull()
  expect(within(form).queryByText(/Modo/)).toBeNull()
  await userEvent.type(within(form).getByLabelText('Nombre'), 'Diseño')
  await userEvent.click(within(form).getByTestId('profile-save'))
  await waitFor(() => expect(api.bundleCreate).toHaveBeenCalledWith({ name: 'Diseño', description: '', soul_id: 'rinari-default', agents: {} }))
})

it('each agent can change model, fallback and effort; only the changes are saved', async () => {
  render(<I18nProvider lang="es"><ProfilesView onChanged={() => {}} /></I18nProvider>)
  const cards = await screen.findAllByTestId('profile-card')
  await waitFor(() => expect(cards[1].textContent).toContain('Seria'))
  await userEvent.click(within(cards[1]).getByRole('button', { name: /Editar/ }))
  const form = await screen.findByTestId('profile-form')
  expect(within(form).getByTestId('profile-agent-model-explore').textContent).toContain('flash')
  await userEvent.click(within(form).getByTestId('profile-agent-effort-explore'))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Alto' }))
  await userEvent.click(within(form).getByTestId('profile-save'))
  await waitFor(() => expect(api.bundleUpdate).toHaveBeenCalledWith('trabajo', expect.objectContaining({ agents: { explore: { model: 'flash', effort: 'high' } } })))
})

it('the id lives in «Detalles», and «Ver en la barra lateral» uses the profile and goes back to work', async () => {
  render(<I18nProvider lang="es"><ProfilesView onChanged={() => {}} /></I18nProvider>)
  const cards = await screen.findAllByTestId('profile-card')
  expect(within(cards[1]).getByTestId('profile-details').textContent).toContain('trabajo')
  await userEvent.click(within(cards[1]).getByTestId('profile-show-sidebar'))
  await waitFor(() => expect(activate).toHaveBeenCalledWith('trabajo'))
})
