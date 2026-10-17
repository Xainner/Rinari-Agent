// @vitest-environment jsdom
// Plan 0.4.0 #82: el Resumen enseña solo las tarjetas que tienen algo, llevan
// a su vista, y el «⋯» elige cuáles se ven y en qué orden.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const contextStatus = vi.fn()
const artifactList = vi.fn()
vi.mock('../../services/engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/engine')>()
  return {
    ...original,
    onEngineEvent: vi.fn(async () => () => undefined),
    engineApi: {
      ...original.engineApi,
      contextStatus: (...args: unknown[]) => contextStatus(...args),
      artifactList: (...args: unknown[]) => artifactList(...args),
      scheduleList: vi.fn(async () => ({ tasks: [], now: 0 })),
      sessionSummary: (...args: unknown[]) => sessionSummary(...args),
      repoStatus: (...args: unknown[]) => repoStatus(...args),
    },
  }
})
const sessionSummary = vi.fn()
const repoStatus = vi.fn()
const engineData: { current: unknown } = { current: null }
vi.mock('../engine/EngineContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('../engine/EngineContext')>()
  return { ...original, useOptionalEngineData: () => engineData.current }
})
const openUrl = vi.fn(async () => undefined)
const navigate = vi.fn(async () => undefined)
const showUsageReport = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../usage/usageReport', () => ({ showUsageReport }))
vi.mock('../../platform', () => ({ platform: () => ({ opener: { openUrl }, browser: { navigate } }) }))

import { I18nProvider } from '../../i18n'
import { sessionFixture } from '../board/testUtils'
import { resetSessionDockForTests, useSessionDockStore } from '../../stores/sessionDock'
import { useBranchNoticeStore } from '../../stores/branchNotice'
import SummaryPanel from './SummaryPanel'

function mount() {
  return render(<I18nProvider lang="es"><SummaryPanel sessionId="ses_a" record={sessionFixture('ses_a', 'Charla')} onClose={vi.fn()} /></I18nProvider>)
}

beforeEach(() => {
  window.localStorage.clear()
  resetSessionDockForTests()
  contextStatus.mockReset()
  artifactList.mockReset()
  contextStatus.mockResolvedValue({ window_tokens: 1000, last_request: { input_tokens: 420, at: '' } })
  artifactList.mockResolvedValue({ artifacts: [] })
})
afterEach(() => { cleanup(); useBranchNoticeStore.setState({ bySession: {} }); engineData.current = null; openUrl.mockClear(); navigate.mockClear() })

function withEngine(capabilities: Record<string, boolean>) {
  engineData.current = { status: { capabilities }, projects: [], projectStatusByRoot: {}, models: [], busySessionIds: new Set() }
}

it('Fuentes y Conectores salen del resumen del Engine; una página se abre en el panel', async () => {
  withEngine({ session_summary_v1: true })
  sessionSummary.mockResolvedValue({
    sources: { pages: [{ url: 'https://docs.example.com/a', title: 'Guía A' }], searches: [{ query: 'electron dock' }], mcp: [], total: 2 },
    results: [{ path: 'C:/p/out.md', name: 'out.md', kind: 'file', exists: true }, { path: 'C:/p/gone.md', name: 'gone.md', exists: false }],
    connectors: { mcp: [{ name: 'planka', connected: true }], skills: [{ name: 'pdf' }] },
    background: { processes: [], scheduled: [] },
  })
  mount()
  const sources = await screen.findByRole('region', { name: 'Fuentes' })
  expect(sources.textContent).toContain('Buscó: electron dock')
  await userEvent.click(within(sources).getByRole('button', { name: 'Guía A' }))
  expect(useSessionDockStore.getState().layoutFor('ses_a').views).toContain('browser')
  expect(navigate).toHaveBeenCalledWith('ses_a', 'https://docs.example.com/a')
  const connectors = screen.getByRole('region', { name: 'Conectores' })
  expect(connectors.textContent).toContain('planka')
  expect(connectors.textContent).toContain('Skills: pdf')
  // Un resultado que ya no existe no se ofrece.
  const results = screen.getByRole('region', { name: 'Resultados' })
  expect(results.textContent).toContain('out.md')
  expect(results.textContent).not.toContain('gone.md')
})

it('Cambios enseña los PR de la rama y «Crear PR» abre GitHub si no hay gh', async () => {
  withEngine({ repo_status_v1: true })
  repoStatus.mockResolvedValue({ available: true, root: 'C:/p', branch: 'feat/x', ahead: 2, behind: 0, dirty: false, changed: 0, github: { owner: 'o', repo: 'r' }, gh: 'missing', prs: [] })
  render(<I18nProvider lang="es"><SummaryPanel sessionId="ses_a" record={{ ...sessionFixture('ses_a', 'Charla'), project_root: 'C:/p' }} onClose={vi.fn()} /></I18nProvider>)
  expect((await screen.findByRole('region', { name: 'Entorno' })).textContent).toContain('↑2')
  await userEvent.click(await screen.findByRole('button', { name: /Crear PR en GitHub/ }))
  expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/compare/feat%2Fx?expand=1')
})

it('con un PR abierto no ofrece otro y enseña su estado', async () => {
  withEngine({ repo_status_v1: true })
  repoStatus.mockResolvedValue({ available: true, root: 'C:/p', branch: 'feat/x', github: { owner: 'o', repo: 'r' }, gh: 'ready', prs: [{ number: 7, title: 'Dock', state: 'open', url: 'https://github.com/o/r/pull/7', checks: 'failure' }] })
  render(<I18nProvider lang="es"><SummaryPanel sessionId="ses_a" record={{ ...sessionFixture('ses_a', 'Charla'), project_root: 'C:/p' }} onClose={vi.fn()} /></I18nProvider>)
  const changes = await screen.findByRole('region', { name: 'Cambios' })
  expect(changes.textContent).toContain('#7 Dock')
  expect(changes.textContent).toContain('CI en rojo')
  expect(within(changes).queryByRole('button', { name: /Crear PR/ })).toBeNull()
})

it('sale cada tarjeta solo si tiene algo; sin proyecto lo dice', async () => {
  mount()
  const panel = screen.getByTestId('summary-panel')
  expect(within(panel).getByRole('region', { name: 'Entorno' }).textContent).toContain('Sin proyecto')
  expect(await within(panel).findByRole('region', { name: 'Contexto' })).toBeTruthy()
  expect(within(panel).getByText('42%')).toBeTruthy()
  // Nada entregado, ni agentes, ni cambios: esas tarjetas no aparecen vacías.
  expect(within(panel).queryByRole('region', { name: 'Resultados' })).toBeNull()
  expect(within(panel).queryByRole('region', { name: 'Agentes' })).toBeNull()
  expect(within(panel).queryByRole('region', { name: 'Cambios' })).toBeNull()
})

it('una tarjeta lleva a su vista: Contexto pinta el informe de uso y Resultados abre un archivo', async () => {
  artifactList.mockResolvedValue({ artifacts: [{ uri: 'artifact://a', name: 'informe.html' }] })
  mount()
  await userEvent.click(await screen.findByRole('button', { name: /^Contexto/ }))
  expect(showUsageReport).toHaveBeenCalledWith('ses_a')
  expect(useSessionDockStore.getState().layoutFor('ses_a').views).toEqual([])
  expect(await screen.findByRole('region', { name: 'Resultados' })).toBeTruthy()
  expect(screen.getByText('informe.html')).toBeTruthy()
})

it('el cambio de rama deja una línea ámbar en Entorno', () => {
  useBranchNoticeStore.getState().set('ses_a', { from: 'main', to: 'fix/x', reference: 'last_work', since: null } as never)
  mount()
  expect(screen.getByRole('region', { name: 'Entorno' }).querySelector('.summary-warning')).toBeTruthy()
})

it('el «⋯» oculta una tarjeta y cambia el orden, y se recuerda', async () => {
  const view = mount()
  await screen.findByRole('region', { name: 'Contexto' })
  await userEvent.click(screen.getByRole('button', { name: 'Elegir tarjetas' }))
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Contexto' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Contexto' })).toBeNull())
  await userEvent.click(screen.getByRole('button', { name: 'Bajar Entorno' }))
  view.unmount()
  mount()
  expect(screen.queryByRole('region', { name: 'Contexto' })).toBeNull()
  const stored = JSON.parse(window.localStorage.getItem('rinari.summary.cards.v1') ?? '{}') as { order: string[]; hidden: string[] }
  expect(stored.hidden).toEqual(['context'])
  expect(stored.order.slice(0, 2)).toEqual(['context', 'env'])
})

it('plegar una tarjeta deja su cabecera', async () => {
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Plegar Entorno' }))
  expect(screen.getByRole('region', { name: 'Entorno' }).dataset.collapsed).toBe('true')
  expect(screen.getByRole('button', { name: 'Desplegar Entorno' })).toBeTruthy()
})
