// @vitest-environment jsdom
// `contextBridge` copia un Error solo con su mensaje: el preload rechaza con un
// objeto plano y el adaptador lo vuelve un `HostError` con código, si se puede
// reintentar y los datos del Engine (proveedor que falló…).
import { afterEach, expect, it } from 'vitest'
import { HostError, hostApi } from './electron'
import { commandMessage, isCommandError } from '../services/engine'

afterEach(() => { delete (window as { rinariDesktop?: unknown }).rinariDesktop })

it('turns a plain bridge failure back into an Error with its code and details', async () => {
  const unsubscribe = () => {}
  ;(window as { rinariDesktop?: unknown }).rinariDesktop = Object.freeze({
    command: async () => {
      throw { name: 'BridgeError', rinariBridgeError: true, code: 'PROVIDER_MODEL_FAILURE', message: 'no credits', retryable: false, details: { provider_id: 'prv_go' } }
    },
    engine: Object.freeze({ onEvent: () => unsubscribe, boom: () => { throw new Error('plain') } }),
  })
  const api = hostApi() as unknown as { command: () => Promise<unknown>; engine: { onEvent: () => unknown; boom: () => void } }
  const error = await api.command().catch((e: unknown) => e)
  expect(error).toBeInstanceOf(HostError)
  expect(error).toMatchObject({ code: 'PROVIDER_MODEL_FAILURE', message: 'no credits', retryable: false, details: { provider_id: 'prv_go' } })
  expect(isCommandError(error)).toBe(true)
  expect(commandMessage(error)).toBe('PROVIDER_MODEL_FAILURE: no credits')
  // Nothing else changes: subscriptions return what they returned, real Errors pass through.
  expect(api.engine.onEvent()).toBe(unsubscribe)
  expect(() => api.engine.boom()).toThrow('plain')
  expect(hostApi()).toBe(api)
})
