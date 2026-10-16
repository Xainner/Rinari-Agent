/**
 * Rinari Agent y Rinari Agent Nightly comparten `~/.rinari`, y dos Engines
 * sobre el mismo home duplicarían tareas programadas y reanudaciones y se
 * pisarían archivos. El Engine 0.4.0 lo impide con su candado (`engine.lock`);
 * la normal 0.3.x no lo tiene, así que la app mira además si el ejecutable de
 * la otra está abierto y pide cerrarla antes de arrancar el suyo.
 */
import { execFile } from 'node:child_process'

import { IS_NIGHTLY } from './channel'

export const OTHER_EXECUTABLE = IS_NIGHTLY ? 'rinari-agent.exe' : 'rinari-agent-nightly.exe'

/** `true` si hay un proceso con esa imagen (solo Windows; en otros, nunca). */
export function isImageRunning(image: string): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile(
      'tasklist.exe',
      ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true, timeout: 10_000 },
      (error, stdout) => resolve(!error && stdout.toLowerCase().includes(`"${image.toLowerCase()}"`)),
    )
  })
}
