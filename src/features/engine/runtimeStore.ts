import { createStore, type StoreApi } from 'zustand/vanilla'
import type { TurnTimelineState } from '../activity/types'
import {
  createInitialTimelineState,
  turnTimelineReducer,
  type TimelineAction,
} from '../activity/turnTimelineReducer'

/**
 * Proyección visible del runtime del Engine.
 *
 * Contiene exactamente el estado del `turnTimelineReducer` y lo transiciona con
 * el mismo reducer: no hay un segundo runtime ni lógica de ejecución aquí. Vivir
 * en un store vanilla permite que cada consumidor (vista Normal, un panel del
 * board, un badge) se suscriba solo a su sesión mediante selectores, en lugar de
 * repintar el árbol completo por cada delta de contenido.
 */
export interface RuntimeStoreState extends TurnTimelineState {
  /** Generación del Engine: se incrementa en cada reset (arranque/reinicio). */
  generation: number
  dispatch: (action: TimelineAction) => void
  /** Several actions in order, published once: one render for a frame's deltas. */
  dispatchMany: (actions: readonly TimelineAction[]) => void
  /** Vacía la proyección (nuevo proceso de Engine) sin destruir suscripciones. */
  reset: () => void
}

export type RuntimeStore = StoreApi<RuntimeStoreState>

export function createRuntimeStore(): RuntimeStore {
  return createStore<RuntimeStoreState>((set, get) => ({
    ...createInitialTimelineState(),
    generation: 0,
    dispatch: (action) => get().dispatchMany([action]),
    dispatchMany: (actions) => {
      const current = get()
      const before: TurnTimelineState = {
        threads: current.threads,
        timelines: current.timelines,
        busySessions: current.busySessions,
        approvals: current.approvals,
      }
      let next = before
      for (const action of actions) next = turnTimelineReducer(next, action)
      if (next === before) return
      set({
        threads: next.threads,
        timelines: next.timelines,
        busySessions: next.busySessions,
        approvals: next.approvals,
      })
    },
    reset: () => set({ ...createInitialTimelineState(), generation: get().generation + 1 }),
  }))
}
