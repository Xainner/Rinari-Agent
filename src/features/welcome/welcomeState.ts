/**
 * Si la bienvenida de primer uso ya se vio (#71): respondida o saltada, no
 * vuelve sola. Se guarda en el almacenamiento de la app; sin él, se muestra.
 */
const KEY = 'rinari.welcome.seen'

export function welcomeSeen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // Sin almacenamiento, la bienvenida puede volver a salir; no rompe nada.
  }
}
