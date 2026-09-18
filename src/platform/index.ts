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
import { electronBridge, hostApi } from './electron'
import { tauriBridge } from './tauri'

export type {
  ContextMenuItem,
  DesktopBridge,
  DesktopCommand,
  EngineBackedCommand,
  EngineEventMessage,
  EngineState,
  EngineStatus,
  HostOnlyCommand,
  NotificationSupport,
  NotificationTarget,
  OpenFilesOptions,
  OpenRequest,
  SystemNotification,
  Unsubscribe,
  UpdateAvailable,
} from './contract'
export { DESKTOP_COMMANDS, ENGINE_BACKED_COMMANDS, HOST_ONLY_COMMANDS } from './contract'

/**
 * Elige el host presente. Electron se detecta por el puente que publica su
 * preload; si no está, se usa el adaptador Tauri, que es el host por defecto
 * hasta el cutover de la entrega H.
 */
function detect(): DesktopBridge {
  return hostApi() !== undefined ? electronBridge : tauriBridge
}

let current: DesktopBridge = detect()

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
