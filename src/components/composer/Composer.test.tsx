// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { ModelSummary, ProviderSummary } from '../../services/engine'
import Composer from './Composer'
import { useUIStore } from '../../stores/ui'

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
  // Un único indicador a nivel del grupo; el seleccionado se marca con aria-pressed.
  expect(screen.getAllByTestId('mode-pill')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'BUILD' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'PLAN' }).getAttribute('aria-pressed')).toBe('false')
  view.rerender(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={[]} activeAlias="" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode="plan" onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
  expect(screen.getAllByTestId('mode-pill')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'PLAN' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'BUILD' }).getAttribute('aria-pressed')).toBe('false')
})

function mockButtonGeometry(button: HTMLElement, left: number, width: number) {
  Object.defineProperty(button, 'offsetLeft', { value: left, configurable: true })
  Object.defineProperty(button, 'offsetWidth', { value: width, configurable: true })
}

function renderComposerForPill(sessionMode: string) {
  return render(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={[]} activeAlias="" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode={sessionMode} onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
}

function rerenderComposerForPill(view: ReturnType<typeof render>, sessionMode: string) {
  view.rerender(<I18nProvider lang="es"><Composer placement="bottom" onSend={vi.fn()} isStreaming={false} onStop={vi.fn()} models={[]} activeAlias="" onUseModel={vi.fn()} onDiscoverModels={vi.fn()} onOpenProviders={vi.fn()} sessionMode={sessionMode} onModeChange={vi.fn()} reasoningEffort="off" onReasoningChange={vi.fn()} permissionProfile="workspace" effectivePermissionProfile="workspace" permissionProfilesV2 onPermissionChange={vi.fn()} onSearchFiles={async () => ({ root: '/', files: [] })} /></I18nProvider>)
}

it('la pill viaja al modo pedido con clic', () => {
  const view = renderComposerForPill('build')
  mockButtonGeometry(screen.getByRole('button', { name: 'PLAN' }), 2, 52)
  mockButtonGeometry(screen.getByRole('button', { name: 'BUILD' }), 56, 60)
  mockButtonGeometry(screen.getByRole('button', { name: 'REVIEW' }), 118, 64)
  fireEvent.click(screen.getByRole('button', { name: 'REVIEW' }))
  rerenderComposerForPill(view, 'review')
  const pill = screen.getByTestId('mode-pill')
  expect(pill.style.transform).toBe('translateX(118px)')
  expect(pill.style.width).toBe('64px')
  expect(pill.style.transition).toContain('transform')
})

it('un cambio que llega solo se coloca sin viajar (fantasma)', () => {
  // Nueva conversación que muestra el modo anterior y corrige a build:
  // sin clic no hay viaje, solo aparece colocada.
  const view = renderComposerForPill('plan')
  mockButtonGeometry(screen.getByRole('button', { name: 'PLAN' }), 2, 52)
  mockButtonGeometry(screen.getByRole('button', { name: 'BUILD' }), 56, 60)
  mockButtonGeometry(screen.getByRole('button', { name: 'REVIEW' }), 118, 64)
  rerenderComposerForPill(view, 'build')
  const pill = screen.getByTestId('mode-pill')
  expect(pill.style.transform).toBe('translateX(56px)')
  expect(pill.style.width).toBe('60px')
  expect(pill.style.transition).toBe('none')
})

it('la pill aparece ya colocada al montar', () => {
  // La colocación es imperativa en layout effect (antes del primer
  // pintado): al montar ya está en su sitio, sin viaje fantasma. En
  // jsdom las medidas son 0, así que se afirma la escritura sincrónica.
  renderComposerForPill('build')
  const pill = screen.getByTestId('mode-pill')
  expect(pill.style.transform).toBe('translateX(0px)')
  expect(pill.style.width).toBe('0px')
})

it('la pill salta sin transición con movimiento reducido', () => {
  useUIStore.setState({ reduceMotion: true })
  try {
    renderComposerForPill('plan')
    expect(screen.getByTestId('mode-pill').style.transition).toBe('none')
  } finally {
    useUIStore.setState({ reduceMotion: false })
  }
})
