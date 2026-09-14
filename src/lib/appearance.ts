/** Acentos e prefs de apariencia/movimiento (§20). El acento vive en `data-accent` del <html>. */

export type Accent = 'nebula' | 'cyan' | 'fuchsia' | 'blue' | 'green' | 'orange'

export const ACCENTS: Accent[] = ['nebula', 'cyan', 'fuchsia', 'blue', 'green', 'orange']

/** Color representativo (modo oscuro) para el swatch de cada preset. */
export const ACCENT_SWATCH: Record<Accent, string> = {
  nebula: '#8b5cf6',
  cyan: '#22d3ee',
  fuchsia: '#e879f9',
  blue: '#60a5fa',
  green: '#34d399',
  orange: '#fb923c',
}

const ACCENT_KEY = 'rinari.accent'
const MOTION_KEY = 'rinari.reduceMotion'

export function normalizeAccent(v: unknown): Accent {
  return typeof v === 'string' && (ACCENTS as string[]).includes(v) ? (v as Accent) : 'nebula'
}

export function getStoredAccent(): Accent {
  try {
    return normalizeAccent(localStorage.getItem(ACCENT_KEY))
  } catch {
    return 'nebula'
  }
}

export function storeAccent(accent: Accent): void {
  try {
    localStorage.setItem(ACCENT_KEY, accent)
  } catch {
    /* ignore */
  }
}

/** Aplica el preset al <html> (también lo usa el boot inline). */
export function applyAccent(_accent: Accent): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.accent = 'nebula'
}

export function getStoredReduceMotion(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) === '1'
  } catch {
    return false
  }
}

export function storeReduceMotion(reduce: boolean): void {
  try {
    localStorage.setItem(MOTION_KEY, reduce ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** `prefers-reduced-motion` del SO siempre se respeta vía CSS; este toggle lo fuerza. */
export function applyReduceMotion(reduce: boolean): void {
  if (typeof document === 'undefined') return
  if (reduce) document.documentElement.dataset.motion = 'reduced'
  else delete document.documentElement.dataset.motion
}
