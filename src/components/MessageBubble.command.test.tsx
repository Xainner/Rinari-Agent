// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { installMockPlatform } from '../test/mockPlatform'
import { I18nProvider } from '../i18n'
import MessageBubble, { withoutCommand } from './MessageBubble'

installMockPlatform()
afterEach(cleanup)

it('shows the skill as a chip instead of the raw /name', () => {
  render(<I18nProvider lang="es"><MessageBubble message={{ id: 'm1', role: 'user', content: '/lusamine-generate Hazme una imagen de Rinari', createdAt: 0, origin: { kind: 'user', command: 'lusamine-generate', command_kind: 'skill' } }} /></I18nProvider>)
  const chip = screen.getByTestId('command-chip')
  expect(chip.textContent).toContain('lusamine-generate')
  expect(chip.getAttribute('title')).toBe('Skill usada: lusamine-generate')
  const bubble = screen.getByTestId('user-message-bubble')
  expect(bubble.textContent).toContain('Hazme una imagen de Rinari')
  expect(bubble.textContent).not.toContain('/lusamine-generate')
})

it('a command without text is only the chip; a path is left alone', () => {
  render(<I18nProvider lang="es"><MessageBubble message={{ id: 'm2', role: 'user', content: '/review', createdAt: 0, origin: { kind: 'user', command: 'review', command_kind: 'command' } }} /></I18nProvider>)
  expect(screen.getByTestId('command-chip').getAttribute('title')).toBe('Comando usado: /review')
  expect(withoutCommand('/reviewer notes', 'review')).toBe('/reviewer notes')
  expect(withoutCommand('/review  el diff', 'review')).toBe('el diff')
})
