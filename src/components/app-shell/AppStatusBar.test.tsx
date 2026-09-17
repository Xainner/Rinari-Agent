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
  onExpandSidebar: vi.fn(),
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
