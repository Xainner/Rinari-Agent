// Textos visibles en inglés escritos a mano en un componente (#68): todo lo
// que lee el dueño pasa por `es.ts` / `en.ts`. Busca texto JSX y los atributos
// que se ven o se leen en voz alta (title, aria-label, placeholder, alt) con
// palabras comunes del inglés. Los nombres propios y los ejemplos técnicos
// (rutas, comandos, URL) van en la lista de excepciones.
import { expect, it } from 'vitest'

const ENGLISH = /\b(the|and|to|of|is|are|not|no|failed|error|open|close|save|cancel|delete|loading|retry|copy|settings|file|files|new|show|hide|view|more|less|done|running|click|select|add|remove|search|send|stop|continue|back|next)\b/i
const JSX_TEXT = /(?<![=-])>\s*([A-Za-z][A-Za-z ,.'!?:-]{2,}?)\s*</g
const ATTR = /\b(?:title|aria-label|placeholder|alt)="([^"{}]{2,})"/g
/** Lo que se queda como está: nombres de productos, ejemplos técnicos y términos de la consola. */
const ALLOWED = new Set(['Rinari Agent', 'Rinari', 'GitHub', 'English', 'Boards', 'Workspace', 'PLAN', 'BUILD', 'REVIEW', 'JSON', 'stdout', 'stderr', 'PowerShell', 'bash'])

it('no component shows hand-written English (it goes through es.ts / en.ts)', () => {
  const found: string[] = []
  const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  for (const [file, source] of Object.entries(sources)) {
    if (/\.(test|preview)\.tsx$/.test(file)) continue
    source.split('\n').forEach((line, index) => {
      // Type positions (`Promise<void>`, generics) are not visible text.
      const visible = line.replace(/:\s*[A-Za-z<>[\], |]+=>/g, '')
      for (const match of [...visible.matchAll(JSX_TEXT), ...visible.matchAll(ATTR)]) {
        const text = match[1].trim()
        if (ALLOWED.has(text) || !ENGLISH.test(text)) continue
        found.push(`${file}:${index + 1}: ${text}`)
      }
    })
  }
  expect(found).toEqual([])
})
