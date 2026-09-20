import { describe, expect, it } from 'vitest'

import { chooseToastLayout, overlaps, toastLane } from './AdaptiveToaster'

const viewport = { width: 1_200, height: 800 }

describe('AdaptiveToaster', () => {
  it('conserva bottom-right cuando no tapa una superficie nativa', () => {
    expect(chooseToastLayout([], viewport)).toEqual({ chosen: 'bottom-right', occlusions: [] })
  })

  it('elige otro carril antes de pedir un recorte nativo', () => {
    const bottomRight = toastLane('bottom-right', viewport.width, viewport.height)
    const result = chooseToastLayout([bottomRight], viewport)
    expect(result.chosen).toBe('top-right')
    expect(result.occlusions).toEqual([])
  })

  it('si ninguna posición cabe, publica sólo la región de la pila', () => {
    const result = chooseToastLayout([{ x: 0, y: 0, ...viewport }], viewport)
    expect(result.chosen).toBe('bottom-right')
    expect(result.occlusions).toEqual([
      toastLane('bottom-right', viewport.width, viewport.height),
    ])
  })

  it('respeta una posición congelada durante la pila', () => {
    const result = chooseToastLayout(
      [toastLane('top-left', viewport.width, viewport.height)],
      viewport,
      'top-left',
    )
    expect(result.chosen).toBe('top-left')
    expect(result.occlusions).toHaveLength(1)
  })

  it('los bordes que sólo se tocan no cuentan como solape', () => {
    expect(overlaps(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 100, y: 0, width: 100, height: 100 },
    )).toBe(false)
  })
})
