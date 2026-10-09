/**
 * Cómo usa la persona la app ahora mismo: `keyboard` o `pointer`, en
 * `<html data-input>`. El CSS dibuja el anillo de foco solo con teclado.
 * `:focus-visible` no basta: Chromium lo activa también cuando un menú mueve
 * el foco al pasar el ratón si antes se escribió algo, y de ahí salía el
 * recuadro morado «al primer uso».
 */
export function trackInputModality(root: HTMLElement = document.documentElement): () => void {
  const set = (value: 'keyboard' | 'pointer') => {
    if (root.dataset.input !== value) root.dataset.input = value
  }
  const onKey = (event: KeyboardEvent) => {
    // Un atajo con modificador no es navegar por la interfaz.
    if (event.metaKey || event.ctrlKey || event.altKey) return
    set('keyboard')
  }
  const onPointer = () => set('pointer')
  set('pointer')
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('pointermove', onPointer, { capture: true, passive: true })
  return () => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('pointerdown', onPointer, true)
    window.removeEventListener('pointermove', onPointer, true)
  }
}
