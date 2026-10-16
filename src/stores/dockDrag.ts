import { create } from 'zustand'

/**
 * Hay un arrastre en curso en un panel lateral (un separador o una vista por
 * su cabecera). Mientras dura, el navegador nativo se retira: encima de él el
 * puntero dejaría de llegar a la app y el arrastre se cortaría.
 */
export const useDockDragStore = create<{ active: boolean; begin: () => void; end: () => void }>((set) => ({
  active: false,
  begin: () => set({ active: true }),
  end: () => set({ active: false }),
}))
