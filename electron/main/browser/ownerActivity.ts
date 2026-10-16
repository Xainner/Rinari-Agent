/**
 * ¿Es esto el dueño usando el navegador? (plan 0.4.0 #46)
 *
 * El control ya no tiene botones: el dueño lo toma con solo usar la página
 * (un clic, la rueda, una tecla, o mover el ratón dentro un momento) y el
 * agente lo retoma cuando lleva un rato sin tocarla. Para eso main escucha la
 * entrada de cada vista (`before-input-event`, `before-mouse-event`), y tiene
 * que separar la del dueño de la que el agente despacha por CDP, que pasa por
 * el mismo camino.
 *
 * Mientras una orden `Input.*` del agente está en vuelo (y un instante
 * después, lo que tarda en llegar su eco) nada cuenta como del dueño. Pasar
 * el ratón por encima camino del composer tampoco: el movimiento tiene que
 * seguir un momento dentro de la página.
 *
 * Sin Electron: se prueba con un reloj falso.
 */

export type OwnerInputKind =
  | 'mouseDown'
  | 'mouseUp'
  | 'mouseMove'
  | 'mouseWheel'
  | 'mouseEnter'
  | 'mouseLeave'
  | 'contextMenu'
  | 'keyDown'
  | 'keyUp'
  | 'char'
  | 'blur'
  | 'other'

/** Lo que tarda en llegar el eco de una orden del agente tras responder. */
export const AGENT_ECHO_MS = 150
/** Mover el ratón dentro de la página cuenta tras este tiempo seguido. */
export const SUSTAINED_MOVE_MS = 400
/** Dos movimientos más separados que esto son pasadas distintas. */
const MOVE_GAP_MS = 250

export class OwnerActivity {
  private agentInputs = 0
  private agentQuietUntil = 0
  private moveStartedAt: number | null = null
  private lastMoveAt = 0

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Una orden `Input.*` del agente empieza. */
  beginAgentInput(): void {
    this.agentInputs += 1
  }

  /** Y termina: su eco puede llegar todavía un instante después. */
  endAgentInput(): void {
    this.agentInputs = Math.max(0, this.agentInputs - 1)
    this.agentQuietUntil = this.now() + AGENT_ECHO_MS
  }

  private agentTyping(at: number): boolean {
    return this.agentInputs > 0 || at < this.agentQuietUntil
  }

  /** `true` cuando esta entrada es del dueño usando la página. */
  observe(kind: OwnerInputKind): boolean {
    const at = this.now()
    if (this.agentTyping(at)) {
      this.moveStartedAt = null
      return false
    }
    switch (kind) {
      case 'mouseDown':
      case 'mouseWheel':
      case 'contextMenu':
      case 'keyDown':
        return true
      case 'mouseMove': {
        if (this.moveStartedAt === null || at - this.lastMoveAt > MOVE_GAP_MS) this.moveStartedAt = at
        this.lastMoveAt = at
        return at - this.moveStartedAt >= SUSTAINED_MOVE_MS
      }
      case 'mouseLeave':
        this.moveStartedAt = null
        return false
      default:
        return false
    }
  }
}

/**
 * ¿Está el foco donde el agente no debe interrumpir? Una contraseña, o un
 * campo de texto que ya tiene algo escrito. Se evalúa en un mundo aislado:
 * solo lee el DOM, la página no lo ve ni lo puede cambiar.
 */
export const HOLD_PROBE = `(() => {
  if (!document.hasFocus()) return false;
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const type = String(el.type || 'text').toLowerCase();
    if (type === 'password') return true;
    if (['button','submit','reset','checkbox','radio','range','color','file','image','hidden'].includes(type)) return false;
    return String(el.value || '').length > 0;
  }
  if (tag === 'TEXTAREA') return String(el.value || '').length > 0;
  if (el.isContentEditable) return String(el.textContent || '').trim().length > 0;
  return false;
})()`
