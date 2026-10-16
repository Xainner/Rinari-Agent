// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { resetSessionDockForTests, useSessionDockStore } from '../../stores/sessionDock'
import { useDockSignalsStore } from '../../stores/dockSignals'
import DockViewButtons from './DockViewButtons'

const layout = () => useSessionDockStore.getState().layoutFor('ses_a')
function mount(terminalEnabled = true) {
  return render(<I18nProvider lang="es"><DockViewButtons sessionId="ses_a" terminalEnabled={terminalEnabled} /></I18nProvider>)
}

beforeEach(() => {
  window.localStorage.clear()
  resetSessionDockForTests()
  useDockSignalsStore.setState({ bySession: {} })
})
afterEach(cleanup)

it('un botón por vista; un clic la abre y otro la cierra, y el pulsado lo dice', async () => {
  mount()
  const bar = screen.getByRole('toolbar', { name: 'Vistas del panel lateral' })
  for (const name of ['Navegador', 'Terminal', 'Archivos', 'Cambios', 'Agentes', 'Flujo', 'Más vistas']) {
    expect(within(bar).getByRole('button', { name })).toBeTruthy()
  }
  await userEvent.click(screen.getByRole('button', { name: 'Navegador' }))
  expect(layout()).toMatchObject({ visible: true, views: ['browser'] })
  expect(screen.getByRole('button', { name: 'Navegador' }).getAttribute('aria-pressed')).toBe('true')
  await userEvent.click(screen.getByRole('button', { name: 'Navegador' }))
  expect(layout().views).toEqual([])
})

it('sin terminal del Engine no hay botón Terminal', () => {
  mount(false)
  expect(screen.queryByRole('button', { name: 'Terminal' })).toBeNull()
})

it('«Más» abre Tareas, Verificación e Insight como vistas del mosaico', async () => {
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Más vistas' }))
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Verificación/ }))
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(layout().views).toEqual(['verification'])
})

it('con cuatro abiertas, una quinta pregunta cuál reemplazar y ocupa su sitio', async () => {
  mount()
  for (const name of ['Navegador', 'Terminal', 'Archivos', 'Cambios']) await userEvent.click(screen.getByRole('button', { name }))
  await userEvent.click(screen.getByRole('button', { name: 'Agentes' }))
  const prompt = (await screen.findByText('Ya hay cuatro vistas abiertas')).closest('.dock-replace') as HTMLElement
  expect(layout().views).toEqual(['browser', 'terminal', 'files', 'changes'])
  await userEvent.click(within(prompt).getByRole('button', { name: 'Terminal' }))
  expect(layout().views).toEqual(['browser', 'agents', 'files', 'changes'])
})

it('los indicadores vivos se dicen también en el nombre del botón', () => {
  useDockSignalsStore.getState().publish('ses_a', { browser: 'agent', terminal: 1, changes: 3, agents: 2, flowNeedsYou: true })
  mount()
  expect(screen.getByRole('button', { name: 'Navegador · Rinari está usando la página' }).dataset.ring).toBe('agent')
  expect(screen.getByRole('button', { name: /^Terminal · / })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Cambios · 3 archivos cambiados' }).textContent).toContain('3')
  expect(screen.getByRole('button', { name: /^Agentes · / }).textContent).toContain('2')
  expect(screen.getByRole('button', { name: 'Flujo · una etapa te necesita' })).toBeTruthy()
})

it('en una ventana estrecha quedan las vistas abiertas o con aviso, y el resto pasa a «Más»', async () => {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes('1099'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  try {
    useSessionDockStore.getState().openView('ses_a', 'changes')
    useDockSignalsStore.getState().publish('ses_a', { agents: 1 })
    mount()
    const bar = screen.getByRole('toolbar', { name: 'Vistas del panel lateral' })
    expect(within(bar).getAllByRole('button').map((button) => button.getAttribute('data-view') ?? button.getAttribute('aria-label'))).toEqual(['summary', 'changes', 'agents', 'Más vistas'])
    await userEvent.click(screen.getByRole('button', { name: 'Más vistas' }))
    expect(await screen.findByRole('menuitemcheckbox', { name: /Navegador/ })).toBeTruthy()
    expect(screen.getByRole('menuitemcheckbox', { name: /Insight/ })).toBeTruthy()
  } finally {
    window.matchMedia = original
  }
})

// #82: el Resumen es el primero del grupo; o está el resumen, o las vistas.
it('«Resumen» se muestra en lugar de las vistas y vuelve el mosaico al quitarlo', async () => {
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Navegador' }))
  await userEvent.click(screen.getByRole('button', { name: 'Resumen' }))
  expect(layout()).toMatchObject({ visible: true, summary: true, views: ['browser'] })
  expect(screen.getByRole('button', { name: 'Navegador' }).getAttribute('aria-pressed')).toBe('false')
  // Abrir otra vista cierra el resumen y guarda el mosaico.
  await userEvent.click(screen.getByRole('button', { name: 'Terminal' }))
  expect(layout()).toMatchObject({ summary: false, views: ['browser', 'terminal'] })
  await userEvent.click(screen.getByRole('button', { name: 'Resumen' }))
  await userEvent.click(screen.getByRole('button', { name: 'Resumen' }))
  expect(layout()).toMatchObject({ visible: true, summary: false, views: ['browser', 'terminal'] })
})

it('un cambio de rama enciende el Resumen y lo dice en su nombre', async () => {
  const { useBranchNoticeStore } = await import('../../stores/branchNotice')
  useBranchNoticeStore.getState().set('ses_a', { from: 'main', to: 'fix/x', reference: 'last_work', since: null } as never)
  mount()
  expect(screen.getByRole('button', { name: 'Resumen · la rama cambió' })).toBeTruthy()
  useBranchNoticeStore.getState().clear('ses_a')
})
