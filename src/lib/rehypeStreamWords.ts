/**
 * Texto en streaming (plan 0.4.0 #52). El texto recibido se pinta entero (la
 * altura solo cambia cuando llega un trozo, como siempre: el revelado no mueve
 * el layout cuadro a cuadro) y lo que aún no toca mostrar espera invisible:
 * - palabras antes de `fadeFrom` (ya estaban al montarse): texto normal;
 * - desde `fadeFrom` hasta `shownTo`: `<span class="sw">`, que entra con un
 *   fundido corto al pasar de esperar a visible;
 * - después de `shownTo`: `<span class="sw sw-wait">`, invisible;
 * - la última palabra visible lleva `sw-edge` (el borde de lo revelado; no pinta cursor).
 * Las palabras conservan su nodo mientras el texto crece al final, así que no
 * se vuelven a animar. Offsets del Markdown de origen. El código y las
 * fórmulas no se tocan.
 */
interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  position?: { start?: { offset?: number } }
}

const UNTOUCHED = new Set(['code', 'pre', 'kbd', 'script', 'style', 'math', 'svg'])

interface Walk { fadeFrom: number; shownTo: number; edge: HastNode | null }

function wrap(text: HastNode, walk: Walk): HastNode[] | null {
  const start = text.position?.start?.offset
  const value = text.value ?? ''
  if (start === undefined || start + value.length <= walk.fadeFrom) return null
  const cut = Math.max(0, walk.fadeFrom - start)
  const out: HastNode[] = []
  if (cut > 0) out.push({ type: 'text', value: value.slice(0, cut) })
  let at = start + cut
  // Palabra con su espacio de detrás: el espacio no se anima solo.
  for (const part of value.slice(cut).match(/\s*\S+\s*|\s+/g) ?? []) {
    if (!part.trim()) out.push({ type: 'text', value: part })
    else {
      const word = at + part.search(/\S/)
      const visible = word < walk.shownTo
      const span: HastNode = { type: 'element', tagName: 'span', properties: { className: visible ? ['sw'] : ['sw', 'sw-wait'] }, children: [{ type: 'text', value: part }] }
      if (visible) walk.edge = span
      out.push(span)
    }
    at += part.length
  }
  return out
}

function visit(node: HastNode, walk: Walk) {
  if (!node.children) return
  if (node.type === 'element' && UNTOUCHED.has(node.tagName ?? '')) return
  const className = node.properties?.className
  if (Array.isArray(className) && className.some((name) => String(name).startsWith('katex'))) return
  const next: HastNode[] = []
  for (const child of node.children) {
    if (child.type === 'text') {
      const parts = wrap(child, walk)
      if (parts) next.push(...parts)
      else next.push(child)
    } else {
      visit(child, walk)
      next.push(child)
    }
  }
  node.children = next
}

export default function rehypeStreamWords(options: { fadeFrom: number; shownTo?: number }) {
  return (tree: HastNode) => {
    const walk: Walk = { fadeFrom: options.fadeFrom, shownTo: options.shownTo ?? Number.POSITIVE_INFINITY, edge: null }
    visit(tree, walk)
    if (walk.edge) (walk.edge.properties!.className as string[]).push('sw-edge')
  }
}
