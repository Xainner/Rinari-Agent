// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import SavedGrants from './SavedGrants'

vi.mock('../../services/engine', () => ({
  engineApi: { permissionGrantsList: vi.fn(), permissionGrantsRevoke: vi.fn() },
  commandMessage: (e: unknown) => String(e),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('groups what is always allowed by where it applies and removes one', async () => {
  vi.mocked(engineApi.permissionGrantsList).mockResolvedValue({
    grants: [
      { id: 'g1', scope: 'C:/repo/app', scope_kind: 'project', scope_label: 'App', capability: 'network.outbound', rule_id: 'network_send', target: 'api.github.com', description: '', granted_at: '' },
      { id: 'g2', scope: 'chats', scope_kind: 'chats', scope_label: '', capability: 'shell.exec', rule_id: 'git_remote_mutation', target: null, description: '', granted_at: '' },
    ],
  })
  vi.mocked(engineApi.permissionGrantsRevoke).mockResolvedValue({ id: 'g1', revoked: true })
  render(<I18nProvider lang="es"><SavedGrants /></I18nProvider>)
  expect(await screen.findByText('Enviar datos a api.github.com')).toBeTruthy()
  expect(screen.getByText('App')).toBeTruthy()
  expect(screen.getByText('Conversaciones sin proyecto')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Quitar «Enviar datos a api.github.com»' }))
  expect(engineApi.permissionGrantsRevoke).toHaveBeenCalledWith('g1')
  await waitFor(() => expect(screen.queryByText('Enviar datos a api.github.com')).toBeNull())
})

it('says so when nothing is allowed for good', async () => {
  vi.mocked(engineApi.permissionGrantsList).mockResolvedValue({ grants: [] })
  render(<I18nProvider lang="es"><SavedGrants /></I18nProvider>)
  expect(await screen.findByText('Todavía no hay nada permitido para siempre.')).toBeTruthy()
})

it('lists old «always in chats» grants as old, last, to remove (#56)', async () => {
  vi.mocked(engineApi.permissionGrantsList).mockResolvedValue({
    grants: [
      { id: 'g2', scope: 'chats', scope_kind: 'chats', legacy: true, scope_label: '', capability: 'shell.exec', rule_id: 'git_remote_mutation', target: null, description: '', granted_at: '' },
      { id: 'g1', scope: 'C:/repo/app', scope_kind: 'project', scope_label: 'App', capability: 'network.outbound', rule_id: 'network_send', target: 'api.github.com', description: '', granted_at: '' },
    ],
  })
  const { container } = render(<I18nProvider lang="es"><SavedGrants /></I18nProvider>)
  expect(await screen.findByText('Antiguos: «Siempre en los chats»')).toBeTruthy()
  expect(screen.getByText(/Ya no se aplican/)).toBeTruthy()
  const groups = [...container.querySelectorAll('[data-legacy]')]
  expect(groups).toHaveLength(1)
  // After the project ones.
  expect(screen.getByText('App').compareDocumentPosition(groups[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Quitar «git push»' })).toBeTruthy()
})
