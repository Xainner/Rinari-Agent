// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import AppStatusBar from './AppStatusBar'

afterEach(cleanup)

const base = {
  onSelectView: vi.fn(),
  toggleShortcut: 'Ctrl+Shift+B',
  onOpenMobileSidebar: vi.fn(),
  onToggleSidebar: vi.fn(),
  sidebarCollapsed: false,
}

it('renders the selector without any conversation and reports real engine state', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} selectedView="chat" engineState="starting" workingCount={0} attentionCount={0} />
    </I18nProvider>,
  )
  expect(screen.getByRole('group', { name: 'Vista de trabajo' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('Motor iniciando')
  expect(screen.getByRole('status').textContent).not.toContain('en ejecución')
})

it('summarizes running and pending sessions and shows contextual content', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar
        {...base}
        selectedView="board"
        engineState="ready"
        workingCount={2}
        attentionCount={1}
        boardAttentionCount={1}
        context={<span>Proyecto A</span>}
      />
    </I18nProvider>,
  )
  const status = screen.getByRole('status').textContent ?? ''
  expect(status).toContain('Motor listo')
  expect(status).toContain('2 en ejecución')
  expect(status).toContain('1 pendientes de ti')
  expect(screen.getByText('Proyecto A')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Boards · 1 paneles/ }).getAttribute('aria-pressed')).toBe('true')
})

it('offers the sidebar expander only when collapsed', () => {
  const { rerender } = render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} selectedView="chat" engineState="ready" workingCount={0} attentionCount={0} />
    </I18nProvider>,
  )
  expect(screen.queryByRole('button', { name: 'Expandir barra' })).toBeNull()
  rerender(
    <I18nProvider lang="es">
      <AppStatusBar {...base} sidebarCollapsed selectedView="chat" engineState="ready" workingCount={0} attentionCount={0} />
    </I18nProvider>,
  )
  expect(screen.getByRole('button', { name: 'Expandir barra' })).toBeTruthy()
})

// M01 §3.4 — la barra superior es la única autoridad visible del sidebar.
//
// Antes sólo sabía expandir: el botón aparecía cuando el sidebar ya estaba
// colapsado, y colapsar vivía escondido dentro del campo de búsqueda. Por eso
// el control que se espera aquí parecía roto.
it('ofrece colapsar con el sidebar expandido y expandir con el colapsado', () => {
  const onToggleSidebar = vi.fn()
  const { rerender } = render(
    <I18nProvider lang="es">
      <AppStatusBar {...base} onToggleSidebar={onToggleSidebar} sidebarCollapsed={false} selectedView="chat" engineState="ready" workingCount={0} attentionCount={0} />
    </I18nProvider>,
  )
  const colapsar = screen.getByRole('button', { name: 'Colapsar barra' })
  expect(colapsar.getAttribute('aria-pressed')).toBe('true')
  colapsar.click()

  rerender(
    <I18nProvider lang="es">
      <AppStatusBar {...base} onToggleSidebar={onToggleSidebar} sidebarCollapsed selectedView="chat" engineState="ready" workingCount={0} attentionCount={0} />
    </I18nProvider>,
  )
  const expandir = screen.getByRole('button', { name: 'Expandir barra' })
  expect(expandir.getAttribute('aria-pressed')).toBe('false')
  expandir.click()

  // Los dos estados son el mismo control, no dos acciones distintas.
  expect(onToggleSidebar).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('button', { name: 'Colapsar barra' })).toBeNull()
})

// M01 §3.5 — accesos visibles a las tres superficies del dock.
const dockBase = {
  ...base,
  selectedView: 'chat' as const,
  engineState: 'ready' as const,
  workingCount: 0,
  attentionCount: 0,
}

it('sin sesión destino los tres accesos están deshabilitados y dicen por qué', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar {...dockBase} dockTargetAvailable={false} />
    </I18nProvider>,
  )
  for (const name of ['Archivos', 'Navegador', 'Panel de Workspace']) {
    const boton = screen.getByRole('button', { name }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    expect(boton.title).toBe('Necesitas una sesión activa')
  }
})

it('marca la superficie visible y deja las demás sin marcar', () => {
  const onToggleDockSurface = vi.fn()
  render(
    <I18nProvider lang="es">
      <AppStatusBar {...dockBase} dockTargetAvailable dockSurface="browser" onToggleDockSurface={onToggleDockSurface} />
    </I18nProvider>,
  )
  expect(screen.getByRole('button', { name: 'Navegador' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Archivos' }).getAttribute('aria-pressed')).toBe('false')
  // El estado activo no depende sólo del color: el marcador está en el DOM.
  expect(screen.getByRole('button', { name: 'Navegador' }).getAttribute('data-active')).toBe('true')

  screen.getByRole('button', { name: 'Archivos' }).click()
  expect(onToggleDockSurface).toHaveBeenCalledWith('files')
})

it('con el dock cerrado ninguna superficie aparece activa', () => {
  render(
    <I18nProvider lang="es">
      <AppStatusBar {...dockBase} dockTargetAvailable dockSurface={null} onToggleDockSurface={vi.fn()} />
    </I18nProvider>,
  )
  for (const name of ['Archivos', 'Navegador', 'Panel de Workspace']) {
    expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false')
  }
})
