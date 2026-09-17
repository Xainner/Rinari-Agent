/**
 * Punto de entrada del adaptador de plataforma (documento 02 §3).
 *
 * Los componentes y servicios piden el puente con `platform()`. Hoy resuelve a
 * la implementación Tauri; en la entrega D `electron.ts`, respaldado por
 * preload, se elige aquí según el host presente. No se usan alias que finjan
 * que `@tauri-apps/api/core` sigue existiendo en Electron: esconden
 * diferencias de seguridad y de eventos (§3.2).
 */

import type { DesktopBridge } from './contract'
import { tauriBridge } from './tauri'

export type {
  ContextMenuItem,
  DesktopBridge,
  DesktopCommand,
  EngineEventMessage,
  OpenFilesOptions,
  OpenRequest,
  Unsubscribe,
  UpdateAvailable,
} from './contract'
export { DESKTOP_COMMANDS } from './contract'

let current: DesktopBridge = tauriBridge

/** El puente del host actual. */
export function platform(): DesktopBridge {
  return current
}

/**
 * Sustituye el puente. Solo para tests: `createTestBridge()` evita depender de
 * Tauri o Electron. Devuelve la función que restaura el anterior.
 */
export function setPlatformForTests(bridge: DesktopBridge): () => void {
  const previous = current
  current = bridge
  return () => {
    current = previous
  }
}
