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
    engineApi: {
      ...original.engineApi,
      contextStatus: (...args: unknown[]) => contextStatus(...args),
      artifactList: (...args: unknown[]) => artifactList(...args),
      scheduleList: vi.fn(async () => ({ tasks: [], now: 0 })),
    },
  }
})

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
afterEach(() => { cleanup(); useBranchNoticeStore.setState({ bySession: {} }) })

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

it('una tarjeta lleva a su vista: Contexto abre Insight y Resultados abre un archivo', async () => {
  artifactList.mockResolvedValue({ artifacts: [{ uri: 'artifact://a', name: 'informe.html' }] })
  mount()
  await userEvent.click(await screen.findByRole('button', { name: /^Contexto/ }))
  expect(useSessionDockStore.getState().layoutFor('ses_a').views).toEqual(['insight'])
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
