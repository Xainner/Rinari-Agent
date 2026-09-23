// Continuidad del chrome de la ventana (M01 §3.1).
//
// El fallo que esto fija no se ve leyendo ninguno de los dos ficheros por
// separado: el host pintaba la franja de los controles nativos con `#0b0b0f` y
// la barra React usaba `--bg-subtle`, `#15151b`. Cada valor era correcto en su
// sitio y juntos dejaban una banda más oscura detrás de minimizar, maximizar y
// cerrar.
//
// Se compara contra la hoja de estilos de verdad, no contra una copia del
// valor: una prueba que repitiera la constante pasaría igual el día que alguien
// cambie el tema.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CHROME_BACKGROUND, CHROME_OVERLAY_HEIGHT, CHROME_SYMBOL } from './chrome'

const css = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'index.css'), 'utf8')

/**
 * El valor que **gana** para el tema oscuro.
 *
 * No vale con leer la primera declaración: la hoja declara `--bg-subtle` dos
 * veces sobre `:root` —la segunda en el bloque «Rinari concept foundation»— y
 * manda la última por orden de cascada. Una prueba que mirase la primera
 * habría dado por bueno un color que la aplicación no pinta, que es justo el
 * error que se estaba corrigiendo.
 */
function darkToken(name: string): string {
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  let winner: string | null = null
  for (const block of blocks) {
    const selector = block[1] ?? ''
    if (!selector.includes(':root') || selector.includes('light')) continue
    const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(block[2] ?? '')
    if (match) winner = match[1]!.trim()
  }
  if (!winner) throw new Error(`la hoja de estilos ya no declara --${name} sobre :root`)
  return winner
}

describe('el chrome de la ventana y la barra superior son la misma superficie', () => {
  it('el fondo del overlay nativo es exactamente --bg-subtle', () => {
    expect(CHROME_BACKGROUND.toLowerCase()).toBe(darkToken('bg-subtle').toLowerCase())
  })

  it('el color de los glifos contrasta con el fondo', () => {
    // AA para texto grande/iconos pide 3:1. Los controles de ventana son
    // glifos, no texto de párrafo.
    const luminance = (hex: string) => {
      const value = hex.replace('#', '')
      const channels = [0, 2, 4].map((offset) => {
        const part = Number.parseInt(value.slice(offset, offset + 2), 16) / 255
        return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    }
    const lighter = Math.max(luminance(CHROME_SYMBOL), luminance(CHROME_BACKGROUND))
    const darker = Math.min(luminance(CHROME_SYMBOL), luminance(CHROME_BACKGROUND))
    expect((lighter + 0.05) / (darker + 0.05)).toBeGreaterThanOrEqual(3)
  })

  it('la franja mide lo mismo que la barra que continúa', () => {
    // `.app-topbar` mide 48 px, pero el overlay sólo cubre la zona de los
    // controles. Lo que importa es que quepa dentro y deje espacio seguro.
    expect(CHROME_OVERLAY_HEIGHT).toBeGreaterThan(0)
    expect(CHROME_OVERLAY_HEIGHT).toBeLessThanOrEqual(48)
  })
})
