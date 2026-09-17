/**
 * Identidad estable del perfil local del cliente. Sirve para separar registros
 * por instalación (recibos de lectura, cachés) sin depender de la versión del
 * software ni de nada que envíe el modelo. Se genera una vez y se conserva en
 * `localStorage`; si el almacenamiento falla, se usa un valor de sesión.
 */
const STORAGE_KEY = 'rinari.profile.v1'

let cached: string | null = null

function generate(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `profile_${random}`
}

export function getProfileKey(): string {
  if (cached) return cached
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && /^profile_[A-Za-z0-9-]{8,}$/.test(stored)) {
      cached = stored
      return stored
    }
    const fresh = generate()
    window.localStorage.setItem(STORAGE_KEY, fresh)
    cached = fresh
    return fresh
  } catch {
    cached = generate()
    return cached
  }
}

/** Solo tests: olvida la clave cacheada. */
export function resetProfileKeyForTests(): void {
  cached = null
}
