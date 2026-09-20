// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

const targets = [
  { id: 'ses_b', label: 'Docs' },
  { id: 'ses_c', label: 'Backend API' },
]

function composer(props: { onSend: (text: string) => Promise<boolean>; onSendToTarget?: (id: string, text: string) => Promise<boolean>; searchFiles?: () => Promise<{ root: string; files: Array<{ path: string; relative_path: string; name: string }> }> }) {
  return (
    <I18nProvider lang="es">
      <Composer
        placement="bottom"
        sessionId="ses_a"
        primary={false}
        acceptsGlobalFocus
        onSend={props.onSend}
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
        onSearchFiles={props.searchFiles ?? (async () => ({ root: '/', files: [] }))}
        mentionTargets={targets}
        onSendToTarget={props.onSendToTarget}
      />
    </I18nProvider>
  )
}

it('autocompletes panes after @, inserts the label with the keyboard and sends directly to that pane', async () => {
  const onSend = vi.fn(async () => true)
  const onSendToTarget = vi.fn(async () => true)
  render(composer({ onSend, onSendToTarget }))
  const user = userEvent.setup()
  const textarea = screen.getByRole('textbox', { name: 'Mensaje' })
  await user.type(textarea, '@ba')
  const list = await screen.findByRole('listbox', { name: 'Paneles' })
  expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['Backend API'])
  await user.keyboard('{Enter}')
  expect(useComposerStore.getState().draftsBySession.ses_a?.text).toBe('@Backend API ')
  expect(onSend).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox', { name: 'Paneles' })).toBeNull()
  // A bare mention cannot be sent; the chip explains what is missing.
  expect(screen.getByTestId('pane-mention-chip').textContent).toContain('Mensaje directo a «Backend API»')
  expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toHaveProperty('disabled', true)
  await user.type(textarea, 'arregla el build')
  await user.keyboard('{Enter}')
  await waitFor(() => expect(onSendToTarget).toHaveBeenCalledWith('ses_c', 'arregla el build'))
  expect(onSend).not.toHaveBeenCalled()
  expect(useComposerStore.getState().draftsBySession.ses_a?.text ?? '').toBe('')
})

it('keeps @file references as normal messages and restores the draft when the direct send fails', async () => {
  const onSend = vi.fn(async () => true)
  const onSendToTarget = vi.fn(async () => false)
  const searchFiles = vi.fn(async () => ({ root: '/', files: [{ path: '/p/README.md', relative_path: 'README.md', name: 'README.md' }] }))
  render(composer({ onSend, onSendToTarget, searchFiles }))
  const user = userEvent.setup()
  const textarea = screen.getByRole('textbox', { name: 'Mensaje' })
  await user.type(textarea, '@README.md explica esto')
  await user.keyboard('{Enter}')
  await waitFor(() => expect(onSend).toHaveBeenCalledWith('@README.md explica esto', []))
  expect(onSendToTarget).not.toHaveBeenCalled()

  await user.type(textarea, '@Docs hola')
  await user.keyboard('{Enter}')
  await waitFor(() => expect(onSendToTarget).toHaveBeenCalledWith('ses_b', 'hola'))
  await waitFor(() => expect(useComposerStore.getState().draftsBySession.ses_a?.text).toBe('@Docs hola'))
})
