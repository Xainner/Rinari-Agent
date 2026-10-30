export type ImageOperation = 'generate' | 'edit' | 'variations' | 'upscale' | 'remove_background'

/**
 * Qué herramienta de un servidor MCP parece hacer cada operación de imagen,
 * solo por su nombre (el Engine no da aún el esquema de cada una). Es una
 * propuesta: el dueño la revisa antes de agregar. Primero las operaciones más
 * concretas («quitar fondo» antes que «editar», que antes que «crear»), y una
 * herramienta sirve a una sola operación.
 */
const PATTERNS: ReadonlyArray<[ImageOperation, RegExp]> = [
  ['remove_background', /remove[_\-\s.]?(the[_\-\s.]?)?b(ack)?g(round)?|rembg|background[_\-\s.]?remov|no[_\-\s.]?bg|cutout/],
  ['upscale', /upscal|super[_\-\s.]?res|enlarge|(^|[_\-\s.])enhance/],
  ['variations', /variation|(^|[_\-\s.])vary|remix/],
  ['edit', /(^|[_\-\s.])edit|inpaint|img2img|image[_\-\s.]?to[_\-\s.]?image|modify/],
  ['generate', /generat|(^|[_\-\s.])create|txt2img|text[_\-\s.]?to[_\-\s.]?image|imagine|(^|[_\-\s.])draw/],
]

export function matchImageTools(names: readonly string[]): Partial<Record<ImageOperation, string>> {
  const found: Partial<Record<ImageOperation, string>> = {}
  const used = new Set<string>()
  for (const [operation, pattern] of PATTERNS) {
    const name = names.find((candidate) => !used.has(candidate) && pattern.test(candidate.toLowerCase()))
    if (!name) continue
    found[operation] = name
    used.add(name)
  }
  return found
}
