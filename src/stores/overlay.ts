import { useEffect, useId } from 'react'
import { create } from 'zustand'

/**
 * Overlays bloqueantes abiertos ahora mismo (documento 03 §8.3).
 *
 * Existe por una propiedad de la plataforma, no por gusto: **nada pintado en
 * el DOM puede quedar por encima de una `WebContentsView`**. No es un
 * `z-index` mal puesto —es la misma razón por la que la barrera de arbitraje
 * del §7 tiene que ser una vista nativa—, así que un modal con el navegador
 * presentado se dibuja debajo de la página y además le cede el input.
 *
 * Para un modal la respuesta correcta no es dibujar encima, es **quitar el
 * navegador**: un modal está para tomar el control. Por eso esto cuenta sólo
 * overlays que cubren de verdad —diálogos, paleta, visores a pantalla
 * completa— y no popovers, dropdowns ni tooltips: esconder la página entera
 * por un desplegable sería peor que el problema.
 *
 * El recuento es global a propósito. Un modal tapa la ventana, no una sesión,
 * así que mientras haya uno se retira **toda** presentación nativa.
 */
interface OverlayState {
  /** Ids de los overlays abiertos. Por id y no por contador: un montaje doble
   *  o un desmontaje fuera de orden dejarían la cuenta descuadrada, y una
   *  cuenta que no vuelve a cero esconde el navegador para siempre. */
  open: ReadonlySet<string>
  raise(id: string): void
  drop(id: string): void
}

export const useOverlayStore = create<OverlayState>((set) => ({
  open: new Set<string>(),
  raise: (id) =>
    set((state) => {
      if (state.open.has(id)) return state
      const open = new Set(state.open)
      open.add(id)
      return { open }
    }),
  drop: (id) =>
    set((state) => {
      if (!state.open.has(id)) return state
      const open = new Set(state.open)
      open.delete(id)
      return { open }
    }),
}))

/** Cuántos overlays bloqueantes hay encima. Es lo que viaja en la geometría. */
export const selectOverlayDepth = (state: OverlayState): number => state.open.size

/**
 * Declara que este componente es un overlay bloqueante mientras esté montado.
 *
 * Se apunta y se borra solo, así que un modal que se cierre por ruta, por
 * `Escape` o porque su padre desapareció no deja el navegador escondido.
 */
export function useBlockingOverlay(active = true): void {
  const id = useId()
  useEffect(() => {
    if (!active) return
    const { raise, drop } = useOverlayStore.getState()
    raise(id)
    return () => drop(id)
  }, [id, active])
}

export function resetOverlaysForTests(): void {
  useOverlayStore.setState({ open: new Set<string>() })
}
