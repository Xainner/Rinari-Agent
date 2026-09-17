// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import WorkspaceViewSwitcher from './WorkspaceViewSwitcher'

afterEach(cleanup)

it('exposes Normal and Boards as pressed buttons and selects idempotently', async () => {
  const onSelect = vi.fn()
  render(
    <I18nProvider lang="es">
      <WorkspaceViewSwitcher selected="board" onSelect={onSelect} toggleShortcut="Ctrl+Shift+B" attentionCount={2} />
    </I18nProvider>,
  )
  const normal = screen.getByRole('button', { name: 'Normal' })
  const boards = screen.getByRole('button', { name: /Boards · 2 paneles requieren atención/ })
  expect(normal.getAttribute('aria-pressed')).toBe('false')
  expect(boards.getAttribute('aria-pressed')).toBe('true')
  expect(boards.getAttribute('title')).toContain('Ctrl+Shift+B')
  const user = userEvent.setup()
  await user.click(boards)
  expect(onSelect).toHaveBeenCalledWith('board')
  await user.click(normal)
  expect(onSelect).toHaveBeenCalledWith('chat')
  expect(onSelect).toHaveBeenCalledTimes(2)
})

it('shows no pressed segment while an auxiliary view is open', () => {
  render(
    <I18nProvider lang="es">
      <WorkspaceViewSwitcher selected={null} onSelect={vi.fn()} toggleShortcut="Ctrl+Shift+B" />
    </I18nProvider>,
  )
  expect(screen.getByRole('button', { name: 'Normal' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button', { name: 'Boards' }).getAttribute('aria-pressed')).toBe('false')
})
