// La CSP del esquema app:// (appScheme.ts) sólo admite hojas de estilo y
// fuentes del propio origen. Un @import remoto en el CSS del renderer queda
// bloqueado y la app cae en silencio a las fuentes del sistema: las fuentes de
// marca van empaquetadas.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'index.css'), 'utf8')

it('el CSS del renderer no importa hojas de estilo remotas', () => {
  const imports = css.match(/@import[^;]+;/g) ?? []
  expect(imports.length).toBeGreaterThan(0)
  for (const line of imports) expect(line).not.toMatch(/https?:|\/\//)
})

it('usa las familias que declaran los paquetes empaquetados', () => {
  for (const family of ['Instrument Sans Variable', 'Bricolage Grotesque Variable', 'JetBrains Mono Variable']) {
    expect(css).toContain(`'${family}'`)
  }
})
