/**
 * Anclas de scroll por sesión, en memoria (no se persisten: son estado de
 * ejecución, no de modelo). Un transcript guarda antes de desmontarse la fila
 * superior visible y el desplazamiento dentro de ella, o «seguir el final»;
 * al volver a montarse (expandir un panel, volver a Normal) restaura después
 * de hidratar las filas virtualizadas. Si el usuario estaba al final, sigue
 * el final; si leía arriba, no se le lleva abajo.
 */
export type ScrollAnchor =
  | { follow: true }
  | { follow: false; rowId: string; offset: number }

const anchors = new Map<string, ScrollAnchor>()

export function saveScrollAnchor(sessionId: string, anchor: ScrollAnchor): void {
  if (!sessionId) return
  anchors.set(sessionId, anchor)
}

export function readScrollAnchor(sessionId: string): ScrollAnchor | null {
  return anchors.get(sessionId) ?? null
}

export function forgetScrollAnchor(sessionId: string): void {
  anchors.delete(sessionId)
}

/** Solo tests. */
export function resetScrollAnchorsForTests(): void {
  anchors.clear()
}
