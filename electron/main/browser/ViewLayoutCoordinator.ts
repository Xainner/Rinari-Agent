/**
 * Geometría del slot nativo (documento 03 §8.1 y §8.3).
 *
 * React reserva el espacio y main coloca la vista. Lo que viaja entre ambos es
 * este DTO, no llamadas a `setBounds`: el renderer no decide dónde se pinta
 * una superficie nativa.
 *
 * **Por qué hay dos rectángulos.** `logicalBounds` es dónde estaría el panel
 * si nada lo tapara, y `visibleBounds` es lo que de verdad se ve. Con un solo
 * rectángulo no se puede representar que el scroll de un Board haya recortado
 * el slot **por la izquierda**: reducir el ancho desde el origen muestra otra
 * vez el principio de la página en vez de la parte que toca. La página se
 * coloca dentro del contenedor desplazada por la diferencia:
 *
 *     contenedor = visibleBounds
 *     página.x   = logicalBounds.x - visibleBounds.x    // negativo al recortar
 *     página.y   = logicalBounds.y - visibleBounds.y
 *     página.wh  = logicalBounds.wh                     // el viewport no cambia
 *
 * Todo en DIP. La sonda midió que `setBounds` no lleva `devicePixelRatio`
 * (§8.2); las capturas son otro espacio de coordenadas.
 *
 * Sin dependencias de Electron: la aritmética y las reglas de admisión se
 * prueban sin abrir una ventana.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Lo que el renderer envía por cada cambio de layout. */
export interface SlotLayout {
  /** Dónde estaría el panel entero, en coordenadas del contenido de ventana. */
  logicalBounds: Rect
  /** Lo que queda visible tras scroll, colapso o recorte del contenedor. */
  visibleBounds: Rect
  /** `false` oculta el presentador sin cerrar nada (§8.3). */
  shown: boolean
  /** Creciente. Una revisión vieja llega tarde y se descarta. */
  layoutRevision: number
  /** Cuántos overlays hay encima ahora mismo; >0 esconde la superficie. */
  overlayDepth: number
  /** Rectángulos DOM que deben quedar por encima de la superficie nativa. */
  occlusions?: Rect[]
}

/** Lo que main coloca de verdad. */
export interface ResolvedLayout {
  container: Rect
  page: Rect
  visible: boolean
}

export interface SlotLease {
  slotId: string
  sessionId: string
  layoutRevision: number
}

export type LayoutRejection =
  | 'unknown-slot'
  | 'stale-revision'
  | 'not-finite'
  | 'empty'
  | 'too-large'
  | 'outside-window'

/** Tope defensivo: ningún panel legítimo se acerca. */
const MAX_EDGE = 20_000

function finite(rect: Rect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(
    (value) => typeof value === 'number' && Number.isFinite(value),
  )
}

/**
 * Coloca la página dentro del contenedor conservando su tamaño lógico.
 *
 * Es la parte que hacía falta y no existía: sin el desplazamiento negativo, un
 * slot recortado por la izquierda volvía a enseñar el principio de la página.
 */
export function resolveLayout(layout: SlotLayout): ResolvedLayout {
  const { logicalBounds: logical } = layout
  const visible = largestUnoccluded(layout.visibleBounds, layout.occlusions ?? [])
  return {
    container: { ...visible },
    page: {
      x: Math.round(logical.x - visible.x),
      y: Math.round(logical.y - visible.y),
      width: Math.round(logical.width),
      height: Math.round(logical.height),
    },
    // Un overlay encima esconde la superficie **antes** de que el modal sea
    // interactivo; un `z-index` del renderer no tapa una vista nativa (§8.3).
    visible: layout.shown && layout.overlayDepth === 0 && visible.width >= 64 && visible.height >= 64,
  }
}

function area(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height)
}

/** Conserva el mayor rectángulo contiguo; nunca estira ni mueve el viewport. */
export function largestUnoccluded(source: Rect, occlusions: Rect[]): Rect {
  const right = source.x + source.width
  const bottom = source.y + source.height
  const relevant = occlusions.filter(
    (block) =>
      block.x < right &&
      block.x + block.width > source.x &&
      block.y < bottom &&
      block.y + block.height > source.y,
  )
  const xs = [
    ...new Set([
      source.x,
      right,
      ...relevant.flatMap((block) => [
        Math.max(source.x, block.x),
        Math.min(right, block.x + block.width),
      ]),
    ]),
  ].sort((a, b) => a - b)
  const ys = [
    ...new Set([
      source.y,
      bottom,
      ...relevant.flatMap((block) => [
        Math.max(source.y, block.y),
        Math.min(bottom, block.y + block.height),
      ]),
    ]),
  ].sort((a, b) => a - b)

  let best: Rect = { x: source.x, y: source.y, width: 0, height: 0 }
  for (let leftIndex = 0; leftIndex < xs.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < xs.length; rightIndex += 1) {
      for (let topIndex = 0; topIndex < ys.length - 1; topIndex += 1) {
        for (let bottomIndex = topIndex + 1; bottomIndex < ys.length; bottomIndex += 1) {
          const candidate = {
            x: xs[leftIndex]!,
            y: ys[topIndex]!,
            width: xs[rightIndex]! - xs[leftIndex]!,
            height: ys[bottomIndex]! - ys[topIndex]!,
          }
          const blocked = relevant.some((block) =>
            candidate.x < block.x + block.width &&
            candidate.x + candidate.width > block.x &&
            candidate.y < block.y + block.height &&
            candidate.y + candidate.height > block.y,
          )
          if (!blocked && area(candidate) > area(best)) best = candidate
        }
      }
    }
  }
  return best
}

/**
 * Lleva los leases de slot y valida cada actualización.
 *
 * El lease lo emite main. El renderer no nombra una ventana ni un
 * `webContentsId`: pide un slot para **su** sesión y recibe un identificador
 * opaco que sólo sirve aquí.
 */
export class ViewLayoutCoordinator {
  private readonly slots = new Map<string, SlotLease>()
  /** Un solo slot visible por sesión: dos presentadores competirían. */
  private readonly bySession = new Map<string, string>()
  private counter = 0

  constructor(
    /** Área de contenido de la ventana, en DIP. Acota lo que se puede pedir. */
    private readonly contentBounds: () => { width: number; height: number },
    private readonly mintId: () => string = () => `slot-${++this.counter}`,
  ) {}

  /** Reserva el slot de una sesión. Reemplaza el anterior si lo había. */
  attach(sessionId: string): SlotLease {
    const previous = this.bySession.get(sessionId)
    if (previous) this.slots.delete(previous)
    const lease: SlotLease = { slotId: this.mintId(), sessionId, layoutRevision: 0 }
    this.slots.set(lease.slotId, lease)
    this.bySession.set(sessionId, lease.slotId)
    return lease
  }

  /**
   * Retira el slot y dice **de quién era**. No cierra el contexto ni cancela
   * nada (§8.3), pero quien llama necesita la sesión: olvidar el lease no
   * despinta nada por sí solo, y sin este dato no hay forma de saber qué
   * presentación hay que esconder.
   *
   * `undefined` cuando el slot ya no existe —un desmontaje tardío tras haberse
   * reemplazado el lease—, y entonces no hay presentación que retirar: la que
   * está montada es de otro slot.
   */
  detach(slotId: string): SlotLease | undefined {
    const lease = this.slots.get(slotId)
    if (!lease) return undefined
    this.slots.delete(slotId)
    if (this.bySession.get(lease.sessionId) === slotId) this.bySession.delete(lease.sessionId)
    return lease
  }

  /**
   * Retira todos los slots y los devuelve.
   *
   * Para cuando el renderer que los reservó deja de existir —una recarga no
   * ejecuta la limpieza de React— y sus leases quedarían vivos sin nadie que
   * los actualizara ni los soltara.
   */
  detachAll(): SlotLease[] {
    const leases = [...this.slots.values()]
    this.slots.clear()
    this.bySession.clear()
    return leases
  }

  leaseFor(sessionId: string): SlotLease | undefined {
    const slotId = this.bySession.get(sessionId)
    return slotId ? this.slots.get(slotId) : undefined
  }

  get size(): number {
    return this.slots.size
  }

  /**
   * Admite una actualización de geometría, o dice por qué no.
   *
   * Rechaza números no finitos, revisiones atrasadas, rectángulos vacíos o
   * desmesurados y cualquier cosa fuera del contenido de la ventana: la
   * geometría no autoriza a pintar donde al renderer le apetezca.
   */
  update(
    slotId: string,
    layout: SlotLayout,
  ): { ok: true; lease: SlotLease; resolved: ResolvedLayout } | { ok: false; reason: LayoutRejection } {
    const lease = this.slots.get(slotId)
    if (!lease) return { ok: false, reason: 'unknown-slot' }

    if (
      !finite(layout.logicalBounds) ||
      !finite(layout.visibleBounds) ||
      (layout.occlusions ?? []).some((rect) => !finite(rect)) ||
      !Number.isFinite(layout.layoutRevision) ||
      !Number.isInteger(layout.layoutRevision) ||
      layout.layoutRevision < 0
    ) {
      return { ok: false, reason: 'not-finite' }
    }
    // Una revisión que no avanza llegó tarde: el panel ya se movió otra vez.
    if (layout.layoutRevision <= lease.layoutRevision) {
      return { ok: false, reason: 'stale-revision' }
    }
    if (layout.logicalBounds.width <= 0 || layout.logicalBounds.height <= 0) {
      return { ok: false, reason: 'empty' }
    }
    if (
      layout.logicalBounds.width > MAX_EDGE ||
      layout.logicalBounds.height > MAX_EDGE ||
      layout.visibleBounds.width > MAX_EDGE ||
      layout.visibleBounds.height > MAX_EDGE ||
      (layout.occlusions ?? []).some((rect) => rect.width > MAX_EDGE || rect.height > MAX_EDGE)
    ) {
      return { ok: false, reason: 'too-large' }
    }

    const content = this.contentBounds()
    const visible = layout.visibleBounds
    if (
      visible.x < 0 ||
      visible.y < 0 ||
      visible.x + visible.width > content.width ||
      visible.y + visible.height > content.height
    ) {
      return { ok: false, reason: 'outside-window' }
    }

    lease.layoutRevision = layout.layoutRevision
    return { ok: true, lease, resolved: resolveLayout(layout) }
  }
}
