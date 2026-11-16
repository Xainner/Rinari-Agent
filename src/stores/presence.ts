import { create } from 'zustand'
import { engineApi, type SessionSummary } from '../services/engine'

/**
 * Presencia: la conversación continua con Rinari (`presence_v1`).
 *
 * Es un modo que el dueño enciende en Ajustes. El Engine guarda una sola
 * conversación por instalación y la entrega con `presence.get`; no está en
 * `session.list`, así que su id se recuerda aquí para que la lista de chats
 * no la dé por desaparecida.
 */
interface PresenceStore {
  /** El Engine conoce el modo. Sin él no se ofrece nada. */
  supported: boolean
  /** Ya se preguntó al Engine en esta conexión. */
  loaded: boolean
  enabled: boolean
  sessionId: string | null
  session: SessionSummary | null
  /** «Entrar del todo»: la conversación a pantalla completa con su panel. */
  full: boolean
  load: (supported: boolean) => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  setFull: (full: boolean) => void
}

type PresenceView = { enabled: boolean; session: SessionSummary | null }

const view = (presence: PresenceView) => ({
  loaded: true,
  enabled: presence.enabled,
  session: presence.session,
  sessionId: presence.session?.id ?? null,
})

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  supported: false,
  loaded: false,
  enabled: false,
  sessionId: null,
  session: null,
  full: false,
  load: async (supported) => {
    if (!supported) {
      set({ supported: false, loaded: false, enabled: false, sessionId: null, session: null, full: false })
      return
    }
    set({ supported: true })
    const { presence } = await engineApi.presenceGet()
    set({ ...view(presence as PresenceView), full: presence.enabled ? get().full : false })
  },
  setEnabled: async (enabled) => {
    const { presence } = await engineApi.presenceSet(enabled)
    set({ ...view(presence as PresenceView), full: presence.enabled ? get().full : false })
  },
  setFull: (full) => set({ full: full && get().enabled }),
}))
