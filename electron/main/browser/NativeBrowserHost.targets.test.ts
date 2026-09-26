import { expect, it, vi } from 'vitest'

import type { BrowserRegistry, ContextEntry } from './BrowserRegistry'
import { NativeBrowserHost, type HostBinding } from './NativeBrowserHost'

const binding: HostBinding = {
  binding_id: 'binding-a',
  engine_instance_id: 'engine-a',
  generation: 1,
}

it('la UI relee el contexto cuando el Engine ya tiene las pestañas, no antes', async () => {
  const context = {
    contextId: 'ctx-local',
    engineContextId: 'ctx-engine',
    sessionId: 'session-a',
    activeTargetId: 't1',
  } as ContextEntry
  const order: string[] = []
  let deliver: () => void = () => {}
  const registry = {
    context: (id: string) => (id === context.contextId ? context : undefined),
    describeTargets: () => [{ target_id: 't1', url: 'https://example.com/', title: '', active: true }],
  } as unknown as BrowserRegistry
  const request = vi.fn((method: string) => {
    if (method === 'host.browser.register') return Promise.resolve(binding)
    order.push('engine:sent')
    return new Promise((resolve) => {
      deliver = () => {
        order.push('engine:has-targets')
        resolve({})
      }
    })
  })
  const onContextChanged = vi.fn(() => order.push('ui:reread'))
  const host = new NativeBrowserHost({
    registry,
    request,
    focusTrustedRenderer: () => {},
    onContextChanged,
  })
  await host.register()

  const published = host.publishTargets('ctx-local')
  await Promise.resolve()
  expect(onContextChanged).not.toHaveBeenCalled()
  deliver()
  await published
  expect(order).toEqual(['engine:sent', 'engine:has-targets', 'ui:reread'])
})

it('preparar el panel deja al host con el id del Engine, sin pisar uno ya conocido', () => {
  const host = new NativeBrowserHost({
    registry: {} as BrowserRegistry,
    request: vi.fn(),
    focusTrustedRenderer: () => {},
  })
  const fresh = { engineContextId: null } as ContextEntry
  host.adoptEngineContext(fresh, 'ctx-engine')
  expect(fresh.engineContextId).toBe('ctx-engine')
  host.adoptEngineContext(fresh, 'ctx-other')
  expect(fresh.engineContextId).toBe('ctx-engine')
  const unknown = { engineContextId: null } as ContextEntry
  host.adoptEngineContext(unknown, undefined)
  expect(unknown.engineContextId).toBeNull()
})
