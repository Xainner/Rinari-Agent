// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, type McpImportCandidate } from '../../services/engine'
import { ImportDialog } from './ImportDialog'
import { ProjectOffersPrompt } from './ProjectOffersPrompt'
import { useProjectOffersCheck } from './connectorStore'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const candidate = (patch: Partial<McpImportCandidate>): McpImportCandidate => ({
  key: 'claude_desktop:github', name: 'github', source: 'claude_desktop', source_label: 'Claude Desktop', transport: 'stdio',
  command: ['npx', '-y', '@modelcontextprotocol/server-github'], url: '', secrets: [], warnings: [], importable: true, ...patch,
})

it('lists what other apps declare, imports only what is ticked and never shows a secret value', async () => {
  vi.spyOn(engineApi, 'mcpImportScan').mockResolvedValue({
    sources: [{ source: 'claude_desktop', label: 'Claude Desktop', path: 'C:/Users/x/AppData/Roaming/Claude/claude_desktop_config.json', found: true, servers: 3 }, { source: 'cursor', label: 'Cursor', path: 'C:/Users/x/.cursor/mcp.json', found: false, servers: 0 }],
    candidates: [
      candidate({ secrets: [{ where: 'env', name: 'GITHUB_TOKEN', kind: 'value' }] }),
      candidate({ key: 'claude_desktop:sse', name: 'old', transport: 'http', command: [], url: 'https://old.example/sse', importable: false, reason: 'legacy_sse_unsupported' }),
      candidate({ key: 'claude_desktop:planka', name: 'planka', suggested_name: 'planka-2', existing: 'planka', warnings: ['unresolved_variable:env.PLANKA_URL'] }),
    ],
  })
  const apply = vi.spyOn(engineApi, 'mcpImportApply').mockResolvedValue({ created: [{ key: 'claude_desktop:github', server: { name: 'github' } as never }], failed: [] })
  const imported = vi.fn()
  render(<I18nProvider lang="es"><ImportDialog open onClose={() => {}} onImported={imported} /></I18nProvider>)
  const dialog = await screen.findByTestId('connector-import')
  await within(dialog).findByText('github')
  expect(within(dialog).getByText('No encontrada')).toBeTruthy()
  expect(dialog.textContent).toContain('Trae secretos (GITHUB_TOKEN)')
  expect(dialog.textContent).toContain('Usa el transporte SSE antiguo')
  expect(dialog.textContent).toContain('Se deja fuera env.PLANKA_URL')
  expect(dialog.textContent).toContain('Ya lo tienes como «planka».')
  const submit = within(dialog).getByTestId('import-apply')
  expect(submit).toHaveProperty('disabled', true)
  const boxes = within(dialog).getAllByRole('checkbox')
  expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true)
  expect(boxes[1]).toHaveProperty('disabled', true)

  const user = userEvent.setup()
  await user.click(within(dialog).getByLabelText(/^github/))
  await user.click(submit)
  expect(apply).toHaveBeenCalledWith({ keys: ['claude_desktop:github'], names: undefined, json: undefined })
  expect(await within(dialog).findByText('Importado')).toBeTruthy()
  expect(imported).toHaveBeenCalled()
})

it('reads a pasted mcpServers JSON as text and imports from that same text', async () => {
  const scan = vi.spyOn(engineApi, 'mcpImportScan').mockImplementation(async (input) => (input?.json
    ? { sources: [], candidates: [candidate({ key: 'pasted:linear', name: 'linear', source: 'pasted', transport: 'http', command: [], url: 'https://mcp.linear.app/mcp' })] }
    : { sources: [], candidates: [] }))
  const apply = vi.spyOn(engineApi, 'mcpImportApply').mockResolvedValue({ created: [], failed: [{ key: 'pasted:linear', code: 'INVALID_PARAMS', message: 'name taken' }] })
  render(<I18nProvider lang="es"><ImportDialog open onClose={() => {}} onImported={() => {}} /></I18nProvider>)
  const dialog = await screen.findByTestId('connector-import')
  const user = userEvent.setup()
  await user.click(within(dialog).getByRole('tab', { name: 'Pegar JSON' }))
  const json = '{"mcpServers":{"linear":{"url":"https://mcp.linear.app/mcp"}}}'
  await user.click(within(dialog).getByLabelText('Configuración mcpServers'))
  await user.paste(json)
  await user.click(within(dialog).getByRole('button', { name: 'Leer' }))
  expect(scan).toHaveBeenLastCalledWith({ json })
  await user.click(await within(dialog).findByLabelText(/^linear/))
  await user.click(within(dialog).getByTestId('import-apply'))
  expect(apply).toHaveBeenCalledWith({ keys: ['pasted:linear'], names: undefined, json })
  expect(await within(dialog).findByText('name taken')).toBeTruthy()
})

it('asks once per server a trusted folder brings, and records only what was answered', async () => {
  vi.spyOn(engineApi, 'mcpProjectOffersList').mockResolvedValue({
    project: 'C:/repo', trusted: true, answered: 0,
    offers: [
      candidate({ key: 'db', name: 'db', source: 'project', path: 'C:/repo/.mcp.json', secrets: [{ where: 'env', name: 'DB_PASSWORD', kind: 'value' }] }),
      candidate({ key: 'web', name: 'web', source: 'project', path: 'C:/repo/.mcp.json', transport: 'http', command: [], url: 'https://web.example/mcp', changed: true, previous_decision: 'rejected' }),
    ],
  })
  const decide = vi.spyOn(engineApi, 'mcpProjectOffersDecide').mockResolvedValue({ project: 'C:/repo', created: [{ key: 'db', server: { name: 'db' } as never }], failed: [], rejected: [] })
  render(<I18nProvider lang="es"><ProjectOffersPrompt root="C:/repo" enabled /></I18nProvider>)
  const dialog = await screen.findByTestId('project-offers')
  expect(within(dialog).getByText('Esta carpeta trae 2 servidores MCP')).toBeTruthy()
  expect(dialog.textContent).toContain('DB_PASSWORD')
  expect(within(dialog).getByText('Cambió desde que respondiste')).toBeTruthy()
  const save = within(dialog).getByTestId('offers-save')
  expect(save).toHaveProperty('disabled', true)
  const user = userEvent.setup()
  const db = dialog.querySelector('[data-key="db"]') as HTMLElement
  await user.click(within(db).getByRole('radio', { name: 'Usar en este proyecto' }))
  await user.click(save)
  expect(decide).toHaveBeenCalledWith('C:/repo', [{ key: 'db', accept: true }])
  await waitFor(() => expect(screen.queryByTestId('project-offers')).toBeNull())
})

it('an untrusted folder offers nothing, and trusting it asks again', async () => {
  const list = vi.spyOn(engineApi, 'mcpProjectOffersList').mockResolvedValueOnce({ project: 'C:/repo', trusted: false, answered: 0, offers: [] })
  render(<I18nProvider lang="es"><ProjectOffersPrompt root="C:/repo" enabled /></I18nProvider>)
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  expect(screen.queryByTestId('project-offers')).toBeNull()
  list.mockResolvedValueOnce({ project: 'C:/repo', trusted: true, answered: 0, offers: [candidate({ key: 'db', name: 'db', source: 'project' })] })
  useProjectOffersCheck.getState().check('C:/repo')
  expect(await screen.findByTestId('project-offers')).toBeTruthy()
})

it('does not ask without the catalog capability', async () => {
  const list = vi.spyOn(engineApi, 'mcpProjectOffersList')
  render(<I18nProvider lang="es"><ProjectOffersPrompt root="C:/repo" enabled={false} /></I18nProvider>)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(list).not.toHaveBeenCalled()
})
