/**
 * Ajustes del host que se leen antes de abrir la ventana (plan 0.4.0 #70,
 * #91 y #96): el límite del saludo del Engine, lo que tardó la última vez, la
 * aceleración por hardware y los registros detallados temporales. Viven en
 * `userData/host-settings.json`; sin dependencias de Electron, así las reglas
 * se prueban sin abrir una ventana.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { HostSettingsPatch, StartupLimit } from '../../shared/contracts'
import { ValidationError } from '../../shared/validation'

export interface HostSettingsFile {
  startupLimit: StartupLimit
  /** Lo que tardó el último saludo del Engine, en ms. */
  lastStartupMs: number | null
  hardwareAcceleration: boolean
  /** Hasta cuándo (epoch ms) los registros van en detalle; se apagan solos. */
  detailedLogsUntil: number | null
}

const DEFAULTS: HostSettingsFile = { startupLimit: 'auto', lastStartupMs: null, hardwareAcceleration: true, detailedLogsUntil: null }

/** Registros detallados: 24 h y se apagan solos. */
export const DETAILED_LOGS_MS = 24 * 60 * 60 * 1000

const isLimit = (value: unknown): value is StartupLimit => value === 'auto' || value === 30 || value === 60
const positive = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)

export function loadHostSettings(path: string): HostSettingsFile {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<HostSettingsFile>
    return {
      startupLimit: isLimit(raw.startupLimit) ? raw.startupLimit : DEFAULTS.startupLimit,
      lastStartupMs: positive(raw.lastStartupMs),
      hardwareAcceleration: typeof raw.hardwareAcceleration === 'boolean' ? raw.hardwareAcceleration : DEFAULTS.hardwareAcceleration,
      detailedLogsUntil: positive(raw.detailedLogsUntil),
    }
  } catch {
    // Ausente o ilegible: los valores por defecto, sin romper el arranque.
    return { ...DEFAULTS }
  }
}

export function saveHostSettings(path: string, settings: HostSettingsFile): void {
  mkdirSync(dirname(path), { recursive: true })
  // Escritura atómica: un corte a medias no deja un JSON truncado.
  const temp = `${path}.tmp`
  writeFileSync(temp, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(temp, path)
}

/**
 * Cuánto se espera el saludo del Engine (#70). «Automático»: 45 s la primera
 * vez; después, el doble de lo que tardó la última, entre 30 y 60 s. Un
 * equipo con antivirus tardó 19 s y el límite fijo de 15 s lo daba por caído.
 */
export function handshakeLimitMs(settings: Pick<HostSettingsFile, 'startupLimit' | 'lastStartupMs'>): number {
  if (settings.startupLimit !== 'auto') return settings.startupLimit * 1000
  if (!settings.lastStartupMs) return 45_000
  return Math.min(60_000, Math.max(30_000, settings.lastStartupMs * 2))
}

export function detailedLogsActive(settings: Pick<HostSettingsFile, 'detailedLogsUntil'>, now = Date.now()): boolean {
  return settings.detailedLogsUntil !== null && settings.detailedLogsUntil > now
}

/** Valida en main lo que llega del renderer. */
export function assertHostSettingsPatch(value: unknown): HostSettingsPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('host settings patch must be an object')
  const patch: HostSettingsPatch = {}
  for (const [key, field] of Object.entries(value)) {
    if (key === 'startupLimit') {
      if (!isLimit(field)) throw new ValidationError('startupLimit must be "auto", 30 or 60')
      patch.startupLimit = field
    } else if (key === 'hardwareAcceleration' || key === 'detailedLogs') {
      if (typeof field !== 'boolean') throw new ValidationError(`${key} must be a boolean`)
      patch[key] = field
    } else {
      throw new ValidationError(`unknown host setting: ${key}`)
    }
  }
  return patch
}

/** Aplica un cambio; los registros detallados se encienden por 24 h. */
export function applyHostSettingsPatch(settings: HostSettingsFile, patch: HostSettingsPatch, now = Date.now()): HostSettingsFile {
  const next = { ...settings }
  if (patch.startupLimit !== undefined) next.startupLimit = patch.startupLimit
  if (patch.hardwareAcceleration !== undefined) next.hardwareAcceleration = patch.hardwareAcceleration
  if (patch.detailedLogs !== undefined) next.detailedLogsUntil = patch.detailedLogs ? now + DETAILED_LOGS_MS : null
  return next
}

/**
 * Variables de entorno que cambian cómo trabaja Rinari (rutas de
 * herramientas, proxy, certificados). Solo lectura en Ajustes: nombre y valor,
 * y nunca el de algo que parezca un secreto.
 */
const ENV_PATTERN = /^(RINARI_[A-Z0-9_]+|HTTPS?_PROXY|NO_PROXY|ALL_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE)$/i
const SECRET = /(KEY|TOKEN|SECRET|PASSWORD|PASS|AUTH|CREDENTIAL)/i

export function activeEnvironment(env: NodeJS.ProcessEnv): Array<{ name: string; value: string }> {
  return Object.entries(env)
    .filter(([name, value]) => ENV_PATTERN.test(name) && typeof value === 'string' && value.trim() !== '')
    .map(([name, value]) => ({ name: name.toUpperCase(), value: SECRET.test(name) ? '••••' : redactUrl(String(value)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Un proxy con usuario y contraseña en la URL no los muestra. */
function redactUrl(value: string): string {
  return value.replace(/\/\/[^/@\s]+@/, '//••••@')
}
