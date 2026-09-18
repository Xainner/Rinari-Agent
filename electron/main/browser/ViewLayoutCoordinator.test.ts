// Geometría del slot nativo (documento 03 §8.1, §8.3) y R10-09 de la revisión
// de los PR #10.
//
// El caso que da sentido a todo el fichero es el del scroll que recorta por la
// izquierda: con un solo rectángulo no se puede representar, y reducir el
// ancho desde el origen vuelve a enseñar el principio de la página.
import { describe, expect, it } from 'vitest'

import {
  ViewLayoutCoordinator,
  resolveLayout,
  type SlotLayout,
} from './ViewLayoutCoordinator'

function layout(overrides: Partial<SlotLayout> = {}): SlotLayout {
  return {
    logicalBounds: { x: 100, y: 80, width: 760, height: 560 },
    visibleBounds: { x: 100, y: 80, width: 760, height: 560 },
    shown: true,
    layoutRevision: 1,
    overlayDepth: 0,
    ...overrides,
  }
}

describe('la página se desplaza dentro del recorte', () => {
  it('sin recorte, la página empieza en el origen del contenedor', () => {
    const { container, page } = resolveLayout(layout())
    expect(container).toEqual({ x: 100, y: 80, width: 760, height: 560 })
    expect(page).toEqual({ x: 0, y: 0, width: 760, height: 560 })
  })

  it('recortado por la izquierda, la página se desplaza en negativo', () => {
    // El Board se desplazó 120 DIP: el panel sigue siendo de 760 de ancho,
    // pero su parte izquierda ya no se ve. Con `x: 0` se mostraría otra vez el
    // principio de la página; lo correcto es `-120`.
    const { container, page } = resolveLayout(
      layout({
        logicalBounds: { x: -20, y: 80, width: 760, height: 560 },
        visibleBounds: { x: 100, y: 80, width: 640, height: 560 },
      }),
    )
    expect(container).toEqual({ x: 100, y: 80, width: 640, height: 560 })
    expect(page.x).toBe(-120)
    // Y el viewport del documento no se entera del recorte (§8.2).
    expect(page.width).toBe(760)
    expect(page.height).toBe(560)
  })

  it('recortado por arriba, se desplaza en el otro eje', () => {
    const { page } = resolveLayout(
      layout({
        logicalBounds: { x: 100, y: -40, width: 760, height: 560 },
        visibleBounds: { x: 100, y: 80, width: 760, height: 440 },
      }),
    )
    expect(page.y).toBe(-120)
    expect(page.height).toBe(560)
  })

  it('recortado por la derecha o abajo no necesita desplazamiento', () => {
    const { page } = resolveLayout(
      layout({ visibleBounds: { x: 100, y: 80, width: 300, height: 200 } }),
    )
    expect(page).toEqual({ x: 0, y: 0, width: 760, height: 560 })
  })
})

describe('cuándo se esconde la superficie (§8.3)', () => {
  it('un overlay encima la esconde', () => {
    // Antes de que el modal sea interactivo: un `z-index` del renderer no tapa
    // una vista nativa.
    expect(resolveLayout(layout({ overlayDepth: 1 })).visible).toBe(false)
  })

  it('overlays anidados: cerrar uno no la devuelve', () => {
    expect(resolveLayout(layout({ overlayDepth: 2 })).visible).toBe(false)
    expect(resolveLayout(layout({ overlayDepth: 0 })).visible).toBe(true)
  })

  it('el panel colapsado la esconde', () => {
    expect(resolveLayout(layout({ shown: false })).visible).toBe(false)
  })

  it('un recorte sin área la esconde', () => {
    expect(
      resolveLayout(layout({ visibleBounds: { x: 100, y: 80, width: 0, height: 560 } })).visible,
    ).toBe(false)
  })
})

describe('leases y admisión', () => {
  const content = () => ({ width: 1280, height: 860 })
  const make = () => new ViewLayoutCoordinator(content)

  it('un slot nuevo empieza en revisión cero', () => {
    const lease = make().attach('ses-1')
    expect(lease.sessionId).toBe('ses-1')
    expect(lease.layoutRevision).toBe(0)
  })

  it('una sesión tiene un solo slot: el segundo reemplaza al primero', () => {
    // Dos presentadores sobre el mismo contexto competirían por el espacio, y
    // el panel desmontado seguiría mandando geometría.
    const coordinator = make()
    const first = coordinator.attach('ses-1')
    const second = coordinator.attach('ses-1')
    expect(second.slotId).not.toBe(first.slotId)
    expect(coordinator.update(first.slotId, layout()).ok).toBe(false)
    expect(coordinator.update(second.slotId, layout()).ok).toBe(true)
  })

  it('desmontar retira el lease y no admite más geometría', () => {
    const coordinator = make()
    const lease = coordinator.attach('ses-1')
    expect(coordinator.detach(lease.slotId)).toBe(true)
    expect(coordinator.detach(lease.slotId)).toBe(false)
    expect(coordinator.update(lease.slotId, layout())).toEqual({
      ok: false,
      reason: 'unknown-slot',
    })
  })

  it('la revisión tiene que avanzar', () => {
    const coordinator = make()
    const lease = coordinator.attach('ses-1')
    expect(coordinator.update(lease.slotId, layout({ layoutRevision: 5 })).ok).toBe(true)
    // Una actualización atrasada llega después de que el panel ya se movió.
    expect(coordinator.update(lease.slotId, layout({ layoutRevision: 4 }))).toEqual({
      ok: false,
      reason: 'stale-revision',
    })
    expect(coordinator.update(lease.slotId, layout({ layoutRevision: 5 })).ok).toBe(false)
    expect(coordinator.update(lease.slotId, layout({ layoutRevision: 6 })).ok).toBe(true)
  })

  it.each([
    ['no finito', { logicalBounds: { x: NaN, y: 0, width: 10, height: 10 } }, 'not-finite'],
    ['infinito', { visibleBounds: { x: 0, y: 0, width: Infinity, height: 10 } }, 'not-finite'],
    ['revisión fraccionaria', { layoutRevision: 1.5 }, 'not-finite'],
    ['sin área lógica', { logicalBounds: { x: 0, y: 0, width: 0, height: 560 } }, 'empty'],
    ['desmesurado', { logicalBounds: { x: 0, y: 0, width: 999_999, height: 560 } }, 'too-large'],
  ])('%s se rechaza', (_label, overrides, reason) => {
    const coordinator = make()
    const lease = coordinator.attach('ses-1')
    expect(coordinator.update(lease.slotId, layout(overrides as Partial<SlotLayout>))).toEqual({
      ok: false,
      reason,
    })
  })

  it.each([
    ['a la izquierda de la ventana', { x: -1, y: 0, width: 100, height: 100 }],
    ['por encima', { x: 0, y: -1, width: 100, height: 100 }],
    ['desbordando a la derecha', { x: 1200, y: 0, width: 200, height: 100 }],
    ['desbordando por abajo', { x: 0, y: 800, width: 100, height: 200 }],
  ])('un recorte %s se rechaza', (_label, visibleBounds) => {
    // La geometría no autoriza a pintar fuera del contenido de la ventana.
    const coordinator = make()
    const lease = coordinator.attach('ses-1')
    expect(coordinator.update(lease.slotId, layout({ visibleBounds }))).toEqual({
      ok: false,
      reason: 'outside-window',
    })
  })

  it('una actualización rechazada no mueve la revisión aceptada', () => {
    const coordinator = make()
    const lease = coordinator.attach('ses-1')
    coordinator.update(lease.slotId, layout({ layoutRevision: 3 }))
    coordinator.update(lease.slotId, layout({ layoutRevision: 4, logicalBounds: { x: NaN, y: 0, width: 1, height: 1 } }))
    // La 4 se rechazó por inválida, así que la 4 buena todavía cabe.
    expect(coordinator.update(lease.slotId, layout({ layoutRevision: 4 })).ok).toBe(true)
  })
})
