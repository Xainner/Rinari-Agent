/**
 * Punto de entrada del adaptador de plataforma (documento 02 §3).
 *
 * Los componentes y servicios piden el puente con `platform()`. Desde el
 * cutover H existe un solo host de producto: Electron, respaldado por preload.
 * Los tests sustituyen esta instancia con `createTestBridge()`.
 */

import type { DesktopBridge } from './contract'
import { electronBridge } from './electron'

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
  UpdateProgress,
  UpdateState,
  MigrationState,
  MigrationStatus,
} from './contract'
export { DESKTOP_COMMANDS, ENGINE_BACKED_COMMANDS, HOST_ONLY_COMMANDS } from './contract'

let current: DesktopBridge = electronBridge

/** El puente del host actual. */
export function platform(): DesktopBridge {
  return current
}

/**
 * Sustituye el puente. Solo para tests: `createTestBridge()` evita depender de
 * Electron. Devuelve la función que restaura el anterior.
 */
export function setPlatformForTests(bridge: DesktopBridge): () => void {
  const previous = current
  current = bridge
  return () => {
    current = previous
  }
}
