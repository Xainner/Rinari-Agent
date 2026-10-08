/**
 * Diagnóstico del host: registros persistentes y «Exportar diagnóstico».
 *
 * - `app.log`: lo que main ya escribía en consola (errores, avisos, el
 *   renderer, excepciones sin capturar), cambios de estado del Engine y
 *   comandos fallidos con su código.
 * - `engine.log`: el stderr del Engine, que antes solo veía una consola.
 *
 * Todo pasa por la redacción, rota por tamaño y se queda en el equipo: solo
 * sale si la persona exporta el paquete y decide adjuntarlo.
 */
import { format } from 'node:util'
import { join } from 'node:path'
import { buildBundle, previewBundle, type BundlePreview, type BundleSources } from './bundle'
import { RotatingLog, type LogLevel } from './rotatingLog'

const STATE_HISTORY = 30

export interface DiagnosticsOptions {
  logsDir: string
  crashDir: string | null
  appVersion: string
  versions: Record<string, string | undefined>
  os: BundleSources['os']
  engine: { status(): unknown; diagnostics(): Promise<unknown> }
  /** Otros registros del host que ya existen (el del actualizador). */
  extraLogFiles?: string[]
}

export interface EngineStateLike {
  state: string
  detail?: string | null
}

export function createDiagnostics(options: DiagnosticsOptions) {
  const app = new RotatingLog({ dir: options.logsDir, name: 'app' })
  const engine = new RotatingLog({ dir: options.logsDir, name: 'engine' })
  const states: Array<{ at: string; state: string; detail: string | null }> = []
  let lastState: string | null = null
  const original = { error: console.error.bind(console), warn: console.warn.bind(console) }

  const sources: BundleSources = {
    appVersion: options.appVersion,
    versions: options.versions,
    os: options.os,
    engineStatus: () => options.engine.status(),
    engineDiagnostics: () => options.engine.diagnostics(),
    engineStates: () => [...states],
    logFiles: () => [...app.files(), ...engine.files(), ...(options.extraLogFiles ?? [])],
    crashDir: options.crashDir,
  }

  return {
    app,
    engine,

    log(level: LogLevel, ...args: unknown[]): void {
      app.write(level, format(...args))
    },

    /** Lo que main escribe en consola también queda en `app.log`. */
    captureConsole(): void {
      console.error = (...args: unknown[]) => {
        original.error(...args)
        app.write('error', format(...args))
      }
      console.warn = (...args: unknown[]) => {
        original.warn(...args)
        app.write('warn', format(...args))
      }
    },

    /**
     * Excepciones y promesas sin capturar. `uncaughtExceptionMonitor` observa
     * sin cambiar lo que Electron hace después: no oculta un fallo real.
     */
    watchProcess(target: NodeJS.Process = process): void {
      target.on('uncaughtExceptionMonitor', (error, origin) => {
        app.write('error', `uncaught ${origin}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
      })
      target.on('unhandledRejection', (reason) => {
        app.write('error', `unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`)
      })
    },

    /** stderr del Engine: a su registro y a la consola, sin duplicarse en `app.log`. */
    engineStderr(line: string): void {
      original.error(`[rinari-engine] ${line}`)
      engine.write('info', line)
    },

    engineStatus(status: EngineStateLike): void {
      const key = `${status.state}\u0000${status.detail ?? ''}`
      if (key === lastState) return
      lastState = key
      const entry = { at: new Date().toISOString(), state: status.state, detail: status.detail ?? null }
      states.push(entry)
      if (states.length > STATE_HISTORY) states.shift()
      app.write(status.state === 'failed' || status.state === 'degraded' ? 'warn' : 'info', `engine ${status.state}${status.detail ? `: ${status.detail}` : ''}`)
    },

    /**
     * Un comando del renderer que falló: nombre y código. Ni argumentos ni el
     * mensaje del error, que puede citar lo que se pidió (una ruta, un id).
     */
    commandFailed(command: string, code: string): void {
      app.write('warn', `command ${command} failed: ${code}`)
    },

    async preview(): Promise<BundlePreview> {
      await Promise.all([app.flush(), engine.flush()])
      return previewBundle(sources)
    },

    async bundle(): Promise<Buffer> {
      await Promise.all([app.flush(), engine.flush()])
      return buildBundle(sources)
    },
  }
}

export type Diagnostics = ReturnType<typeof createDiagnostics>

export function bundleFileName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `rinari-diagnostico-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`
}

export const logsDirFor = (userData: string) => join(userData, 'logs')
