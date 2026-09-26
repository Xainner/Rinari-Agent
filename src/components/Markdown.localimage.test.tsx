// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { installMockPlatform } from '../test/mockPlatform'
import { I18nProvider } from '../i18n'
import Markdown from './Markdown'

installMockPlatform()
afterEach(cleanup)

const BS = String.fromCharCode(92)

it('a local image path says so instead of rendering broken', () => {
  const path = ['C:', 'Users', 'x', '.rinari', 'artifacts', 'shot.png'].join(BS)
  render(<I18nProvider lang="es"><Markdown>{`Mira: ![Captura](file://${path})`}</Markdown></I18nProvider>)
  expect(screen.getByText(/Imagen local no disponible en el chat: Captura/)).toBeTruthy()
  expect(document.querySelector('img')).toBeNull()
})
