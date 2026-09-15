// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useComposerStore } from '../../stores/composer'
import { useUIStore } from '../../stores/ui'
import HomeWelcome from './HomeWelcome'
afterEach(cleanup)
// El home lee el borrador por clave de sesión (`draftsBySession`), no el espejo global.
const draftOf = (key = 'test') => useComposerStore.getState().getDraft(key)
beforeEach(() => { useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} }); useUIStore.setState({ showSuggestions: true }) })
function welcome(projectName: string | null = null) {
  return <I18nProvider lang="es"><HomeWelcome sessionId="test" context={{ projectName, changedFiles: null }} engineReady={false}><textarea aria-label="Borrador" /></HomeWelcome></I18nProvider>
}
it('prepares an editable draft, focuses the composer and prevents overwriting it', async () => {
  render(welcome())
  await userEvent.click(screen.getByRole('button', { name: /Ayúdame a planear/ }))
  expect(draftOf().text).toContain('plan de implementación')
  // La instancia Normal no ha movido el espejo: otra clave sigue vacía.
  expect(draftOf('draft').text).toBe('')
  expect(document.activeElement).toBe(screen.getByRole('textbox'))
  expect((screen.getByRole('button', { name: /Analiza este código/ }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Otras ideas' }) as HTMLButtonElement).disabled).toBe(true)
})
it('freezes suggestions while typing and updates after clearing the draft', () => {
  const { rerender } = render(welcome())
  act(() => useComposerStore.getState().setTextFor('test', 'Mi trabajo'))
  rerender(welcome('Rinari'))
  expect(screen.getByRole('button', { name: /Analiza este código/ })).toBeTruthy()
  expect(draftOf().text).toBe('Mi trabajo')
  act(() => useComposerStore.getState().clearFor('test'))
  expect(screen.getByRole('button', { name: /Entender este proyecto/ })).toBeTruthy()
})
it('rotates applicable ideas and respects the hidden-suggestions preference', async () => {
  render(welcome())
  await userEvent.click(screen.getByRole('button', { name: 'Otras ideas' }))
  expect(screen.getByRole('button', { name: /Comparar alternativas/ })).toBeTruthy()
  act(() => useUIStore.setState({ showSuggestions: false }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Ideas para comenzar' })).toBeNull())
})

it('preserves the same composer DOM and focus when entering the conversation', async () => {
  const content = (active: boolean) => <I18nProvider lang="es"><HomeWelcome sessionId="test" context={{projectName:null,changedFiles:null}} engineReady conversationActive={active} transcript={<p>Respuesta</p>}><textarea aria-label="Composer persistente" defaultValue="Borrador" /></HomeWelcome></I18nProvider>
  const { rerender } = render(content(false))
  const composer = screen.getByRole('textbox', {name:'Composer persistente'})
  composer.focus()
  rerender(content(true))
  expect(screen.getByRole('textbox', {name:'Composer persistente'})).toBe(composer)
  expect(document.activeElement).toBe(composer)
  await waitFor(() => expect(screen.queryByRole('heading', {name:'¿En qué te ayudo hoy?'})).toBeNull())
  expect(screen.getByText('Respuesta')).toBeTruthy()
  rerender(content(false))
  expect(screen.getByRole('textbox', {name:'Composer persistente'})).toBe(composer)
})
