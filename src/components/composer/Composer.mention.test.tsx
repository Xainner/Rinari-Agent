// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

function composer(props: { onSend: (text: string) => Promise<boolean>; searchFiles?: () => Promise<{ root: string; files: Array<{ path: string; relative_path: string; name: string }> }> }) {
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
      />
    </I18nProvider>
  )
}

it('sends @file references and «@Name text» as normal messages: there are no pane mentions (0.4.0 block 25)', async () => {
  const onSend = vi.fn(async () => true)
  const searchFiles = vi.fn(async () => ({ root: '/', files: [{ path: '/p/README.md', relative_path: 'README.md', name: 'README.md' }] }))
  render(composer({ onSend, searchFiles }))
  const user = userEvent.setup()
  const textarea = screen.getByRole('textbox', { name: 'Mensaje' })
  await user.type(textarea, '@README.md explica esto')
  await user.keyboard('{Enter}')
  await waitFor(() => expect(onSend).toHaveBeenCalledWith('@README.md explica esto', []))

  await user.type(textarea, '@Docs hola')
  expect(screen.queryByRole('listbox', { name: 'Paneles' })).toBeNull()
  await user.keyboard('{Enter}')
  await waitFor(() => expect(onSend).toHaveBeenCalledWith('@Docs hola', []))
})
