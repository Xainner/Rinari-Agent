import { create } from 'zustand'

/**
 * El tamaño de la página, separado del tamaño del panel (plan 0.4.0 #44b):
 * «Ajustar al panel» (`null`) o un ancho fijo. Con un ancho fijo la página se
 * maqueta a ese ancho, a tamaño real, y el panel se recorre en horizontal;
 * clics y capturas del agente siguen en coordenadas de la página.
 */
export const PAGE_WIDTHS = [390, 768, 1280, 1920] as const

export const usePageSizeStore = create<{
  bySession: Record<string, number | null>
  set: (sessionId: string, width: number | null) => void
}>((set) => ({
  bySession: {},
  set: (sessionId, width) => set((state) => ({ bySession: { ...state.bySession, [sessionId]: width } })),
}))
