// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useComposerStore } from '../../stores/composer'
import { useUIStore } from '../../stores/ui'
import HomeWelcome from './HomeWelcome'
afterEach(cleanup)
beforeEach(() => { useComposerStore.setState({ text: '', attachments: [] }); useUIStore.setState({ showSuggestions: true }) })
function welcome(projectName: string | null = null) {
  return <I18nProvider lang="es"><HomeWelcome sessionId="test" context={{ projectName, changedFiles: null }} engineReady={false}><textarea aria-label="Borrador" /></HomeWelcome></I18nProvider>
}
it('prepares an editable draft, focuses the composer and prevents overwriting it', async () => {
  render(welcome())
  await userEvent.click(screen.getByRole('button', { name: /Ayúdame a planear/ }))
  expect(useComposerStore.getState().text).toContain('plan de implementación')
  expect(document.activeElement).toBe(screen.getByRole('textbox'))
  expect((screen.getByRole('button', { name: /Analiza este código/ }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Otras ideas' }) as HTMLButtonElement).disabled).toBe(true)
})
it('freezes suggestions while typing and updates after clearing the draft', () => {
  const { rerender } = render(welcome())
  act(() => useComposerStore.setState({ text: 'Mi trabajo' }))
  rerender(welcome('Rinari'))
  expect(screen.getByRole('button', { name: /Analiza este código/ })).toBeTruthy()
  expect(useComposerStore.getState().text).toBe('Mi trabajo')
  act(() => useComposerStore.setState({ text: '' }))
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

it('switching sessions remounts the conversation view so the enter transition replays', () => {
  // La clave replica a ChatView: cada sesión remonta la vista.
  const view = (id: string) => <I18nProvider lang="es"><HomeWelcome key={id} sessionId={id} context={{projectName:null,changedFiles:null}} engineReady conversationActive transcript={<p>Chat {id}</p>}><textarea aria-label="Ancla" /></HomeWelcome></I18nProvider>
  const rendered = render(view('a'))
  const composerA = screen.getByRole('textbox', {name:'Ancla'})
  expect(screen.getByText('Chat a')).toBeTruthy()
  rendered.rerender(view('b'))
  expect(screen.getByText('Chat b')).toBeTruthy()
  expect(screen.queryByText('Chat a')).toBeNull()
  // Al cambiar la clave remonta: el composer es nuevo y la animación de
  // entrada (transcript + composer) vuelve a ejecutarse.
  expect(screen.getByRole('textbox', {name:'Ancla'})).not.toBe(composerA)
})
