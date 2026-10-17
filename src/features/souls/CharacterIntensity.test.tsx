// @vitest-environment jsdom
// Personalidad (#87): la vista previa cambia al elegir el nivel, sin llamar al modelo.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'

vi.mock('../../services/engine', () => ({
  engineApi: {
    status: vi.fn(async () => ({ capabilities: { soul_character_intensity_v1: true } })),
    soulSettingsGet: vi.fn(async () => ({ settings: { character_intensity: 'minimal' } })),
    soulSettingsSet: vi.fn(async (level: string) => ({ settings: { character_intensity: level } })),
  },
  commandMessage: String,
}))
vi.mock('../rinari/RinariAvatar', () => ({ RinariAvatar: () => null }))

import CharacterIntensity from './CharacterIntensity'

afterEach(cleanup)

it('the preview speaks each level, and the error stays plain at every level', async () => {
  render(<I18nProvider lang="es"><CharacterIntensity /></I18nProvider>)
  const preview = await screen.findByTestId('soul-preview')
  expect(preview.textContent).toContain('Hola. ¿En qué te ayudo?')
  const error = preview.querySelector('[data-kind="error"]')?.textContent
  await userEvent.click(screen.getByRole('radio', { name: /completo/i }))
  await waitFor(() => expect(screen.getByTestId('soul-preview').dataset.level).toBe('full'))
  expect(screen.getByTestId('soul-preview').textContent).toContain('por fin apareces')
  expect(screen.getByTestId('soul-preview').querySelector('[data-kind="error"]')?.textContent).toBe(error)
})
