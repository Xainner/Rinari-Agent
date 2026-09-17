/**
 * Resolución del ejecutable del Engine (documento 02 §4.1).
 *
 * En producción **solo** se resuelve el Engine empaquetado en los recursos de
 * la app. Si falta, el error es accionable: no se busca en silencio otro
 * `rinari` del PATH, porque arrancar una versión distinta de la distribuida es
 * peor que no arrancar —cambia el esquema, las capabilities y el home—.
 *
 * En desarrollo se conservan `RINARI_ENGINE_BIN`, `RINARI_ENGINE_ARGS` y
 * `RINARI_ENGINE_CWD` con el mismo contrato que el host anterior, más una
 * forma estructurada de argumentos para rutas con espacios. Ninguna se
 * interpreta con `shell: true`.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Dev: binario del Engine. Producción usa el sidecar empaquetado. */
export const ENV_ENGINE_BIN = 'RINARI_ENGINE_BIN'
/** Dev: argumentos antes de `engine --stdio`, separados por espacios. */
export const ENV_ENGINE_ARGS = 'RINARI_ENGINE_ARGS'
/**
 * Dev: los mismos argumentos como array JSON. Es la forma que admite rutas con
 * espacios; `RINARI_ENGINE_ARGS` no puede, y se conserva por compatibilidad.
 */
export const ENV_ENGINE_ARGS_JSON = 'RINARI_ENGINE_ARGS_JSON'
/** Dev: directorio de trabajo del proceso del Engine. */
export const ENV_ENGINE_CWD = 'RINARI_ENGINE_CWD'

export interface EngineCommand {
  program: string
  args: string[]
  cwd?: string
  /** De dónde salió, para el diagnóstico y para no mentir en el estado. */
  source: 'env' | 'sidecar' | 'path'
}

export class EngineNotFound extends Error {
  readonly code = 'ENGINE_NOT_FOUND'
}

/** El sidecar empaquetado: `<recursos>/engine-dist/python[.exe] -m rinari`. */
export function sidecarCommand(resourceDir: string): EngineCommand | null {
  const python = join(resourceDir, 'engine-dist', process.platform === 'win32' ? 'python.exe' : 'python')
  if (!existsSync(python)) return null
  return { program: python, args: ['-m', 'rinari', 'engine', '--stdio'], source: 'sidecar' }
}

function envArgs(env: NodeJS.ProcessEnv): string[] {
  const structured = env[ENV_ENGINE_ARGS_JSON]
  if (structured) {
    let parsed: unknown
    try {
      parsed = JSON.parse(structured)
    } catch (reason) {
      throw new EngineNotFound(
        `${ENV_ENGINE_ARGS_JSON} is not valid JSON: ${reason instanceof Error ? reason.message : String(reason)}`,
      )
    }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new EngineNotFound(`${ENV_ENGINE_ARGS_JSON} must be an array of strings`)
    }
    return parsed as string[]
  }
  const raw = env[ENV_ENGINE_ARGS]
  // Separar por espacios rompe una ruta con espacios; para eso está la forma
  // estructurada de arriba, y se dice en vez de romper en silencio.
  return raw ? raw.split(/\s+/).filter(Boolean) : []
}

export interface LocateOptions {
  /** Directorio de recursos de la app instalada, si lo hay. */
  resourceDir?: string
  /** `true` en una app empaquetada: sin PATH ni overrides implícitos. */
  packaged: boolean
  env?: NodeJS.ProcessEnv
}

/**
 * Elige cómo arrancar el Engine. Lanza `EngineNotFound` con un mensaje que
 * dice qué hacer, en vez de degradar a un binario cualquiera.
 */
export function locateEngine(options: LocateOptions): EngineCommand {
  const env = options.env ?? process.env

  // El override explícito manda también en producción: es una decisión del
  // operador, no un descubrimiento silencioso.
  const overridden = env[ENV_ENGINE_BIN]
  if (overridden) {
    return {
      program: overridden,
      args: [...envArgs(env), 'engine', '--stdio'],
      cwd: env[ENV_ENGINE_CWD],
      source: 'env',
    }
  }

  if (options.resourceDir) {
    const sidecar = sidecarCommand(options.resourceDir)
    if (sidecar) return sidecar
  }

  if (options.packaged) {
    throw new EngineNotFound(
      'The packaged Rinari Engine is missing from this installation. Reinstall Rinari Agent, ' +
        `or set ${ENV_ENGINE_BIN} to a Rinari checkout to start a development engine.`,
    )
  }

  // Solo en desarrollo: el `rinari` del PATH.
  return { program: 'rinari', args: ['engine', '--stdio'], source: 'path' }
}
