// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { useComposerStore } from '../../stores/composer'
import { engineApi, type ModelSummary } from '../../services/engine'
import Composer from './Composer'

beforeEach(() => {
  vi.spyOn(engineApi, 'sessionImageSupport').mockResolvedValue({ model_id: 'main', available: true, reason: '' } as never)
  useComposerStore.setState({ sessionKey: 'draft', text: '', attachments: [], draftsBySession: {} })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function mount(profile: 'workspace' | 'full-access' = 'workspace') {
  const onPermissionChange = vi.fn()
  render(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false}
    onStop={vi.fn()} models={[]} activeAlias="Modelo" activeModel={{ id: 'main', capabilities: {} } as unknown as ModelSummary}
    onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="build"
    onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile={profile}
    effectivePermissionProfile={profile} permissionProfilesV2 onPermissionChange={onPermissionChange}
    onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
  return onPermissionChange
}

async function chooseFullAccess() {
  await userEvent.click(screen.getByTitle('Permisos de este chat'))
  await userEvent.click(await screen.findByRole('button', { name: /Acceso completo/ }))
}

it('asks before turning on full access and changes nothing on cancel', async () => {
  const change = mount()
  await chooseFullAccess()
  const dialog = await screen.findByTestId('full-access-dialog')
  expect(dialog.textContent).toContain('Archivos y carpetas')
  expect(dialog.textContent).toContain('Comandos de terminal')
  expect(dialog.textContent).toContain('Internet y aplicaciones conectadas')
  expect(dialog.textContent).toContain('no te va a preguntar nada')
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.queryByTestId('full-access-dialog')).toBeNull())
  expect(change).not.toHaveBeenCalled()
})

it('applies full access only after confirming', async () => {
  const change = mount()
  await chooseFullAccess()
  await userEvent.click(await screen.findByRole('button', { name: /Activar acceso completo/ }))
  expect(change).toHaveBeenCalledExactlyOnceWith('full-access')
})

it('does not ask to lower the access or to pick it again', async () => {
  const change = mount('full-access')
  await userEvent.click(screen.getByTitle('Permisos de este chat'))
  await userEvent.click(await screen.findByRole('button', { name: /Proyecto/ }))
  expect(screen.queryByTestId('full-access-dialog')).toBeNull()
  expect(change).toHaveBeenCalledExactlyOnceWith('workspace')
})

it('inside a board pane the question covers that pane, not the whole window (plan-boards C14)', async () => {
  const onPermissionChange = vi.fn()
  render(<I18nProvider lang="es"><section data-pane-id="pane_a" aria-label="Panel A"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false}
    onStop={vi.fn()} models={[]} activeAlias="Modelo" activeModel={{ id: 'main', capabilities: {} } as unknown as ModelSummary}
    onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="build"
    onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace"
    effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={onPermissionChange}
    onSearchFiles={async () => ({ root: '/', files: [] })} /></section></I18nProvider>)
  await chooseFullAccess()
  const dialog = await screen.findByTestId('full-access-dialog')
  expect(dialog.closest('section[data-pane-id="pane_a"]')).not.toBeNull()
  expect(dialog.dataset.scope).toBe('container')
  await userEvent.click(screen.getByRole('button', { name: /Activar acceso completo/ }))
  expect(onPermissionChange).toHaveBeenCalledExactlyOnceWith('full-access')
})
