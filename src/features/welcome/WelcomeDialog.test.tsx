// @vitest-environment jsdom
// Bienvenida de primer uso (#71): nombre, usos con «Otro» y preferencias; se
// guarda en la memoria del usuario y todo se puede saltar.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'

const aboutSet = vi.fn(async (about: unknown) => ({ ...(about as object), updated_at: 'now' }))
vi.mock('../../services/engine', () => ({
  engineApi: { aboutSet: (about: unknown) => aboutSet(about), aboutGet: vi.fn(async () => ({ name: 'Xai', uses: ['code', 'Videos'], preferences: 'Corto', updated_at: 'x' })) },
  commandMessage: String,
}))
vi.mock('../rinari/art', () => ({ art: { chibi: () => '' } }))

import WelcomeDialog from './WelcomeDialog'

afterEach(() => { cleanup(); aboutSet.mockClear() })

it('asks the name, the uses (with «Otro») and how they like to work, and saves it', async () => {
  const onClose = vi.fn()
  render(<I18nProvider lang="es"><WelcomeDialog open onClose={onClose} /></I18nProvider>)
  await userEvent.type(screen.getByRole('textbox', { name: '¿Cómo te llamo?' }), 'Xai')
  await userEvent.click(screen.getByTestId('welcome-next'))
  await userEvent.click(screen.getByRole('button', { name: /Programar/ }))
  await userEvent.click(screen.getByRole('button', { name: /Otro/ }))
  await userEvent.type(screen.getByLabelText('Otro'), 'Videos, música')
  await userEvent.click(screen.getByTestId('welcome-next'))
  await userEvent.type(screen.getByRole('textbox', { name: /cómo te gusta trabajar/ }), 'Respuestas cortas')
  await userEvent.click(screen.getByTestId('welcome-finish'))
  await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
  expect(aboutSet).toHaveBeenCalledWith({ name: 'Xai', uses: ['code', 'Videos', 'música'], preferences: 'Respuestas cortas' })
})

it('«Saltar» closes without saving', async () => {
  const onClose = vi.fn()
  render(<I18nProvider lang="es"><WelcomeDialog open onClose={onClose} /></I18nProvider>)
  await userEvent.click(screen.getByTestId('welcome-skip'))
  expect(onClose).toHaveBeenCalledWith(false)
  expect(aboutSet).not.toHaveBeenCalled()
})

it('repeating it starts from what was told', async () => {
  render(<I18nProvider lang="es"><WelcomeDialog open repeat onClose={() => {}} /></I18nProvider>)
  await waitFor(() => expect((screen.getByRole('textbox', { name: '¿Cómo te llamo?' }) as HTMLInputElement).value).toBe('Xai'))
  await userEvent.click(screen.getByTestId('welcome-next'))
  expect(screen.getByRole('button', { name: /Programar/ }).getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByLabelText('Otro') as HTMLInputElement).value).toBe('Videos')
})
