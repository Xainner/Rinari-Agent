/**
 * Atajos del navegador nativo, como los de Chrome y Edge (Planka Ideas-2).
 *
 * Compartido: main los atiende cuando el foco está en la página (la vista
 * nativa se queda con las teclas) y el renderer cuando está en la barra.
 * Sin Electron ni DOM: se prueba solo.
 */

export type BrowserShortcut =
  | 'new-tab'
  | 'close-tab'
  | 'next-tab'
  | 'previous-tab'
  | 'reload'
  | 'back'
  | 'forward'
  | 'focus-address'

/** Lo que trae `before-input-event` (y un `keydown` del DOM, con el mismo nombre de campos). */
export interface ShortcutInput {
  type?: string
  key: string
  shift?: boolean
  control?: boolean
  alt?: boolean
  meta?: boolean
}

/**
 * El atajo de una tecla, o `null`. Los de Chrome y Edge: Ctrl+T, Ctrl+W,
 * Ctrl+Tab, Ctrl+R/F5, Alt+←/→ y Ctrl+L. En macOS, Cmd en vez de Ctrl, salvo
 * Ctrl+Tab, que también es Ctrl allí.
 */
export function browserShortcut(input: ShortcutInput, mac: boolean): BrowserShortcut | null {
  if (input.type !== undefined && input.type !== 'keyDown' && input.type !== 'rawKeyDown' && input.type !== 'keydown') {
    return null
  }
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key
  const command = mac ? Boolean(input.meta) : Boolean(input.control)
  const plain = !input.control && !input.meta && !input.alt

  if (input.control && !input.alt && !input.meta && key === 'Tab') return input.shift ? 'previous-tab' : 'next-tab'
  if (command && !input.alt) {
    if (key === 'PageDown') return 'next-tab'
    if (key === 'PageUp') return 'previous-tab'
    if (input.shift) return null
    if (key === 't') return 'new-tab'
    if (key === 'w' || key === 'F4') return 'close-tab'
    if (key === 'r') return 'reload'
    if (key === 'l') return 'focus-address'
    if (key === '[' && mac) return 'back'
    if (key === ']' && mac) return 'forward'
    return null
  }
  if (input.alt && !input.control && !input.meta && !input.shift) {
    if (key === 'ArrowLeft') return 'back'
    if (key === 'ArrowRight') return 'forward'
    if (key === 'd') return 'focus-address'
    return null
  }
  if (plain && !input.shift && key === 'F5') return 'reload'
  if (plain && !input.shift && key === 'F6') return 'focus-address'
  return null
}
