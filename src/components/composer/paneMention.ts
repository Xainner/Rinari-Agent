/**
 * Mensaje directo a otro panel desde el compositor: `@Panel texto…`.
 *
 * Solo cuenta la mención **al inicio** del mensaje y solo si coincide con la
 * etiqueta de un panel del board (comparación sin mayúsculas ni acentos, la
 * etiqueta más larga gana). Cualquier otra `@` sigue siendo una referencia de
 * archivo del workspace, como hasta ahora.
 */
export interface PaneMentionTarget {
  id: string
  label: string
}

export interface PaneMention {
  target: PaneMentionTarget
  /** Texto tras la mención, ya recortado. Vacío si el usuario solo escribió `@Panel`. */
  message: string
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Paneles cuya etiqueta contiene la consulta (`@doc` → «Docs»). */
export function matchPaneTargets(query: string, targets: readonly PaneMentionTarget[]): PaneMentionTarget[] {
  const needle = fold(query.trim())
  const matches = targets.filter((target) => needle === '' || fold(target.label).includes(needle))
  // Primero los que empiezan por la consulta, después el resto, estable.
  return matches.sort((a, b) => Number(fold(b.label).startsWith(needle)) - Number(fold(a.label).startsWith(needle)))
}

/** `@Panel mensaje` → destino y mensaje; `null` si no empieza por una etiqueta conocida. */
export function parsePaneMention(text: string, targets: readonly PaneMentionTarget[]): PaneMention | null {
  if (!text.startsWith('@') || targets.length === 0) return null
  const body = text.slice(1)
  const folded = fold(body)
  let best: PaneMentionTarget | null = null
  for (const target of targets) {
    const label = fold(target.label)
    if (!label) continue
    if (!folded.startsWith(label)) continue
    const next = folded.charAt(label.length)
    if (next !== '' && !/\s/.test(next)) continue
    if (!best || target.label.length > best.label.length) best = target
  }
  if (!best) return null
  return { target: best, message: body.slice(best.label.length).trim() }
}

/** Consulta de autocompletado: el texto es solo `@` más un fragmento sin espacios. */
export function paneMentionQuery(text: string): string | null {
  const match = text.match(/^@([^\s]*)$/)
  return match ? match[1] : null
}
