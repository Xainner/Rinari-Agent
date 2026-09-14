export type Theme = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'rinari.theme'

export function normalizeTheme(v: unknown): Theme {
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function getStoredTheme(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function resolveTheme(theme: Theme, systemDark: boolean): ResolvedTheme {
  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'
  return systemDark ? 'dark' : 'light'
}

/** Aplica el tema al <html> antes de pintar (también lo usa el boot inline). */
export function applyTheme(_theme: Theme): ResolvedTheme {
  document.documentElement.dataset.theme = 'dark'
  document.documentElement.style.colorScheme = 'dark'
  return 'dark'
}
