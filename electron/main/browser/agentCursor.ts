/**
 * El cursor del agente (plan 0.4.0 #46): un puntero con el estilo de Rinari
 * que viaja hasta donde el agente hace clic, deja una onda al pulsar y un
 * indicador al escribir.
 *
 * Se dibuja en una vista transparente **aparte**, encima de la página, sin
 * tocar su DOM: no sale en las capturas del agente (que son de la página) ni
 * cambia lo que el agente lee. Con movimiento reducido salta sin animación.
 *
 * Una vista nativa encima bloquea también la entrada que el agente despacha
 * por CDP (lo midió la prueba vertical con la barrera), así que el cursor
 * nunca cubre el punto donde va a caer el clic: la flecha empieza un poco a
 * la derecha y abajo de la punta, y la onda solo se pinta cuando el clic ya
 * terminó.
 */

import { WebContentsView } from 'electron'

import type { ContextEntry } from './BrowserRegistry'

export interface Point {
  x: number
  y: number
}

/** Lo que ocupa la flecha; su punta queda en (OFFSET, OFFSET) fuera de la vista. */
const ARROW = { width: 26, height: 30 }
const OFFSET = 2
/** La onda, centrada en el punto del clic, cuando el clic ya terminó. */
const RIPPLE = 46
const RIPPLE_MS = 380
const TRAVEL_MS = 260
const FRAME_MS = 16
/** Sin acciones del agente durante este rato, el cursor se va. */
const IDLE_HIDE_MS = 4_000

/** Posiciones intermedias del viaje, con salida y llegada suaves. */
export function travelFrames(from: Point, to: Point, durationMs = TRAVEL_MS, frameMs = FRAME_MS): Point[] {
  const steps = Math.max(1, Math.round(durationMs / frameMs))
  const frames: Point[] = []
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    frames.push({ x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased })
  }
  return frames
}

/** Rectángulo de la flecha, en coordenadas del contenedor, para un punto de la página. */
export function arrowBounds(point: Point, page: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(page.x + point.x + OFFSET),
    y: Math.round(page.y + point.y + OFFSET),
    width: ARROW.width,
    height: ARROW.height,
  }
}

export function rippleBounds(point: Point, page: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(page.x + point.x - RIPPLE / 2),
    y: Math.round(page.y + point.y - RIPPLE / 2),
    width: RIPPLE,
    height: RIPPLE,
  }
}

// La flecha lleva el degradado de la marca, un contorno claro sobre otro
// oscuro (se lee en páginas claras y oscuras) y el punto magenta de Rinari.
// La onda son dos anillos que se abren desde el punto del clic; al escribir,
// una píldora con tres puntos que laten. Sin movimiento con «Reducir animaciones».
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:100%;height:100%}
svg{position:absolute;left:0;top:0;filter:drop-shadow(0 2px 3px rgba(10,6,20,.45))}
.ripple{display:none;position:absolute;inset:0}
.ripple i{position:absolute;inset:4px;border-radius:50%;border:2px solid #c4a8ff;
  background:radial-gradient(circle,rgba(183,148,255,.3),rgba(183,148,255,0) 62%);
  box-shadow:0 0 14px rgba(147,88,255,.5);animation:ripple ${RIPPLE_MS}ms cubic-bezier(.22,1,.36,1) forwards}
.ripple i+i{background:none;border-color:#e879f9;box-shadow:none;animation-delay:70ms;opacity:0}
.typing{display:none;position:absolute;left:11px;top:16px;gap:2px;align-items:center;padding:2px 4px;border-radius:999px;
  background:linear-gradient(135deg,#9358ff,#c026d3);box-shadow:0 0 0 1px rgba(246,242,255,.9),0 2px 4px rgba(10,6,20,.4)}
.typing b{width:3px;height:3px;border-radius:50%;background:#fff;animation:dot 900ms ease-in-out infinite}
.typing b:nth-child(2){animation-delay:150ms}.typing b:nth-child(3){animation-delay:300ms}
body[data-mode=ripple] svg{display:none}
body[data-mode=ripple] .ripple{display:block}
body[data-mode=typing] .typing{display:flex}
@keyframes ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1);opacity:0}}
@keyframes dot{0%,100%{opacity:.45;transform:translateY(0)}50%{opacity:1;transform:translateY(-1px)}}
@media (prefers-reduced-motion: reduce){.ripple i{animation:none;opacity:.8}.ripple i+i{display:none}.typing b{animation:none;opacity:1}}
</style></head><body data-mode="arrow">
<svg width="${ARROW.width}" height="${ARROW.height}" viewBox="0 0 26 30" aria-hidden="true">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b794ff"/><stop offset=".55" stop-color="#9358ff"/><stop offset="1" stop-color="#c026d3"/></linearGradient></defs>
<path d="M1 1 L1 22 L7 16.5 L11 26 L15 24.3 L11 15 L19 15 Z" fill="none" stroke="rgba(16,10,30,.6)" stroke-width="3.4" stroke-linejoin="round"/>
<path d="M1 1 L1 22 L7 16.5 L11 26 L15 24.3 L11 15 L19 15 Z" fill="url(#g)" stroke="#f6f2ff" stroke-width="1.6" stroke-linejoin="round"/>
<circle cx="20.5" cy="24.5" r="3.2" fill="#e879f9" stroke="#f6f2ff" stroke-width="1.2"/>
</svg><div class="ripple"><i></i><i></i></div><div class="typing"><b></b><b></b><b></b></div>
<script>window.__cursorMode=function(m){var b=document.body;if(m==='ripple'&&b.dataset.mode==='ripple'){var r=b.querySelector('.ripple');r.style.display='none';void r.offsetWidth;r.style.display=''}b.dataset.mode=m}</script>
</body></html>`

export class AgentCursor {
  private view: WebContentsView | null = null
  private at: Point | null = null
  private travelling: ReturnType<typeof setTimeout> | null = null
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private modeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly context: ContextEntry,
    private readonly reducedMotion: () => boolean,
  ) {}

  /** Solo con la página a la vista y en manos del agente. */
  private presented(): boolean {
    return Boolean(this.context.geometry?.visible && this.context.presentedTarget && this.context.control === 'agent')
  }

  private page(): Point {
    const page = this.context.geometry?.page
    return { x: page?.x ?? 0, y: page?.y ?? 0 }
  }

  private ensure(): WebContentsView {
    if (this.view && this.view.webContents && !this.view.webContents.isDestroyed()) return this.view
    const view = new WebContentsView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'rinari-agent-cursor' },
    })
    view.setBackgroundColor('#00000000')
    void view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)
    this.context.container.addChildView(view)
    this.view = view
    return view
  }

  private mode(mode: 'arrow' | 'ripple' | 'typing'): void {
    const view = this.view
    if (!view || !view.webContents || view.webContents.isDestroyed()) return
    void view.webContents.executeJavaScript(`window.__cursorMode && window.__cursorMode(${JSON.stringify(mode)})`).catch(() => {})
  }

  private place(point: Point): void {
    this.view?.setBounds(arrowBounds(point, this.page()))
  }

  private scheduleHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => this.hide(), IDLE_HIDE_MS)
  }

  /**
   * Lleva el cursor a un punto de la página y resuelve al llegar, para que el
   * clic caiga cuando el cursor ya está ahí. Sin página a la vista no espera.
   */
  moveTo(point: Point): Promise<void> {
    if (!this.presented()) {
      this.at = point
      return Promise.resolve()
    }
    const view = this.ensure()
    view.setVisible(true)
    this.scheduleHide()
    const from = this.at
    this.at = point
    if (this.travelling) clearTimeout(this.travelling)
    if (!from || this.reducedMotion() || (from.x === point.x && from.y === point.y)) {
      this.place(point)
      return Promise.resolve()
    }
    const frames = travelFrames(from, point)
    return new Promise((resolve) => {
      const next = (index: number) => {
        if (index >= frames.length || !this.view) {
          this.travelling = null
          resolve()
          return
        }
        this.place(frames[index]!)
        this.travelling = setTimeout(() => next(index + 1), FRAME_MS)
      }
      next(0)
    })
  }

  /** La onda, una vez el clic ya cayó: nunca tapa el punto antes. */
  clicked(point: Point): void {
    if (!this.presented() || !this.view) return
    this.at = point
    this.view.setBounds(rippleBounds(point, this.page()))
    this.mode('ripple')
    if (this.modeTimer) clearTimeout(this.modeTimer)
    this.modeTimer = setTimeout(() => {
      this.mode('arrow')
      if (this.at) this.place(this.at)
    }, RIPPLE_MS)
    this.scheduleHide()
  }

  /** Un indicador junto al cursor mientras el agente escribe. */
  typing(): void {
    if (!this.presented()) return
    const view = this.ensure()
    view.setVisible(true)
    if (this.at) this.place(this.at)
    this.mode('typing')
    if (this.modeTimer) clearTimeout(this.modeTimer)
    this.modeTimer = setTimeout(() => this.mode('arrow'), 900)
    this.scheduleHide()
  }

  /** Por encima de las páginas nuevas, que se añaden después. */
  raise(): void {
    const view = this.view
    if (!view) return
    this.context.container.removeChildView(view)
    this.context.container.addChildView(view)
  }

  /** Dónde está ahora, para la prueba vertical: `null` si no se ve. */
  describe(): { x: number; y: number; width: number; height: number } | null {
    const view = this.view
    if (!view || !view.webContents || view.webContents.isDestroyed() || !view.getVisible()) return null
    return view.getBounds()
  }

  hide(): void {
    if (this.travelling) clearTimeout(this.travelling)
    this.travelling = null
    this.view?.setVisible(false)
  }

  dispose(): void {
    this.hide()
    for (const timer of [this.hideTimer, this.modeTimer]) if (timer) clearTimeout(timer)
    const view = this.view
    this.view = null
    if (!view) return
    try {
      this.context.container.removeChildView(view)
    } catch {
      // El contenedor ya no existe.
    }
    if (view.webContents && !view.webContents.isDestroyed()) view.webContents.close()
  }
}
