/**
 * Arrastrar una conversación desde la barra lateral al board (plan-boards
 * B.4.2). El tipo propio separa este arrastre de los archivos (que van al
 * composer) y de los del árbol de Archivos.
 */
export const SESSION_DRAG_TYPE = 'application/x-rinari-session'

export function isSessionDrag(types: readonly string[] | DOMStringList): boolean {
  return Array.from(types as ArrayLike<string>).includes(SESSION_DRAG_TYPE)
}

/**
 * Dónde caerá: el índice antes del primer panel cuyo centro queda a la
 * derecha del puntero, o al final. `rects` son los paneles en orden.
 */
export function dropIndex(clientX: number, rects: ReadonlyArray<{ left: number; width: number }>): number {
  const index = rects.findIndex((rect) => clientX < rect.left + rect.width / 2)
  return index < 0 ? rects.length : index
}
