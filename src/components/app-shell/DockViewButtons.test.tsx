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
  for (const name of ['Navegador', 'Terminal', 'Archivos', 'Cambios', 'Más vistas']) {
    expect(within(bar).getByRole('button', { name })).toBeTruthy()
  }
  // Agentes y Flujos van en el menú «⋮», de puntos en vertical.
  expect(within(bar).queryByRole('button', { name: 'Agentes' })).toBeNull()
  expect(within(bar).queryByRole('button', { name: 'Flujo' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Más vistas' }).querySelector('svg')?.getAttribute('class')).toContain('ellipsis-vertical')
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

it('el menú «⋮» abre Agentes, Flujos e Insight como vistas del mosaico; Tareas y Verificación ya no están', async () => {
  mount()
  expect(screen.queryByRole('button', { name: 'Agentes' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Flujo' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Más vistas' }))
  expect(screen.queryByRole('menuitemcheckbox', { name: /Verificación|Tareas/ })).toBeNull()
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Agentes/ }))
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(layout().views).toEqual(['agents'])
  await userEvent.click(screen.getByRole('button', { name: 'Más vistas' }))
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Flujo/ }))
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(layout().views).toEqual(['agents', 'flow'])
})

it('con cuatro abiertas, una quinta pregunta cuál reemplazar y ocupa su sitio', async () => {
  mount()
  for (const name of ['Navegador', 'Terminal', 'Archivos', 'Cambios']) await userEvent.click(screen.getByRole('button', { name }))
  await userEvent.click(screen.getByRole('button', { name: 'Más vistas' }))
  await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Agentes/ }))
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
  // Agentes y Flujos avisan desde el botón del menú: su punto (ámbar si algo te necesita) y su nombre.
  const more = screen.getByRole('button', { name: /^Más vistas · / })
  expect(more.getAttribute('aria-label')).toContain('una etapa te necesita')
  expect(more.querySelector('.dock-view-dot')?.getAttribute('data-tone')).toBe('warning')
})

it('en una ventana estrecha quedan las vistas abiertas o con aviso, y el resto pasa a «Más»', async () => {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes('1099'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  try {
    useSessionDockStore.getState().openView('ses_a', 'changes')
    useDockSignalsStore.getState().publish('ses_a', { agents: 1 })
    mount()
    const bar = screen.getByRole('toolbar', { name: 'Vistas del panel lateral' })
    expect(within(bar).getAllByRole('button').map((button) => button.getAttribute('data-view'))).toEqual(['summary', 'changes', 'more'])
    await userEvent.click(screen.getByRole('button', { name: /^Más vistas/ }))
    expect(await screen.findByRole('menuitemcheckbox', { name: /Navegador/ })).toBeTruthy()
    expect(screen.getByRole('menuitemcheckbox', { name: /Agentes/ })).toBeTruthy()
    expect(screen.getByRole('menuitemcheckbox', { name: /Flujo/ })).toBeTruthy()
    // «Contexto y uso» (Insight) salió del panel con el #78.
    expect(screen.queryByRole('menuitemcheckbox', { name: /Insight/ })).toBeNull()
  } finally {
    window.matchMedia = original
  }
})

// #82: el Resumen es el primero del grupo y flota aparte: no toca las vistas del panel.
it('«Resumen» se abre y se cierra sin cambiar las vistas del panel', async () => {
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Navegador' }))
  const summary = screen.getByRole('button', { name: 'Resumen' })
  await userEvent.click(summary)
  expect(summary.getAttribute('aria-pressed')).toBe('true')
  expect(layout()).toMatchObject({ visible: true, views: ['browser'] })
  expect(screen.getByRole('button', { name: 'Navegador' }).getAttribute('aria-pressed')).toBe('true')
  // Abrir otra vista no cierra el resumen.
  await userEvent.click(screen.getByRole('button', { name: 'Terminal' }))
  expect(layout()).toMatchObject({ visible: true, views: ['browser', 'terminal'] })
  expect(summary.getAttribute('aria-pressed')).toBe('true')
  await userEvent.click(summary)
  expect(summary.getAttribute('aria-pressed')).toBe('false')
  expect(layout()).toMatchObject({ visible: true, views: ['browser', 'terminal'] })
})

it('un cambio de rama enciende el Resumen y lo dice en su nombre', async () => {
  const { useBranchNoticeStore } = await import('../../stores/branchNotice')
  useBranchNoticeStore.getState().set('ses_a', { from: 'main', to: 'fix/x', reference: 'last_work', since: null } as never)
  mount()
  expect(screen.getByRole('button', { name: 'Resumen · la rama cambió' })).toBeTruthy()
  useBranchNoticeStore.getState().clear('ses_a')
})
