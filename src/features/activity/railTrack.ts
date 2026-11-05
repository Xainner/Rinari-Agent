import { useLayoutEffect, type RefObject } from 'react'

/** Un nodo del riel: el elemento y, si la bolita es su pseudo-elemento, cuál. */
export interface RailNode {
  el: Element
  pseudo?: '::before' | '::after'
}

/** El centro vertical de una bolita, en coordenadas de la página. */
function nodeCenter({ el, pseudo }: RailNode): number {
  const box = el.getBoundingClientRect()
  if (!pseudo) return box.top + box.height / 2
  const style = getComputedStyle(el, pseudo)
  const top = parseFloat(style.top) || 0
  const height = (parseFloat(style.height) || 0) + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0)
  return box.top + top + height / 2
}

/**
 * La pista de un riel de actividad (#10, #21), compartida por el timeline del
 * chat y los pasos del subagente: mide el centro de la primera bolita y el de
 * la última y lo deja en `--rail-start` / `--rail-len` del contenedor, para que
 * la línea (y su brillo) vaya exactamente de bolita a bolita. Se vuelve a medir
 * cuando el riel cambia de tamaño (Rinari escribe, una fila se abre o se
 * cierra). Con menos de dos bolitas no hay pista (`data-track="none"`). `key`
 * vuelve a enganchar el riel cuando el contenedor se monta de nuevo (otro
 * subagente elegido).
 */
export function useRailTrack(ref: RefObject<HTMLElement | null>, nodes: (root: HTMLElement) => RailNode[], key: unknown = null) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    let frame = 0
    // Custom properties inherit: writing them on the root invalidates the
    // style of the whole turn, text included. While Rinari writes, the rail
    // grows on every frame but its nodes rarely move, so only a change is written.
    let written = ''
    const measure = () => {
      frame = 0
      const found = nodes(root)
      if (found.length < 2) {
        if (written !== 'none') root.dataset.track = 'none'
        written = 'none'
        return
      }
      const origin = root.getBoundingClientRect().top
      const first = Math.round(nodeCenter(found[0]) - origin)
      const length = Math.max(0, Math.round(nodeCenter(found[found.length - 1]) - origin - first))
      const track = `${first}:${length}`
      if (track === written) return
      written = track
      root.style.setProperty('--rail-start', `${first}px`)
      root.style.setProperty('--rail-len', `${length}px`)
      root.dataset.track = 'measured'
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    for (const child of Array.from(root.children)) observer.observe(child)
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      for (const child of Array.from(root.children)) observer.observe(child)
      schedule()
    })
    mutations?.observe(root, { childList: true })
    return () => {
      observer.disconnect()
      mutations?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
    // `nodes` va definido fuera del componente: el riel se observa una vez por montaje.
  }, [ref, nodes, key])
}

/** Las bolitas del timeline del chat: las de sus filas directas, no las de un riel anidado. */
export const turnRailNodes = (root: HTMLElement): RailNode[] =>
  Array.from(root.querySelectorAll(':scope > * > .turn-node')).map((el) => ({ el }))

/** Las bolitas de los pasos de un subagente: el `::before` de cada paso. */
export const agentStepNodes = (root: HTMLElement): RailNode[] =>
  Array.from(root.querySelectorAll(':scope > li.agent-step')).map((el) => ({ el, pseudo: '::before' as const }))
