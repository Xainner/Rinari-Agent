// El recuadro morado de foco (Mejoras 2026-10-04): los controles generales
// no lo dibujan; con teclado hay un anillo fino y neutro. La marca de la
// respuesta elegida en una pregunta del modelo es selección, no foco, y se
// queda. Se lee el código real, no una copia de los valores.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const src = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', 'src', ...parts), 'utf8')

describe('focus ring', () => {
  it('draws only a neutral keyboard ring outside cascade layers', () => {
    const css = src('styles', 'index.css')
    expect(css).not.toMatch(/button:focus-visible[^{]*\{[^}]*outline:\s*2px/)
    expect(css).not.toMatch(/^:focus-visible\s*\{[^}]*nebula/m)
    expect(css).toMatch(/:where\(:root\[data-input='keyboard'\]\) :focus-visible \{\s*outline: 1\.5px solid var\(--focus-ring\)/)
    // Menu rows show focus with their background, never with an outline.
    expect(css).toMatch(/\[role='menuitem'\][^{]*:focus-visible \{\s*outline: none/)
  })

  it('removes the per-control violet rings but keeps the chosen answer marked', () => {
    expect(src('components', 'ui', 'button.tsx')).not.toContain('focus-visible:ring')
    expect(src('components', 'ui', 'switch.tsx')).not.toContain('focus-visible:ring')
    expect(src('lib', 'ui.ts')).not.toContain('focus:border-nebula')
    expect(src('features', 'questions', 'Questions.tsx')).toContain('ring-1 ring-[var(--accent)]')
  })
})
