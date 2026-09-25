import { useContext, useEffect } from 'react'
import { ProcessesRuntimeContext } from '../processes/ProcessRuntimeProvider'

/** Id de la pestaña «Rinari» del panel Terminal (lo que lanzó el agente). */
export const AGENT_TAB = '__rinari__'

/**
 * Procesos que Rinari tiene en marcha en la sesión, sin tus terminales (PTY).
 * Se muestra en la pestaña «Rinari» y en la del dock, que así avisa sin
 * ocupar espacio sobre el compositor. Fuera del proveedor de procesos
 * (pruebas aisladas) vale 0.
 */
export function useAgentRunningCount(sessionId: string): number {
  const ctx = useContext(ProcessesRuntimeContext)
  const subscribe = ctx?.subscribe
  useEffect(() => {
    if (!subscribe || !sessionId) return
    return subscribe(sessionId, false)
  }, [subscribe, sessionId])
  if (!ctx || !sessionId) return 0
  // `ctx.version` cambia con cada poll: este componente se vuelve a pintar.
  void ctx.version
  return ctx.getSnapshot(sessionId).ordered.filter((item) => item.resource.kind !== 'pty' && item.resource.running).length
}
