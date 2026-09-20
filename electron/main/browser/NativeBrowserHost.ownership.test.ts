import { describe, expect, it, vi } from 'vitest'

import type { BrowserRegistry, ContextEntry } from './BrowserRegistry'
import { NativeBrowserHost, type HostBinding } from './NativeBrowserHost'

const binding: HostBinding = {
  binding_id: 'binding-a',
  engine_instance_id: 'engine-a',
  generation: 1,
}

function harness() {
  const context = { sessionId: 'session-a', control: 'user' } as ContextEntry
  const order: string[] = []
  const registry = {
    contextForSession: (sessionId: string) => (sessionId === context.sessionId ? context : undefined),
    setControl: (_context: ContextEntry, owner: 'agent' | 'user') => {
      order.push(`host:${owner}`)
      context.control = owner
    },
    resetForEngineLoss: () => {
      const manualControlRevoked = context.control === 'user'
      context.control = 'agent'
      order.push('host:engine-lost')
      return { manualControlRevoked }
    },
  } as unknown as BrowserRegistry
  const request = vi.fn(async (method: string) => {
    order.push(`engine:${method}`)
    if (method === 'host.browser.register') return binding
    return { control: 'agent', control_state: 'agent', control_revision: 2 }
  })
  const focus = vi.fn(() => order.push('focus:renderer'))
  const host = new NativeBrowserHost({ registry, request, focusTrustedRenderer: focus })
  return { context, focus, host, order, registry, request }
}

describe('NativeBrowserHost ownership', () => {
  it('retira vista y foco antes de pedir User → Agent al Engine', async () => {
    const test = harness()
    await test.host.register()
    test.order.length = 0

    await test.host.setControl('session-a', 'agent', 1)

    expect(test.context.control).toBe('agent')
    expect(test.order).toEqual([
      'host:agent',
      'focus:renderer',
      'engine:browser.control.set',
    ])
  })

  it('restaura la presentación manual si falla la petición en el mismo binding', async () => {
    const test = harness()
    await test.host.register()
    test.order.length = 0
    test.request.mockImplementationOnce(async (method: string) => {
      test.order.push(`engine:${method}`)
      throw new Error('stale revision')
    })

    await expect(test.host.setControl('session-a', 'agent', 1)).rejects.toThrow('stale revision')
    expect(test.context.control).toBe('user')
    expect(test.order).toEqual([
      'host:agent',
      'focus:renderer',
      'engine:browser.control.set',
      'host:user',
    ])
  })

  it('la pérdida del Engine revoca el permiso manual y devuelve el foco', async () => {
    const test = harness()
    await test.host.register()
    test.order.length = 0

    test.host.onEngineLost('restarting')

    expect(test.context.control).toBe('agent')
    expect(test.host.registered).toBe(false)
    expect(test.order).toEqual(['host:engine-lost', 'focus:renderer'])
  })

  it('coalesce dos devoluciones simultáneas en una sola petición al Engine', async () => {
    const test = harness()
    await test.host.register()
    test.request.mockClear()
    let resolve!: () => void
    test.request.mockImplementationOnce(
      () => new Promise((done) => {
        resolve = () => done({ control: 'agent', control_state: 'agent', control_revision: 2 })
      }),
    )

    const first = test.host.setControl('session-a', 'agent', 1)
    const second = test.host.setControl('session-a', 'agent', 1)
    expect(second).toBe(first)
    expect(test.request).toHaveBeenCalledTimes(1)

    resolve()
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(test.context.control).toBe('agent')
  })

  it('restaura user exactamente una vez si falla una devolución coalescida', async () => {
    const test = harness()
    await test.host.register()
    test.order.length = 0
    let reject!: (reason: Error) => void
    test.request.mockImplementationOnce(
      () => new Promise((_resolve, fail) => { reject = fail }),
    )

    const first = test.host.setControl('session-a', 'agent', 1)
    const second = test.host.setControl('session-a', 'agent', 1)
    reject(new Error('stale revision'))

    await expect(first).rejects.toThrow('stale revision')
    await expect(second).rejects.toThrow('stale revision')
    expect(test.order.filter((entry) => entry === 'host:user')).toHaveLength(1)
    expect(test.context.control).toBe('user')
  })

  it('no hace rollback después de una devolución exitosa', async () => {
    const test = harness()
    await test.host.register()
    test.order.length = 0

    await Promise.all([
      test.host.setControl('session-a', 'agent', 1),
      test.host.setControl('session-a', 'agent', 1),
    ])

    expect(test.context.control).toBe('agent')
    expect(test.order).not.toContain('host:user')
  })

  it('una pérdida del Engine durante la transición mantiene la vista retirada', async () => {
    const test = harness()
    await test.host.register()
    let reject!: (reason: Error) => void
    test.request.mockImplementationOnce(
      () => new Promise((_resolve, fail) => { reject = fail }),
    )

    const transition = test.host.setControl('session-a', 'agent', 1)
    test.host.onEngineLost('restarting')
    reject(new Error('engine exited'))

    await expect(transition).rejects.toThrow('engine exited')
    expect(test.context.control).toBe('agent')
    expect(test.order.filter((entry) => entry === 'host:user')).toHaveLength(0)
  })

  it('permite una transición nueva cuando la anterior ya terminó', async () => {
    const test = harness()
    await test.host.register()
    test.request.mockClear()

    await test.host.setControl('session-a', 'agent', 1)
    test.context.control = 'user'
    await test.host.setControl('session-a', 'agent', 2)

    expect(test.request).toHaveBeenCalledTimes(2)
    expect(test.context.control).toBe('agent')
  })
})
