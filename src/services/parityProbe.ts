/**
 * Sonda de paridad del renderer (documento 02 §8).
 *
 * Ejercita las **APIs públicas de producto** —`engineApi`, `desktopApi`— por
 * el mismo camino que la aplicación: servicio → `platform()` → puente →
 * preload → IPC validado → traducción → NDJSON → Engine, y los eventos de
 * vuelta.
 *
 * Existe porque una sonda que llame a `window.rinariDesktop` salta justo el
 * tramo donde vivía el fallo: `src/services` y `src/platform`. Solo se
 * registra cuando el host declara estar en modo paridad, así que no queda
 * expuesta en un arranque normal.
 */

import { engineApi, onEngineEvent } from './engine'

export interface ParityReport {
  started: string
  calls: Array<{ name: string; ok: boolean; code?: string; message?: string }>
  turn: { session: boolean; events: string[] } | { error: string }
}

async function step(
  calls: ParityReport['calls'],
  name: string,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run()
    calls.push({ name, ok: true })
  } catch (error) {
    const reason = error as { code?: string; message?: string }
    calls.push({ name, ok: false, code: reason?.code, message: reason?.message })
  }
}

export async function runParityProbe(): Promise<ParityReport> {
  const calls: ParityReport['calls'] = []
  let started = 'error'
  try {
    started = (await engineApi.start()).state
  } catch (error) {
    started = `error: ${(error as Error).message}`
  }

  // Un comando por módulo del inventario, todos de lectura, llamados por su
  // API de producto y no por el nombre crudo del comando.
  await step(calls, 'session_list', () => engineApi.sessions())
  await step(calls, 'project_list_recent', () => engineApi.projectRecents())
  await step(calls, 'provider_list', () => engineApi.providerList())
  await step(calls, 'model_list', () => engineApi.modelList())
  await step(calls, 'agent_list', () => engineApi.agentList())
  await step(calls, 'soul_list', () => engineApi.soulList())
  await step(calls, 'mcp_list', () => engineApi.mcpList())
  await step(calls, 'tool_list', () => engineApi.toolList())
  await step(calls, 'bundle_list', () => engineApi.bundleList())
  await step(calls, 'policy_get', () => engineApi.policyGet())
  await step(calls, 'vision_settings_get', () => engineApi.visionSettingsGet())
  await step(calls, 'context_settings_get', () => engineApi.contextSettingsGet())

  // Turno real contra un proveedor falso: acepta y falla al conectar, que es
  // el pipeline entero sin salir de la máquina.
  let turn: ParityReport['turn']
  try {
    await engineApi.providerCreate({
      alias: 'falso',
      provider_type: 'custom',
      auth_method: 'none',
      endpoint: 'http://127.0.0.1:9/v1',
    })
    await engineApi.modelAdd({ provider: 'falso', provider_model_id: 'fake-1', alias: 'fake' })
    await engineApi.modelUse('fake')
    const created = await engineApi.createSession({ chat: true, title: 'paridad' })
    const sessionId = (created as { session?: { id?: string }; id?: string }).session?.id ??
      (created as { id?: string }).id ?? ''
    const events: string[] = []
    await onEngineEvent((event) => {
      if (event.event) events.push(event.event)
    })
    await engineApi.startTurn(sessionId, 'hola')
    await new Promise((resolve) => setTimeout(resolve, 6000))
    turn = { session: Boolean(sessionId), events: [...new Set(events)] }
  } catch (error) {
    const reason = error as { code?: string; message?: string }
    turn = { error: `${reason?.code ?? 'ERROR'}: ${reason?.message ?? String(error)}` }
  }

  return { started, calls, turn }
}

declare global {
  interface Window {
    __rinariParityProbe?: () => Promise<ParityReport>
  }
}

/** La registra solo si el host declara modo paridad. */
export function registerParityProbe(enabled: boolean): void {
  if (!enabled) return
  window.__rinariParityProbe = runParityProbe
}
