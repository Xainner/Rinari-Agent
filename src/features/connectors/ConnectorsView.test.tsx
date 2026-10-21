// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const { bridge } = installMockPlatform()
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, type McpCatalogEntry, type McpServer, type McpToolPermissions } from '../../services/engine'
import ConnectorsView from './ConnectorsView'
import { resetConnectorEvents } from './connectorStore'
import { useSignIn } from './SignInDialog'

const ALL = { mcp_remote_v1: true, mcp_oauth_v1: true, mcp_background_connect_v1: true, mcp_tool_permissions_v1: true, mcp_catalog_v1: true }

const notion: McpServer = { name: 'notion', transport: 'http', command: '', url: 'https://mcp.notion.com/mcp', scope: 'global', enabled: true, connected: false, updated_at: null, auth: { kind: 'oauth' }, status: 'error', connection: { code: 'MCP_AUTH_REJECTED', hint: 'oauth_required', tools: 0, resources: false, attempts: 1 } }
const local: McpServer = { name: 'files', transport: 'stdio', command: 'npx -y files', scope: 'project', project_root: 'C:/repo', enabled: true, connected: false, updated_at: null, status: 'error', connection: { code: 'MCP_SPAWN_FAILED', hint: 'check_command_installed', message: 'npx not found', tools: 0, resources: false, attempts: 3, retry_in_s: 8 } }
const notionEntry = {
  id: 'notion', name: 'Notion', logo: 'notion', category: 'work', description: { es: 'Páginas y bases de Notion.', en: 'Notion pages.' }, docs_url: 'https://developers.notion.com/docs/mcp',
  server: { transport: 'http', url: 'https://mcp.notion.com/mcp', auth: { kind: 'oauth' } }, setup: { kind: 'registration', help: { es: 'Pulsa Conectar.', en: 'Press Connect.' } },
  added: true, servers: [{ name: 'notion', scope: 'global', enabled: true, status: 'error' }],
} as McpCatalogEntry
const gmailEntry = {
  id: 'google-gmail', name: 'Gmail', logo: 'google-gmail', category: 'google', group: 'google', preview: true,
  description: { es: 'Correos de Gmail.', en: 'Gmail.' }, notes: { es: 'Los MCP de Google Workspace están en Developer Preview.', en: 'Preview.' }, docs_url: 'https://developers.google.com',
  server: { transport: 'http', url: 'https://gmailmcp.googleapis.com/mcp/v1', auth: { kind: 'oauth' } },
  setup: { kind: 'own_client', fields: [{ name: 'client_id', required: true }, { name: 'client_secret', required: true }, { name: 'redirect_port', required: false }], console_url: 'https://console.cloud.google.com/apis/credentials' },
  added: false, servers: [],
} as McpCatalogEntry

const tools: McpToolPermissions = {
  name: 'files', scope: 'project', status: 'connected', default: null,
  tools: [{ name: 'delete_file', tool: 'mcp.files.delete_file', title: 'Delete file', description: 'Deletes a file', listed: true, annotations: { server: { destructiveHint: true } }, kind: 'destructive', sends_out: false, setting: null, decision: null, decision_source: 'mode', by_mode: {} }],
}

beforeEach(() => {
  vi.spyOn(engineApi, 'mcpList').mockResolvedValue({ servers: [notion, local] })
  vi.spyOn(engineApi, 'mcpCatalogList').mockResolvedValue({ version: 1, entries: [notionEntry, gmailEntry] })
  vi.spyOn(engineApi, 'mcpAuthStatus').mockResolvedValue({ name: 'notion', kind: 'oauth', signed_in: false, reauth_required: false, has_refresh_token: false, scopes: [] })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); resetConnectorEvents(); useSignIn.getState().close() })

function mount(capabilities: Record<string, boolean> = ALL) {
  return render(<I18nProvider lang="es"><ConnectorsView onChanged={() => {}} engineCapabilities={capabilities} /></I18nProvider>)
}
const card = (name: string) => document.querySelector(`[data-connector="${name}"]`) as HTMLElement
const findCard = (name: string) => waitFor(() => { const found = card(name); if (!found) throw new Error(`no card ${name}`); return found })

it('shows each connector with its chip, its real state and the plain-language hint', async () => {
  mount()
  await waitFor(() => expect(card('files')).toBeTruthy())
  const files = card('files')
  expect(within(files).getByText('MCP local')).toBeTruthy()
  expect(within(files).getByText('Este proyecto')).toBeTruthy()
  expect(within(files).getByText('Error')).toBeTruthy()
  expect(files.textContent).toContain('Comprueba que el programa esté instalado')
  expect(files.textContent).toContain('Rinari lo volverá a intentar solo.')
  const notionCard = card('notion')
  expect(within(notionCard).getByText('Notion')).toBeTruthy()
  expect(within(notionCard).getByText('MCP remoto')).toBeTruthy()
  expect(within(notionCard).getByText('Falta iniciar sesión')).toBeTruthy()
  expect(within(notionCard).getByText('Sin sesión iniciada')).toBeTruthy()
  // What asks something of the owner comes first; nothing says «connected».
  expect(document.body.textContent).not.toContain('Conectado')
})

it('reconnects and follows the state from the event, not from the click', async () => {
  const reconnect = vi.spyOn(engineApi, 'mcpReconnect').mockResolvedValue({ server: { ...local, status: 'connecting' } })
  mount()
  const user = userEvent.setup()
  await user.click(await within(await findCard('files')).findByRole('button', { name: 'Reconectar' }))
  expect(reconnect).toHaveBeenCalledWith('files')
  act(() => bridge.emitEngineEvent({ type: 'event', event: 'mcp.status.changed', payload: { name: 'files', status: 'connected', connection: { tools: 3, resources: false, attempts: 4 } } }))
  await waitFor(() => expect(within(card('files')).getByText('Conectado')).toBeTruthy())
  expect(card('files').textContent).toContain('3 herramientas')
})

it('signs in with progress from the events and says «signed in», not «connected»', async () => {
  const start = vi.spyOn(engineApi, 'mcpAuthStart').mockResolvedValue({ name: 'notion', flow_id: 'f1', authorize_url: 'https://auth.example/authorize?x=1', redirect_uri: 'http://127.0.0.1:5555/callback', browser_opened: true, client: 'registered' })
  mount()
  const user = userEvent.setup()
  await user.click(await within(await findCard('notion')).findByRole('button', { name: 'Iniciar sesión' }))
  expect(start).toHaveBeenCalledWith('notion')
  const dialog = await screen.findByTestId('connector-signin')
  expect(await within(dialog).findByText('Abrí tu navegador. Termina de iniciar sesión ahí.')).toBeTruthy()
  act(() => bridge.emitEngineEvent({ type: 'event', event: 'mcp.auth.progress', payload: { name: 'notion', flow_id: 'f1', stage: 'exchanging_code' } }))
  await waitFor(() => expect(dialog.querySelector('[data-state="current"]')?.textContent).toContain('Guardar la sesión'))
  act(() => bridge.emitEngineEvent({ type: 'event', event: 'mcp.auth.finished', payload: { name: 'notion', flow_id: 'f1', outcome: 'signed_in' } }))
  expect(await within(dialog).findByText('Sesión iniciada')).toBeTruthy()
  expect(dialog.textContent).toContain('Rinari está conectando el servidor')
})

it('cancels a pending sign-in and explains a refused one', async () => {
  vi.spyOn(engineApi, 'mcpAuthStart').mockResolvedValueOnce({ name: 'notion', flow_id: 'f2', authorize_url: 'https://auth.example/a', redirect_uri: 'http://127.0.0.1:5555/callback', browser_opened: false, client: 'registered' })
  const cancel = vi.spyOn(engineApi, 'mcpAuthCancel').mockResolvedValue({ name: 'notion', cancelled: true })
  mount()
  const user = userEvent.setup()
  await user.click(await within(await findCard('notion')).findByRole('button', { name: 'Iniciar sesión' }))
  const dialog = await screen.findByTestId('connector-signin')
  expect(await within(dialog).findByText(/No pude abrir el navegador/)).toBeTruthy()
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar inicio de sesión' }))
  expect(cancel).toHaveBeenCalledWith('notion')
  await waitFor(() => expect(screen.queryByTestId('connector-signin')).toBeNull())

  vi.spyOn(engineApi, 'mcpAuthStart').mockRejectedValueOnce({ code: 'MCP_AUTH_FAILED', message: 'no client', details: { code: 'OAUTH_CLIENT_REQUIRED', hint: 'oauth_client_required', message: 'needs a client' } })
  await user.click(within(card('notion')).getByRole('button', { name: 'Iniciar sesión' }))
  const failed = await screen.findByTestId('connector-signin')
  expect(await within(failed).findByText(/no deja que Rinari se registre solo/)).toBeTruthy()
})

it('sets Allow / Ask / Block per tool, the connector default and corrects an annotation', async () => {
  vi.spyOn(engineApi, 'mcpToolsList').mockResolvedValue({ server: tools })
  const set = vi.spyOn(engineApi, 'mcpToolsSet').mockImplementation(async (request) => ({ server: { ...tools, tools: [{ ...tools.tools[0], setting: request.decision ?? null, decision: request.decision ?? null, decision_source: 'tool' }] }, tool: tools.tools[0] }))
  const setDefault = vi.spyOn(engineApi, 'mcpToolsSetDefault').mockResolvedValue({ server: { ...tools, default: 'ask' } })
  vi.spyOn(engineApi, 'projectIntelligence').mockResolvedValue({ instructions: { trusted: true, scopes: [] } } as never)
  mount()
  const user = userEvent.setup()
  await user.click(await within(await findCard('files')).findByRole('button', { name: 'Detalles' }))
  const detail = await screen.findByTestId('connector-detail')
  const tool = await within(detail).findByText('Delete file')
  const row = tool.closest('[data-tool]') as HTMLElement
  expect(within(row).getByText('Destructiva')).toBeTruthy()
  await user.click(within(row).getByRole('radio', { name: 'Bloquear' }))
  expect(set).toHaveBeenCalledWith({ name: 'files', tool: 'delete_file', decision: 'deny', scope: 'project' })
  await waitFor(() => expect(within(row).getByRole('radio', { name: 'Bloquear' }).getAttribute('aria-checked')).toBe('true'))
  await user.click(within(row).getByRole('radio', { name: 'Por defecto' }))
  expect(set).toHaveBeenLastCalledWith({ name: 'files', tool: 'delete_file', decision: null, scope: 'project' })

  await user.click(within(screen.getByTestId('connector-default')).getByRole('radio', { name: 'Preguntar' }))
  expect(setDefault).toHaveBeenCalledWith({ name: 'files', decision: 'ask', scope: 'project' })

  await user.click(within(row).getByText('Anotaciones'))
  await user.click(within(row).getByRole('button', { name: /Puede borrar o cambiar datos/ }))
  await user.click(await screen.findByRole('menuitem', { name: 'No' }))
  expect(set).toHaveBeenLastCalledWith({ name: 'files', tool: 'delete_file', annotations: { destructiveHint: false }, scope: 'project' })

  // Scope: this project, its folder and whether it is trusted.
  await user.click(within(detail).getByRole('tab', { name: 'Conexión' }))
  const scope = await within(detail).findByTestId('connector-scope')
  expect(scope.textContent).toContain('Solo en este proyecto')
  expect(scope.textContent).toContain('C:/repo')
  expect(await within(scope).findByText('Carpeta de confianza')).toBeTruthy()
})

it('adds from the catalog and goes straight to sign in when nothing else is needed', async () => {
  const add = vi.spyOn(engineApi, 'mcpCatalogAdd').mockResolvedValue({ server: { ...notion, name: 'notion-2' }, entry_id: 'notion', next: 'sign_in' })
  vi.spyOn(engineApi, 'mcpAuthStart').mockReturnValue(new Promise(() => {}))
  mount()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Agregar conector' }))
  const catalog = await screen.findByTestId('connector-catalog')
  await user.click(await within(catalog).findByRole('button', { name: /Notion/ }))
  expect(within(catalog).getByText(/Ya lo tienes como notion/)).toBeTruthy()
  await user.click(within(catalog).getByRole('button', { name: 'Agregar e iniciar sesión' }))
  expect(add).toHaveBeenCalledWith({ id: 'notion' })
  expect(await screen.findByTestId('connector-signin')).toBeTruthy()
})

it('guides Google step by step, warns about the Developer Preview first and asks only for the own client', async () => {
  const add = vi.spyOn(engineApi, 'mcpCatalogAdd').mockResolvedValue({ server: { ...notion, name: 'google-gmail' }, entry_id: 'google-gmail', next: 'sign_in' })
  vi.spyOn(engineApi, 'mcpAuthStart').mockReturnValue(new Promise(() => {}))
  mount()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Agregar conector' }))
  const catalog = await screen.findByTestId('connector-catalog')
  await user.click(await within(catalog).findByRole('button', { name: /Gmail/ }))
  const notice = within(catalog).getByTestId('catalog-preview-notice')
  const guide = within(catalog).getByTestId('google-guide')
  expect(notice.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(guide.querySelectorAll('li')).toHaveLength(6)
  const submit = within(catalog).getByRole('button', { name: 'Agregar e iniciar sesión' })
  expect(submit).toHaveProperty('disabled', true)
  await user.type(within(catalog).getByLabelText('Client ID'), 'id-123.apps.googleusercontent.com')
  await user.type(within(catalog).getByLabelText('Client Secret'), 'GOCSPX-secret')
  await user.type(within(catalog).getByLabelText(/Puerto de redirección/), '8765')
  await user.click(submit)
  expect(add).toHaveBeenCalledWith({ id: 'google-gmail', client_id: 'id-123.apps.googleusercontent.com', client_secret: 'GOCSPX-secret', redirect_port: 8765 })
})

it('without the new capabilities it offers only what works: the manual form, no import', async () => {
  mount({ mcp_remote_v1: true })
  const user = userEvent.setup()
  await waitFor(() => expect(card('files')).toBeTruthy())
  expect(screen.queryByRole('button', { name: 'Importar de otra app' })).toBeNull()
  expect(within(card('notion')).queryByRole('button', { name: 'Iniciar sesión' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Agregar conector' }))
  const form = await screen.findByTestId('mcp-server-dialog')
  expect(within(form).queryByRole('radio', { name: 'Iniciar sesión (OAuth)' })).toBeNull()
})

it('«Probar» in the detail shows its result and its error there, one run at a time', async () => {
  vi.spyOn(engineApi, 'mcpToolsList').mockResolvedValue({ server: tools })
  vi.spyOn(engineApi, 'projectIntelligence').mockResolvedValue({ instructions: { trusted: true, scopes: [] } } as never)
  let finish!: (value: Awaited<ReturnType<typeof engineApi.mcpTest>>) => void
  const test = vi.spyOn(engineApi, 'mcpTest').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  mount()
  const user = userEvent.setup()
  await user.click(await within(await findCard('files')).findByRole('button', { name: 'Detalles' }))
  const detail = await screen.findByTestId('connector-detail')
  await user.click(within(detail).getByRole('tab', { name: 'Conexión' }))
  const probe = await within(detail).findByTestId('connector-detail-test')
  await user.click(probe)
  expect(probe).toHaveProperty('disabled', true)
  await user.click(probe)
  expect(test).toHaveBeenCalledTimes(1)
  await act(async () => { finish({ test: { ok: true, tools: 4, latency_ms: 12 } } as never) })
  expect(await within(detail).findByText(/4 herramientas/)).toBeTruthy()
  expect(probe).toHaveProperty('disabled', false)

  test.mockRejectedValueOnce({ code: 'MCP_SPAWN_FAILED', message: 'npx not found' })
  await user.click(probe)
  const failure = await within(detail).findByRole('alert')
  expect(failure.textContent).toContain('No se pudo arrancar el programa')
  expect(failure.textContent).toContain('npx not found')
})
