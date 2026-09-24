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
  workingCount: 0,
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

it('summarizes running and pending sessions and shows contextual content', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar
        {...base}
        selectedView="board"
        workingCount={2}
        attentionCount={1}
        boardAttentionCount={1}
        context={<span>Proyecto A</span>}
      />
    </I18nProvider>,
  )
  const status = screen.getByRole('status').textContent ?? ''
  expect(status).toContain('2 en ejecución')
  expect(status).toContain('1 pendientes de ti')
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

// El panel lateral tiene sus propias pestañas; en la barra basta un botón.
it('un solo botón para el panel lateral, sin accesos por superficie', () => {
  const onToggleDock = vi.fn()
  const { rerender } = render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} dockTargetAvailable dockOpen={false} onToggleDock={onToggleDock} />
    </I18nProvider>,
  )
  for (const name of ['Archivos', 'Navegador', 'Panel de Workspace']) {
    expect(screen.queryByRole('button', { name })).toBeNull()
  }
  const panel = screen.getByRole('button', { name: 'Panel lateral' })
  expect(panel.getAttribute('aria-pressed')).toBe('false')
  panel.click()
  expect(onToggleDock).toHaveBeenCalledOnce()

  rerender(
    <I18nProvider lang="es">
      <AppStatusBar {...base} dockTargetAvailable dockOpen onToggleDock={onToggleDock} />
    </I18nProvider>,
  )
  const open = screen.getByRole('button', { name: 'Panel lateral' })
  expect(open.getAttribute('aria-pressed')).toBe('true')
  // El estado activo no depende sólo del color: el marcador está en el DOM.
  expect(open.getAttribute('data-active')).toBe('true')
})

it('sin sesión destino el panel lateral está deshabilitado y dice por qué', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} dockTargetAvailable={false} />
    </I18nProvider>,
  )
  const panel = screen.getByRole('button', { name: 'Panel lateral' }) as HTMLButtonElement
  expect(panel.disabled).toBe(true)
  expect(panel.title).toBe('Necesitas una sesión activa')
})
