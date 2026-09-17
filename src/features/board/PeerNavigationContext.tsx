import { createContext, useContext } from 'react'

/**
 * Cómo llegar desde una burbuja de par al panel de origen. El board lo provee;
 * en vista única no hay proveedor y la burbuja se pinta sin acción.
 */
export interface PeerNavigation {
  /** Etiqueta visible de una sesión (título del panel/proyecto) o `null` si no está en el board. */
  labelFor: (sessionId: string) => string | null
  /** Enfoca el panel de esa sesión; `false` si ya no está en el board. */
  focusSession: (sessionId: string) => boolean
}

const PeerNavigationContext = createContext<PeerNavigation | null>(null)

export const PeerNavigationProvider = PeerNavigationContext.Provider

export function usePeerNavigation(): PeerNavigation | null {
  return useContext(PeerNavigationContext)
}
