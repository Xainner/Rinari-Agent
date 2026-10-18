// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import AppStatusBar from './AppStatusBar'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const base = {
  onSelectView: vi.fn(),
  toggleShortcut: 'Ctrl+Shift+B',
  onOpenMobileSidebar: vi.fn(),
  onToggleSidebar: vi.fn(),
  sidebarCollapsed: false,
  selectedView: 'chat' as const,
  attentionCount: 0,
}

function narrow(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

it('renders the selector without any conversation and no engine indicator', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} />
    </I18nProvider>,
  )
  expect(screen.getByRole('group', { name: 'Vista de trabajo' })).toBeTruthy()
  expect(document.body.textContent).not.toMatch(/Motor (listo|iniciando|con error)/)
  expect(screen.queryByRole('status')).toBeNull()
})

it('shows pending attention and context without an execution counter', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar
        {...base}
        selectedView="board"
        attentionCount={1}
        boardAttentionCount={1}
        context={<span>Proyecto A</span>}
      />
    </I18nProvider>,
  )
  const status = screen.getByRole('status').textContent ?? ''
  expect(status).not.toContain('en ejecución')
  expect(status).toContain('1 pendiente de ti')
  expect(screen.getByText('Proyecto A')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Boards · 1 paneles/ }).getAttribute('aria-pressed')).toBe('true')
})

// M01 §3.4 — la barra superior es la única autoridad visible del sidebar, y
// con un solo botón: antes eran dos y en escritorio el primero no hacía nada.
it('un solo botón colapsa con el sidebar expandido y expande con el colapsado', () => {
  const onToggleSidebar = vi.fn()
  const { rerender } = render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} onToggleSidebar={onToggleSidebar} sidebarCollapsed={false} />
    </I18nProvider>,
  )
  const colapsar = screen.getByRole('button', { name: 'Colapsar barra' })
  expect(colapsar.getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('button', { name: 'Abrir menú' })).toBeNull()
  colapsar.click()

  rerender(
    <I18nProvider lang="es">
      <AppStatusBar {...base} onToggleSidebar={onToggleSidebar} sidebarCollapsed />
    </I18nProvider>,
  )
  const expandir = screen.getByRole('button', { name: 'Expandir barra' })
  expect(expandir.getAttribute('aria-pressed')).toBe('false')
  expandir.click()
  expect(onToggleSidebar).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('button', { name: 'Colapsar barra' })).toBeNull()
})

it('por debajo del ancho de escritorio el mismo botón abre el cajón', () => {
  narrow(false)
  const onOpenMobileSidebar = vi.fn()
  const onToggleSidebar = vi.fn()
  render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} onOpenMobileSidebar={onOpenMobileSidebar} onToggleSidebar={onToggleSidebar} />
    </I18nProvider>,
  )
  screen.getByRole('button', { name: 'Abrir menú' }).click()
  expect(onOpenMobileSidebar).toHaveBeenCalledOnce()
  expect(onToggleSidebar).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /barra/ })).toBeNull()
})

// #47: los botones de las vistas los pone la app solo con una conversación; sin ellos no queda un botón genérico.
it('sin conversación no hay botones del panel lateral, ni el genérico de antes', () => {
  const { rerender } = render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} />
    </I18nProvider>,
  )
  expect(screen.queryByRole('button', { name: 'Panel lateral' })).toBeNull()
  rerender(
    <I18nProvider lang="es">
      <AppStatusBar {...base} dockViews={<div role="toolbar" aria-label="Vistas del panel lateral" />} />
    </I18nProvider>,
  )
  expect(screen.getByRole('toolbar', { name: 'Vistas del panel lateral' })).toBeTruthy()
})
