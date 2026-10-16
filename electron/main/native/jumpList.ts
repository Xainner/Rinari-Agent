/**
 * «Marcar todo como leído» en el clic derecho del icono de la barra de tareas
 * (#84). Windows lanza el ejecutable con `--mark-all-read`; la segunda
 * instancia se lo pasa a la primera, que lo aplica sin mostrar la ventana.
 */

import type { HostText } from './hostText'

export const MARK_ALL_READ_ARG = '--mark-all-read'

export interface JumpTask {
  program: string
  arguments: string
  iconPath: string
  iconIndex: number
  title: string
  description: string
}

export function markAllReadTask(execPath: string, text: Pick<HostText, 'trayMarkAllRead'>): JumpTask {
  return {
    program: execPath,
    arguments: MARK_ALL_READ_ARG,
    iconPath: execPath,
    iconIndex: 0,
    title: text.trayMarkAllRead,
    description: text.trayMarkAllRead,
  }
}

export function wantsMarkAllRead(argv: readonly string[], skip = 1): boolean {
  return argv.slice(skip).includes(MARK_ALL_READ_ARG)
}

/** Lo mismo, leído del `additionalData` que manda la segunda instancia. */
export function markAllReadFromData(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { markAllRead?: unknown }).markAllRead === true
}
