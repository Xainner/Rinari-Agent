import { vi } from 'vitest'
import { setPlatformForTests } from '../platform'
import { createTestBridge } from '../platform/testBridge'

/**
 * Adaptador para las suites heredadas que inspeccionan llamadas por nombre.
 * Sigue usando el contrato real de plataforma; no simula módulos Tauri ni
 * permite que un test importe APIs del host retirado.
 */
export function installMockPlatform() {
  const bridge = createTestBridge()
  const invoke = vi.fn(async (..._args: any[]): Promise<any> => ({}))
  const openUrl = vi.fn(async (_url: string) => {})
  const openFiles = vi.fn(async () => null as string[] | null)
  const clampToWorkArea = vi.fn(async () => {})

  bridge.command = async <T>(name: Parameters<typeof bridge.command>[0], args = {}) => {
    bridge.calls.push({ name, args })
    return invoke(name, args) as Promise<T>
  }
  bridge.engine.status = () => invoke('engine_status') as ReturnType<typeof bridge.engine.status>
  bridge.engine.start = () => invoke('engine_start') as ReturnType<typeof bridge.engine.start>
  bridge.engine.shutdown = () => invoke('engine_shutdown') as ReturnType<typeof bridge.engine.shutdown>
  bridge.engine.restart = () => invoke('engine_restart') as ReturnType<typeof bridge.engine.restart>
  bridge.opener.openUrl = openUrl
  bridge.dialog.openFiles = openFiles
  bridge.window.clampToWorkArea = clampToWorkArea

  const restore = setPlatformForTests(bridge)
  return { bridge, invoke, openUrl, openFiles, clampToWorkArea, restore }
}
