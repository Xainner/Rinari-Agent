// Zoom del menú de aplicación (documento 02 §5.2). El resto del menú se
// construye con la API de Electron y se verifica en el smoke; los límites del
// zoom son lógica portada del host anterior y se prueban aparte.
import { describe, expect, it } from 'vitest'

import { nextZoom } from './menu'

describe('zoom del menú', () => {
  it('sube y baja en pasos de 0,1', () => {
    expect(nextZoom(1, 'zoom-in')).toBeCloseTo(1.1)
    expect(nextZoom(1, 'zoom-out')).toBeCloseTo(0.9)
  })

  it('respeta los topes del host anterior', () => {
    // 0,5 y 2,0: por debajo la UI deja de ser legible y por encima se rompe.
    expect(nextZoom(2, 'zoom-in')).toBe(2)
    expect(nextZoom(0.5, 'zoom-out')).toBe(0.5)
  })

  it('el tamaño real vuelve a 1 desde donde sea', () => {
    expect(nextZoom(1.7, 'zoom-reset')).toBe(1)
    expect(nextZoom(0.6, 'zoom-reset')).toBe(1)
  })
})
