import { useEffect, useRef } from 'react'
import type { ShortcutAction, ShortcutBindings } from '../stores/ui'

/** Serializa un evento de teclado con la misma forma que guardan los bindings. */
export function shortcutFromKeyboardEvent(event: KeyboardEvent): string {
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  return `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${key}`
}

/** Acciones que un diálogo modal abierto no bloquea. */
const ALLOWED_OVER_MODAL: ReadonlySet<ShortcutAction> = new Set<ShortcutAction>(['palette'])

/**
 * Único listener de atajos del shell.
 *
 * - Una pulsación → una acción: se ignoran repeticiones (`event.repeat`) y la
 *   composición IME (`isComposing`).
 * - Con un diálogo modal abierto solo se atiende la paleta, que es a su vez un
 *   diálogo; el resto no debe navegar por debajo del modal.
 * - JS es la autoridad de los atajos configurables; el menú nativo no registra
 *   los mismos aceleradores para no disparar dos veces.
 */
export function useDesktopShortcuts(
  bindings: ShortcutBindings,
  handle: (action: ShortcutAction, event: KeyboardEvent) => void,
): void {
  const handleRef = useRef(handle)
  useEffect(() => {
    handleRef.current = handle
  })
  useEffect(() => {
    const entries = Object.entries(bindings) as Array<[ShortcutAction, string]>
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.isComposing) return
      const pressed = shortcutFromKeyboardEvent(event).toUpperCase()
      const action = entries.find(([, shortcut]) => shortcut.toUpperCase() === pressed)?.[0]
      if (!action) return
      if (!ALLOWED_OVER_MODAL.has(action) && document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      handleRef.current(action, event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bindings])
}
