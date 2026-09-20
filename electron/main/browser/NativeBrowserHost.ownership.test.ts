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

  it('una petición posterior impide que un fallo viejo restaure control manual', async () => {
    const test = harness()
    await test.host.register()
    let rejectFirst!: (reason: Error) => void
    test.request
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => { rejectFirst = reject }),
      )
      .mockResolvedValueOnce({ control: 'agent', control_state: 'agent', control_revision: 3 })

    const first = test.host.setControl('session-a', 'agent', 1)
    const second = test.host.setControl('session-a', 'agent', 1)
    await second
    rejectFirst(new Error('respuesta vieja'))
    await expect(first).rejects.toThrow('respuesta vieja')

    expect(test.context.control).toBe('agent')
  })
})
