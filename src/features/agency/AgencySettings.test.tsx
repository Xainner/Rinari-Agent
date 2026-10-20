// @vitest-environment jsdom
// Ajustes de la Agency (D-24): la memoria propia de cada agente se ve, se
// escribe, se corrige y se olvida; sus cuentas propias se conectan desde el
// catálogo, a nombre del agente (C8).
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { AgencyAgent } from './types'

const records = [{ id: 'mem_1', topic: 'estilo', text: 'Historias de 30 s', kind: 'fact', scope: 'user', place: 'agent', place_ref: 'agent_1', revision: 3 }]
const agencyAgentRemember = vi.fn(async (_agentId: string, _topic: string, _text: string) => ({ record: {} }))
const forget = vi.fn(async (_id: string, _revision: number) => ({ id: 'mem_1', forgotten: true }))
const catalogProps: { owner?: string }[] = []
vi.mock('../../services/engine', () => ({
  engineApi: {
    agencyAgentMemory: vi.fn(async () => ({ records, count: records.length })),
    agencyAgentRemember: (agentId: string, topic: string, text: string) => agencyAgentRemember(agentId, topic, text),
    mcpList: vi.fn(async () => ({ servers: [{ name: 'gmail-emails', scope: 'global', owner: 'agent:agent_1' }, { name: 'gmail', scope: 'global', owner: null }] })),
  },
  onEngineEvent: vi.fn(async () => () => {}),
  commandMessage: String,
}))
vi.mock('../../services/memory', () => ({
  memoryApi: { update: vi.fn(), forget: (id: string, revision: number) => forget(id, revision) },
}))
vi.mock('../connectors/CatalogDialog', () => ({
  CatalogDialog: (props: { owner?: string; open: boolean }) => {
    if (props.open) catalogProps.push(props)
    return props.open ? <div data-testid="catalog-open" /> : null
  },
}))
vi.mock('../connectors/SignInDialog', () => ({
  SignInDialog: () => null,
  useSignIn: (select: (state: { open: () => void }) => unknown) => select({ open: () => {} }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import AgencySettings from './AgencySettings'

const agent = (id: string, name: string): AgencyAgent => ({
  id, rinari_profile_id: 'default', name, role: '', instructions: '', model: null, permission_profile: 'workspace',
  connectors: [], budget: {}, ask_new_destinations: null, session_id: `ses_${id}`, created_at: 1, updated_at: 1, archived_at: null,
})

afterEach(() => { cleanup(); agencyAgentRemember.mockClear(); forget.mockClear(); catalogProps.length = 0 })

it('shows, adds and forgets what an agent remembers', async () => {
  render(<I18nProvider lang="es"><AgencySettings agents={[agent('agent_1', 'Writer')]} initialAgentId="agent_1" /></I18nProvider>)
  await waitFor(() => expect(screen.getByText('Historias de 30 s')).toBeTruthy())
  expect(screen.getByText('Memoria de Writer')).toBeTruthy()
  await userEvent.type(screen.getByTestId('agency-memory-topic'), 'tono')
  await userEvent.type(screen.getByTestId('agency-memory-text'), 'Cálido y breve')
  await userEvent.click(screen.getByTestId('agency-memory-add'))
  expect(agencyAgentRemember).toHaveBeenCalledWith('agent_1', 'tono', 'Cálido y breve')
  await userEvent.click(screen.getByRole('button', { name: 'Olvidar · estilo' }))
  expect(forget).toHaveBeenCalledWith('mem_1', 3)
})

it('lists only the agent\'s own accounts and connects one in its name', async () => {
  render(<I18nProvider lang="es"><AgencySettings agents={[agent('agent_1', 'Emails')]} /></I18nProvider>)
  await waitFor(() => expect(screen.getByText('gmail-emails')).toBeTruthy())
  expect(screen.queryByText('gmail')).toBeNull()
  await userEvent.click(screen.getByTestId('agency-connect-account'))
  expect(screen.getByTestId('catalog-open')).toBeTruthy()
  expect(catalogProps.at(-1)?.owner).toBe('agent:agent_1')
})

it('says how to start when there are no agents', () => {
  render(<I18nProvider lang="es"><AgencySettings agents={[]} /></I18nProvider>)
  expect(screen.getByText('Crea un agente para ver sus ajustes.')).toBeTruthy()
})
