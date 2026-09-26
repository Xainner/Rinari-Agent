/**
 * Heurística pura: ¿el texto trae mates ($…$ o $$…$$)?
 * Ignora \$ escapados y $ al final de línea típicos de precios ("cuesta $").
 */
export function containsMath(text: string): boolean {
  const stripped = text.replace(/\\\$/g, '')
  return /\$\$[^$]+\$\$/.test(stripped) || /(^|[^\w$])\$[^\s$][^$\n]*\$/.test(stripped)
}

/**
 * Importes antes de detectar mates: un `$` seguido de un número (`$15`,
 * `$ 1.200`, `US$20`) es dinero, y dos importes en una línea se leían como
 * una fórmula KaTeX ilegible. Se escapan fuera de los bloques y del código en
 * línea; `$x^2$` o `$\alpha$` siguen siendo mates.
 */
export function escapeCurrency(text: string): string {
  if (!text.includes('$')) return text
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/(?<!\\)\$(?=\s?\d)/g, '\\$')))
    .join('')
}
