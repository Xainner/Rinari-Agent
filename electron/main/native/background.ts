/**
 * Segundo plano: seguir en la bandeja al cerrar e iniciar con el sistema.
 *
 * Son preferencias del escritorio, pero las necesita main **antes** que el
 * renderer —al arrancar oculto, o al pulsar la X con la ventana a medio
 * cargar—, así que viven en `userData/desktop-settings.json` y no en el
 * almacenamiento del WebView. Sin dependencias de Electron: el inicio de
 * sesión llega inyectado, y las reglas se prueban sin abrir una ventana.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { BackgroundPatch, BackgroundSettings } from '../../shared/contracts'
import { ValidationError } from '../../shared/validation'

/** Argumento con el que el sistema abre la app al iniciar sesión. */
export const HIDDEN_START_ARG = '--hidden'

export interface DesktopSettings {
  /** Cerrar la ventana la oculta en la bandeja en vez de salir. */
  backgroundMode: boolean
  /** Ya se avisó una vez de que la app sigue en la bandeja. */
  trayNoticeShown: boolean
}

export interface LoginItems {
  /** Si el sistema abrirá la app al iniciar sesión (el usuario pudo cambiarlo fuera). */
  get(): boolean
  set(openAtLogin: boolean): void
}

const DEFAULTS: DesktopSettings = { backgroundMode: true, trayNoticeShown: false }

export function loadDesktopSettings(path: string): DesktopSettings {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<DesktopSettings>
    return {
      backgroundMode: typeof raw.backgroundMode === 'boolean' ? raw.backgroundMode : DEFAULTS.backgroundMode,
      trayNoticeShown: typeof raw.trayNoticeShown === 'boolean' ? raw.trayNoticeShown : DEFAULTS.trayNoticeShown,
    }
  } catch {
    // Ausente o ilegible: los valores por defecto, sin romper el arranque.
    return { ...DEFAULTS }
  }
}

function saveDesktopSettings(path: string, settings: DesktopSettings): void {
  mkdirSync(dirname(path), { recursive: true })
  // Escritura atómica: un corte a medias no deja un JSON truncado.
  const temp = `${path}.tmp`
  writeFileSync(temp, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(temp, path)
}

/** ¿El sistema abrió la app al iniciar sesión? Entonces arranca en la bandeja. */
export function wantsHiddenStart(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_START_ARG)
}

/** Valida en main lo que llega del renderer: solo booleanos conocidos. */
export function assertBackgroundPatch(value: unknown): BackgroundPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('background patch must be an object')
  const patch: BackgroundPatch = {}
  for (const [key, field] of Object.entries(value)) {
    if (key !== 'backgroundMode' && key !== 'launchAtLogin') throw new ValidationError(`unknown background setting: ${key}`)
    if (typeof field !== 'boolean') throw new ValidationError(`background setting must be a boolean: ${key}`)
    patch[key] = field
  }
  return patch
}

export interface BackgroundDeps {
  settingsPath: string
  /** `null` fuera de la app empaquetada. */
  loginItems: LoginItems | null
  /** Cambió el modo: main crea o retira el icono de la bandeja. */
  onModeChanged?: (backgroundMode: boolean) => void
}

export function createBackground(deps: BackgroundDeps) {
  let settings = loadDesktopSettings(deps.settingsPath)
  const persist = () => {
    try {
      saveDesktopSettings(deps.settingsPath, settings)
    } catch (error) {
      console.error('[rinari] no se pudieron guardar los ajustes de segundo plano:', error)
    }
  }

  return {
    get backgroundMode(): boolean {
      return settings.backgroundMode
    },

    settings(): BackgroundSettings {
      return {
        backgroundMode: settings.backgroundMode,
        launchAtLogin: deps.loginItems?.get() ?? false,
        launchAtLoginSupported: deps.loginItems !== null,
      }
    },

    update(patch: BackgroundPatch): BackgroundSettings {
      if (patch.backgroundMode !== undefined && patch.backgroundMode !== settings.backgroundMode) {
        settings = { ...settings, backgroundMode: patch.backgroundMode }
        persist()
        deps.onModeChanged?.(settings.backgroundMode)
      }
      if (patch.launchAtLogin !== undefined && deps.loginItems) deps.loginItems.set(patch.launchAtLogin)
      return this.settings()
    },

    /**
     * La X de la ventana: `hide` si sigue en la bandeja, `quit` si no. Con
     * `notice`, es la primera vez y hay que decir dónde quedó la app.
     */
    onCloseRequested(): { action: 'hide' | 'quit'; notice: boolean } {
      if (!settings.backgroundMode) return { action: 'quit', notice: false }
      const notice = !settings.trayNoticeShown
      if (notice) {
        settings = { ...settings, trayNoticeShown: true }
        persist()
      }
      return { action: 'hide', notice }
    },

    /**
     * Arrancar oculto solo si la bandeja existe para volver: sin ella, una
     * ventana oculta dejaría la app viva e inalcanzable.
     */
    startsHidden(argv: readonly string[]): boolean {
      return settings.backgroundMode && wantsHiddenStart(argv)
    },
  }
}

export type Background = ReturnType<typeof createBackground>
