// @vitest-environment jsdom
// `contextBridge` copia un Error solo con su mensaje: el preload rechaza con un
// objeto plano y el adaptador lo vuelve un `HostError` con código, si se puede
// reintentar y los datos del Engine (proveedor que falló…).
import { afterEach, expect, it } from 'vitest'
import { HostError, hostApi } from './electron'
import { commandMessage, errorText, isCommandError } from '../services/engine'
import { useUIStore } from '../stores/ui'

afterEach(() => { delete (window as { rinariDesktop?: unknown }).rinariDesktop; useUIStore.setState({ lang: 'es' }) })

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
  useUIStore.setState({ lang: 'es' })
  // En español, por su código; las palabras del proveedor siguen detrás (#68).
  expect(commandMessage(error)).toBe('El proveedor rechazó la solicitud: no credits')
  // Nothing else changes: subscriptions return what they returned, real Errors pass through.
  expect(api.engine.onEvent()).toBe(unsubscribe)
  expect(() => api.engine.boom()).toThrow('plain')
  expect(hostApi()).toBe(api)
})

it('says an engine error by its code, in the app language (#68)', () => {
  expect(errorText('TURN_RUNNING', 'A turn is already running', 'es')).toBe('Rinari está trabajando en esta conversación. Espera a que termine o detenla.')
  // A broad code keeps the engine's explanation of the concrete case after the sentence.
  expect(errorText('INVALID_PARAMS', 'Checkpoints require a Git repository', 'es')).toBe('El motor no aceptó los datos de esta acción: Checkpoints require a Git repository')
  expect(errorText('STALE_RESOURCE', 'generation mismatch', 'es')).toBe('Esto cambió desde que se mostró (el motor se reinició). Vuelve a abrirlo.')
  // English keeps the engine's own words, which are more precise.
  expect(errorText('TURN_RUNNING', 'A turn is already running', 'en')).toBe('A turn is already running')
  expect(errorText('NOT_FOUND', '', 'en')).toBe('It no longer exists: it may have been deleted or closed.')
  // An unknown code falls back to the engine text, or says the code.
  expect(errorText('SOMETHING_NEW', 'Something new broke', 'es')).toBe('Something new broke')
  expect(errorText('SOMETHING_NEW', '', 'es')).toBe('Algo falló (SOMETHING_NEW).')
})
