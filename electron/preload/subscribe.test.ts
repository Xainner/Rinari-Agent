// Un solo oyente IPC por canal, repartido a los suscriptores (plan 0.4.0 #58).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = new Map<string, Array<(event: unknown, payload: unknown) => void>>()
let exposed: Record<string, any> = {}

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_name: string, api: Record<string, any>) => { exposed = api } },
  ipcRenderer: {
    on: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener])
    },
    removeListener: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
      listeners.set(channel, (listeners.get(channel) ?? []).filter((each) => each !== listener))
    },
    invoke: vi.fn(),
    send: vi.fn(),
  },
  webUtils: { getPathForFile: () => '' },
}))

const engineChannel = () => [...listeners.keys()].find((key) => key.includes('engineEvent'))!

describe('preload subscriptions', () => {
  beforeEach(async () => {
    vi.resetModules()
    listeners.clear()
    await import('./index')
  })

  it('thirty subscribers share one ipcRenderer.on and each gets the payload', () => {
    const received: number[] = []
    const stops = Array.from({ length: 30 }, (_, index) => exposed.engine.onEvent(() => received.push(index)))
    expect(listeners.get(engineChannel())).toHaveLength(1)
    listeners.get(engineChannel())![0]({}, { event: 'turn.started' })
    expect(received).toHaveLength(30)
    for (const stop of stops.slice(0, 29)) stop()
    expect(listeners.get(engineChannel())).toHaveLength(1)
    stops[29]()
    stops[29]()
    expect(listeners.get(engineChannel())).toHaveLength(0)
  })

  it('a subscriber that throws does not stop the others', () => {
    const seen: string[] = []
    exposed.engine.onEvent(() => { throw new Error('boom') })
    exposed.engine.onEvent(() => seen.push('second'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    listeners.get(engineChannel())![0]({}, { event: 'x' })
    expect(seen).toEqual(['second'])
    error.mockRestore()
  })
})
