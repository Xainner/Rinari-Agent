// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { chooseToastLayout, measureToastStack, overlaps, toastLane } from './AdaptiveToaster'

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

  it('usa el tamaño real medido, no una altura fija de 176 px', () => {
    const stack = { width: 372, height: 344 }
    const lane = toastLane('bottom-right', viewport.width, viewport.height, stack)
    expect(lane).toEqual({ x: 812, y: 440, width: 372, height: 344 })
    expect(
      chooseToastLayout([{ x: 800, y: 430, width: 390, height: 360 }], viewport, null, stack)
        .chosen,
    ).toBe('top-right')
  })

  it('mide la unión del árbol entregado por el ref público del Toaster', () => {
    const root = document.createElement('section')
    const first = document.createElement('div')
    const action = document.createElement('button')
    root.append(first, action)
    document.body.append(root)
    Object.defineProperty(root, 'getClientRects', { value: () => [] })
    Object.defineProperty(first, 'getClientRects', {
      value: () => [{ left: 800, top: 400, right: 1180, bottom: 520, width: 380, height: 120 }],
    })
    Object.defineProperty(action, 'getClientRects', {
      value: () => [{ left: 1050, top: 530, right: 1180, bottom: 570, width: 130, height: 40 }],
    })

    expect(measureToastStack(root)).toEqual({ x: 800, y: 400, width: 380, height: 170 })
    root.remove()
  })
})
