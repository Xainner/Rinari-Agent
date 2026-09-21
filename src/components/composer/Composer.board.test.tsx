// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useComposerStore } from '../../stores/composer'
import Composer from './Composer'


afterEach(cleanup)
beforeEach(() => {
  window.localStorage.clear()
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})

function pane(sessionId: string, options: { focused: boolean; onSend?: (text: string) => Promise<boolean> }) {
  return (
    <Composer
      placement="bottom"
      sessionId={sessionId}
      primary={false}
      acceptsGlobalFocus={options.focused}
      onSend={async (text) => (options.onSend ? options.onSend(text) : true)}
      isStreaming={false}
      onStop={vi.fn()}
      models={[]}
      activeAlias=""
      onUseModel={vi.fn()}
      onDiscoverModels={vi.fn()}
      onOpenProviders={vi.fn()}
      sessionMode="build"
      onModeChange={vi.fn()}
      reasoningEffort="off"
      onReasoningChange={vi.fn()}
      permissionProfile="workspace"
      effectivePermissionProfile="workspace"
      permissionProfilesV2
      onPermissionChange={vi.fn()}
      onSearchFiles={async () => ({ root: '/', files: [] })}
    />
  )
}

it('keeps two mounted composers on separate drafts, including send and the legacy mirror', async () => {
  const sentA = vi.fn(async () => true)
  render(
    <I18nProvider lang="es">
      <section aria-label="A">{pane('ses_a', { focused: true, onSend: sentA })}</section>
      <section aria-label="B">{pane('ses_b', { focused: false })}</section>
    </I18nProvider>,
  )
  const user = userEvent.setup()
  const [textareaA, textareaB] = screen.getAllByRole('textbox', { name: 'Mensaje' })
  await user.type(textareaA, 'hola desde A')
  await user.type(textareaB, 'hola desde B')

  const store = useComposerStore.getState()
  expect(store.getDraft('ses_a').text).toBe('hola desde A')
  expect(store.getDraft('ses_b').text).toBe('hola desde B')
  // Board composers never move the Normal mirror.
  expect(store.sessionKey).toBe('draft')
  expect(store.text).toBe('')

  await user.click(screen.getAllByRole('button', { name: 'Enviar mensaje' })[0])
  expect(sentA).toHaveBeenCalledWith('hola desde A')
  expect(useComposerStore.getState().getDraft('ses_a').text).toBe('')
  expect(useComposerStore.getState().getDraft('ses_b').text).toBe('hola desde B')
})

it('delivers the global focus request only to the composer that accepts it', () => {
  render(
    <I18nProvider lang="es">
      {pane('ses_a', { focused: false })}
      {pane('ses_b', { focused: true })}
    </I18nProvider>,
  )
  const [textareaA, textareaB] = screen.getAllByRole('textbox', { name: 'Mensaje' })
  ;(document.activeElement as HTMLElement | null)?.blur()
  act(() => window.dispatchEvent(new Event('rinari:focus-composer')))
  expect(document.activeElement).toBe(textareaB)
  expect(document.activeElement).not.toBe(textareaA)

  // A typed request names its session: it reaches that instance even though it
  // does not accept global focus, and the focused instance ignores it.
  ;(document.activeElement as HTMLElement | null)?.blur()
  act(() => window.dispatchEvent(new CustomEvent('rinari:focus-composer', { detail: { sessionId: 'ses_a' } })))
  expect(document.activeElement).toBe(textareaA)
  expect(document.activeElement).not.toBe(textareaB)
})

it('restores a failed submission into the draft that sent it, not the focused one', async () => {
  render(
    <I18nProvider lang="es">
      {pane('ses_a', { focused: false, onSend: async () => false })}
      {pane('ses_b', { focused: true })}
    </I18nProvider>,
  )
  const user = userEvent.setup()
  const [textareaA] = screen.getAllByRole('textbox', { name: 'Mensaje' })
  await user.type(textareaA, 'reintenta')
  await user.click(screen.getAllByRole('button', { name: 'Enviar mensaje' })[0])
  expect(useComposerStore.getState().getDraft('ses_a').text).toBe('reintenta')
  expect(useComposerStore.getState().getDraft('ses_b').text).toBe('')
})
