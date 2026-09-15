// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ModelSummary, ProviderSummary } from '../../services/engine'
import Composer from './Composer'

afterEach(cleanup)
it('groups models by provider and closes each selector immediately on selection', async () => {
  const onUseModel = vi.fn(), onPermissionChange = vi.fn(), onReasoningChange = vi.fn()
  const models = [{ provider_id: 'local', availability: 'available', settings: {}, active: true, id: 'a', alias: 'Alpha', provider: 'Local', provider_model_id: 'alpha', capabilities: { reasoning_effort: true } }, { provider_id: 'remote', capabilities: null, availability: 'available', settings: {}, active: false, id: 'b', alias: 'Beta', provider: 'Remote', provider_model_id: 'beta' }] as ModelSummary[]
  render(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={models} activeAlias="Alpha" onUseModel={onUseModel} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="build" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={onReasoningChange} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={onPermissionChange} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Alpha' }))
  expect(screen.getByRole('heading', { name: 'Local' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Remote' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: /Beta/ }))
  expect(onUseModel).toHaveBeenCalledWith(models[1])
  expect(screen.queryByRole('dialog')).toBeNull()
  await user.click(screen.getByTitle('Permisos de este chat'))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Solo lectura/ }))
  expect(onPermissionChange).toHaveBeenCalledWith('read-only')
  expect(screen.queryByRole('dialog')).toBeNull()
  await user.click(screen.getByTitle('Razonamiento'))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Alto/ }))
  expect(onReasoningChange).toHaveBeenCalledWith('high')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('allows changing read scope in PLAN while showing immutable execution', async () => {
  const onPermissionChange = vi.fn()
  render(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={[]} activeAlias="" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="plan" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="full-access" effectivePermissionProfile="read-only" permissionProfilesV2 onPermissionChange={onPermissionChange} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
  const user = userEvent.setup()
  expect(screen.getByTitle('Permisos de este chat').textContent).toContain('Lectura · Acceso completo')
  await user.click(screen.getByTitle('Permisos de este chat'))
  expect(screen.getByText(/PLAN y REVIEW no modifican archivos/)).toBeTruthy()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Workspace/ }))
  expect(onPermissionChange).toHaveBeenCalledWith('workspace')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('pinta el logo del proveedor en el modelo activo y en cada grupo', async () => {
  const models = [
    { id: 'a', alias: 'DeepSeek V4', provider: 'opencode-go', provider_model_id: 'deepseek-v4-flash' },
    { id: 'b', alias: 'Local Qwen', provider: 'xAInner', provider_model_id: 'qwen3.8' },
  ] as ModelSummary[]
  const providers = [
    { id: 'p1', alias: 'opencode-go', endpoint: 'https://opencode.ai/zen/go/v1' },
    { id: 'p2', alias: 'xAInner', endpoint: 'https://api.xainner.com/v1' },
  ] as ProviderSummary[]
  render(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={models} providers={providers} activeAlias="DeepSeek V4" activeModel={models[0]} onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="build" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
  const user = userEvent.setup()
  const trigger = screen.getByRole('button', { name: 'DeepSeek V4' })
  expect(trigger.querySelector('img')?.getAttribute('src')).toBe('/logos/opencode.png')
  await user.click(trigger)
  expect(
    screen.getByRole('heading', { name: 'opencode-go' }).querySelector('img')?.getAttribute('src'),
  ).toBe('/logos/opencode.png')
  expect(screen.getByRole('heading', { name: 'xAInner' }).querySelector('img')).toBeNull()
})

it('collapses providers, remembers their state and reveals matching models during search', async () => {
  const models = [{id:'a',alias:'Alpha',provider:'Local',provider_model_id:'alpha'}, {id:'b',alias:'Beta',provider:'Remote',provider_model_id:'beta'}] as ModelSummary[]
  render(<I18nProvider lang="es"><Composer placement="centered" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={models} activeAlias="Alpha" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="build" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={vi.fn()} onSearchFiles={async()=>({root:'/',files:[]})} /></I18nProvider>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', {name:'Alpha'}))
  await user.click(screen.getByRole('button', {name:'Remote'}))
  expect(screen.getByRole('button', {name:'Remote'}).getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('button', {name:/Beta/})).toBeNull()
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', {name:'Alpha'}))
  expect(screen.queryByRole('button', {name:/Beta/})).toBeNull()
  await user.type(screen.getByPlaceholderText('Buscar modelos…'), 'Beta')
  expect(screen.getByRole('button', {name:/Beta/})).toBeTruthy()
  await user.clear(screen.getByPlaceholderText('Buscar modelos…'))
  expect(screen.queryByRole('button', {name:/Beta/})).toBeNull()
  await user.click(screen.getByRole('button', {name:'Remote'}))
  expect(screen.getByRole('button', {name:/Beta/})).toBeTruthy()
})
it('la pill de modo sigue al modo activo', () => {
  const view = render(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={[]} activeAlias="" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="build" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
  expect(screen.getByRole('button', { name: 'BUILD' }).querySelector('[data-testid="mode-pill"]')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'PLAN' }).querySelector('[data-testid="mode-pill"]')).toBeNull()
  expect(screen.getAllByTestId('mode-pill')).toHaveLength(1)
  view.rerender(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={[]} activeAlias="" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="plan" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
  expect(screen.getByRole('button', { name: 'PLAN' }).querySelector('[data-testid="mode-pill"]')).toBeTruthy()
  expect(screen.getAllByTestId('mode-pill')).toHaveLength(1)
})
