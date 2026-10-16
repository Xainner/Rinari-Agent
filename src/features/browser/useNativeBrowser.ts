import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { platform } from '../../platform'
import type { NativeBrowserContext } from '../../platform/contract'
import { useNativeSurfaces } from '../../stores/nativeSurfaces'

/**
 * Browser nativo de una sesión (documento 03 §6.1 y §8.1).
 *
 * React **reserva el hueco** y el host coloca la vista. Este hook hace las dos
 * mitades: mantiene la metadata del contexto —sin sondear, por evento— y
 * publica la geometría del slot cuando cambia.
 *
 * Lo que no hace, a propósito: desmontar el slot no cierra el contexto ni
 * cancela nada. Ocultar el panel retira la presentación y punto (§8.3).
 *
 * Tampoco reparte el control (plan 0.4.0 #46). La página se ve en vivo mande
 * quien mande; el dueño la toma con solo usarla y el Engine se la devuelve al
 * agente cuando lleva 3 s sin tocarla. Main detecta el uso; aquí no hay
 * botones ni capturas cada segundo.
 */

/** Rectángulo en coordenadas del contenido de ventana (CSS px = DIP). */
interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function rectOf(element: Element): Rect {
  const box = element.getBoundingClientRect()
  return {
    x: Math.round(box.left),
    y: Math.round(box.top),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

const roundedRect = (rect: Rect): Rect => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
})

function intersect(a: Rect, b: Rect): Rect {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/**
 * Lo que de verdad se ve del slot.
 *
 * Se intersecta con cada antepasado que recorte y con la ventana. Ese
 * rectángulo puede empezar **a la derecha** del slot cuando un Board se ha
 * desplazado, y esa diferencia es justo lo que el host necesita para
 * desplazar la página en vez de volver a enseñar su principio (§8.2).
 */
function visibleRectOf(element: HTMLElement): Rect {
  let visible = rectOf(element)
  let parent = element.parentElement
  while (parent) {
    const style = getComputedStyle(parent)
    if (style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      visible = intersect(visible, rectOf(parent))
    }
    parent = parent.parentElement
  }
  return intersect(visible, {
    x: 0,
    y: 0,
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  })
}

export interface NativeBrowserState {
  context: NativeBrowserContext | null
  error: string
  /** Prepara el contexto y su página en blanco. Acción explícita. */
  prepare(): Promise<void>
  selectTarget(targetId: string): Promise<void>
  navigate(url: string): Promise<void>
  history(action: 'back' | 'forward' | 'reload' | 'stop'): Promise<void>
  /** Se le pasa al slot para que reporte su geometría. */
  slotRef: (element: HTMLElement | null) => void
}

export function useNativeBrowser(
  sessionId: string,
  options: {
    shown: boolean
    overlayDepth?: number
    /** Con este contexto, ¿se presenta la página? La de inicio la tapa (#46). */
    presentWhen?: (context: NativeBrowserContext | null) => boolean
  },
): NativeBrowserState {
  const { overlayDepth = 0, presentWhen } = options
  const [context, setContext] = useState<NativeBrowserContext | null>(null)
  const [error, setError] = useState('')
  const shown = options.shown && (presentWhen ? presentWhen(context) : true)
  const toastOcclusions = useNativeSurfaces((state) => state.toastOcclusions)
  const setSurface = useNativeSurfaces((state) => state.setSurface)

  const slotId = useRef<string | null>(null)
  const element = useRef<HTMLElement | null>(null)
  const revision = useRef(0)
  const frame = useRef<number | null>(null)
  const lastPublished = useRef<string | null>(null)
  // Los últimos valores, para que el bucle de publicación no dependa del
  // ciclo de render: una geometría se envía por movimiento, no por re-render.
  const shownRef = useRef(shown)
  const overlayRef = useRef(overlayDepth)
  const occlusionsRef = useRef(toastOcclusions)
  shownRef.current = shown
  overlayRef.current = overlayDepth
  occlusionsRef.current = toastOcclusions

  /** Publica la geometría, agrupada por animation frame (§8.1). */
  const publish = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const node = element.current
      const slot = slotId.current
      if (!node || !slot) return
      const logicalBounds = rectOf(node)
      const visibleBounds = roundedRect(visibleRectOf(node))
      const occlusions = occlusionsRef.current.map(roundedRect)
      // Las esquinas del hueco: main redondea la vista nativa igual (ronda 1434, D).
      const cornerRadius = Math.round(Number.parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0)
      const key = JSON.stringify({
        logicalBounds,
        visibleBounds,
        shown: shownRef.current,
        overlayDepth: overlayRef.current,
        occlusions,
        cornerRadius,
      })
      if (lastPublished.current === key) return
      lastPublished.current = key
      revision.current += 1
      setSurface(slot, shownRef.current ? visibleBounds : null)
      void platform()
        .browser.updateSlot({
          slotId: slot,
          logicalBounds,
          visibleBounds,
          shown: shownRef.current,
          layoutRevision: revision.current,
          overlayDepth: overlayRef.current,
          occlusions,
          cornerRadius,
        })
        .catch(() => {
          // Una geometría perdida se corrige en el siguiente movimiento; no
          // merece romper el panel.
          if (lastPublished.current === key) lastPublished.current = null
        })
    })
  }, [setSurface])

  const slotRef = useCallback(
    (node: HTMLElement | null) => {
      element.current = node
      if (node) publish()
    },
    [publish],
  )

  // Metadata: una carga inicial y después por evento. Sin temporizadores.
  useEffect(() => {
    if (!sessionId) return
    let alive = true
    let unsubscribe: (() => void) | undefined

    void platform()
      .browser.context(sessionId)
      .then((view) => {
        if (alive) setContext(view)
      })
      .catch((reason) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason))
      })

    void platform()
      .browser.onContextChanged((view) => {
        // Un cambio de otra sesión no es de este panel.
        if (alive && view.session_id === sessionId) setContext(view)
      })
      .then((stop) => {
        if (alive) unsubscribe = stop
        else stop()
      })

    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [sessionId])

  // El slot se reserva mientras el panel existe. Al desmontar se **retira la
  // presentación**, no el contexto: el turno sigue y la página también.
  useEffect(() => {
    if (!sessionId) return
    let alive = true
    void platform()
      .browser.attachSlot(sessionId)
      .then((lease) => {
        if (!alive) {
          void platform().browser.detachSlot(lease.slotId)
          return
        }
        slotId.current = lease.slotId
        revision.current = 0
        lastPublished.current = null
        publish()
      })
      .catch((reason) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason))
      })

    return () => {
      alive = false
      const slot = slotId.current
      slotId.current = null
      lastPublished.current = null
      if (slot) setSurface(slot, null)
      if (slot) void platform().browser.detachSlot(slot)
    }
  }, [sessionId, publish, setSurface])

  // Todo lo que mueve el slot: su propio tamaño, el scroll de un antepasado,
  // la ventana, y los cambios de visibilidad u overlay.
  useEffect(() => {
    const node = element.current
    if (!node) return
    // `ResizeObserver` puede no existir —jsdom no lo trae—, y su ausencia no
    // puede tumbar el panel: se pierde el aviso de cambio de tamaño, pero el
    // resize de ventana y el scroll siguen publicando.
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null
    observer?.observe(node)
    window.addEventListener('resize', publish)
    // `capture` para enterarse del scroll de cualquier contenedor, no sólo
    // del documento: el Board que recorta el panel es uno de ellos.
    window.addEventListener('scroll', publish, true)
    // Una entrada animada (panel que se desliza, vista que aparece) mueve el
    // slot sin cambiar su tamaño: al terminar se vuelve a medir.
    window.addEventListener('animationend', publish, true)
    window.addEventListener('transitionend', publish, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', publish)
      window.removeEventListener('scroll', publish, true)
      window.removeEventListener('animationend', publish, true)
      window.removeEventListener('transitionend', publish, true)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [publish, context?.context_state])

  // La oclusión de un toast se publica antes del siguiente paint. Así el
  // primer frame protegido llega a main antes de que Sonner pueda quedar bajo
  // una WebContentsView, incluso cuando aún no existe una medida real.
  useLayoutEffect(publish, [publish, shown, overlayDepth, toastOcclusions])

  const guard = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action()
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])

  return {
    context,
    error,
    prepare: () =>
      guard(async () => {
        const view = await platform().browser.prepare(sessionId)
        setContext(view)
      }),
    selectTarget: (targetId) => guard(() => platform().browser.selectTarget(sessionId, targetId)),
    navigate: (url) => guard(() => platform().browser.navigate(sessionId, url)),
    history: (action) => guard(() => platform().browser.history(sessionId, action)),
    slotRef,
  }
}
