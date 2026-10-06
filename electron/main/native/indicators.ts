/**
 * Indicadores de atención fuera de la ventana: el número de chats pendientes
 * sobre el icono de la barra de tareas (overlay de Windows) y una marca de
 * color con símbolo en el icono de la bandeja.
 *
 * El renderer calcula el estado (recibos de lectura, aprobaciones, preguntas)
 * y lo manda entero —«hay N», nunca «suma uno»—, con una generación que
 * impide que un envío viejo pise uno nuevo. Main solo valida, recuerda el
 * último y elige iconos empaquetados: no recibe rutas ni imágenes del
 * renderer, y no recalcula nada a partir de eventos del Engine.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { nativeImage, type BrowserWindow, type NativeImage } from 'electron'

import { ValidationError } from '../../shared/validation'

import type { AttentionCategory, AttentionIndicators } from '../../shared/indicators'

export type { AttentionCategory, AttentionIndicators }
export const ATTENTION_CATEGORIES: readonly AttentionCategory[] = ['none', 'needs_you', 'failed', 'done', 'other']

const MAX_TEXT = 160

function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100_000) {
    throw new ValidationError(`${field} must be a non-negative integer`)
  }
  return value
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT) throw new ValidationError(`${field} must be text up to ${MAX_TEXT} characters`)
  return value
}

export function assertIndicators(value: unknown): AttentionIndicators {
  if (!value || typeof value !== 'object') throw new ValidationError('indicators must be an object')
  const raw = value as Record<string, unknown>
  if (typeof raw.generation !== 'number' || !Number.isFinite(raw.generation) || raw.generation < 0) {
    throw new ValidationError('generation must be a non-negative number')
  }
  if (!ATTENTION_CATEGORIES.includes(raw.category as AttentionCategory)) throw new ValidationError('unknown attention category')
  const state: AttentionIndicators = {
    generation: raw.generation,
    count: count(raw.count, 'count'),
    category: raw.category as AttentionCategory,
    working: count(raw.working, 'working'),
    tooltip: text(raw.tooltip, 'tooltip'),
    description: text(raw.description, 'description'),
  }
  // Sin pendientes no hay categoría que pintar, y al revés.
  if ((state.count === 0) !== (state.category === 'none')) throw new ValidationError('category and count disagree')
  return state
}

/** Archivo de la insignia del número; `null` = sin overlay. Se prueba sin Electron. */
export function overlayAsset(state: Pick<AttentionIndicators, 'count' | 'category'>): string | null {
  if (state.count === 0 || state.category === 'none') return null
  return `overlay-${state.category}-${state.count > 9 ? '9plus' : state.count}.png`
}

/** Variante de la cara de la bandeja; `null` = el icono de siempre. */
export function trayAsset(state: Pick<AttentionIndicators, 'category'>): string | null {
  return state.category === 'none' ? null : `tray-${state.category}.png`
}

export interface IndicatorDeps {
  getWindow(): BrowserWindow | null
  /** Aplica la cara y el texto al icono de la bandeja si existe (y los recuerda si no). */
  setTray(image: NativeImage | null, tooltip: string): void
  /** Carpeta de build/indicators (empaquetada como `indicators`). */
  dir(): string
  platform?: NodeJS.Platform
}

export function indicatorsDir(isPackaged: boolean, resourcesPath: string, dirname: string): string {
  return isPackaged ? join(resourcesPath, 'indicators') : join(dirname, '..', 'build', 'indicators')
}

export function createIndicators(deps: IndicatorDeps) {
  let last: AttentionIndicators | null = null
  const images = new Map<string, NativeImage | null>()
  const image = (name: string | null): NativeImage | null => {
    if (!name) return null
    if (!images.has(name)) {
      // createFromPath toma solo la variante @2x en pantallas con escala.
      const path = join(deps.dir(), name)
      const loaded = existsSync(path) ? nativeImage.createFromPath(path) : null
      images.set(name, loaded && !loaded.isEmpty() ? loaded : null)
    }
    return images.get(name) ?? null
  }

  const paint = (state: AttentionIndicators) => {
    if ((deps.platform ?? process.platform) === 'win32') {
      const window = deps.getWindow()
      if (window && !window.isDestroyed()) window.setOverlayIcon(image(overlayAsset(state)), state.count > 0 ? state.description : '')
    }
    // Falta la variante: queda el icono de siempre, con el texto al día.
    deps.setTray(image(trayAsset(state)), state.tooltip)
  }

  return {
    apply(state: AttentionIndicators): boolean {
      if (last && state.generation < last.generation) return false
      last = state
      paint(state)
      return true
    },
    /** Ventana recreada o mostrada de nuevo: repinta lo último sin avisar de nada. */
    reapply(): void {
      if (last) paint(last)
    },
    current: () => last,
  }
}
