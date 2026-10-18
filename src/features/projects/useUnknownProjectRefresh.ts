import { useEffect, useRef } from 'react'
import type { SessionSummary } from '../../services/engine'

/**
 * Un proyecto creado fuera de la app (el CLI con la app abierta, otra sesión)
 * no aparecía en Proyectos y sus conversaciones salían en Conversaciones:
 * la lista solo se pedía al arrancar o tras cambios hechos aquí (F5, plan
 * 0.4.0 v2). Una conversación que nombra un proyecto que la app no conoce la
 * vuelve a pedir, una vez por proyecto.
 */
export function useUnknownProjectRefresh(
  sessions: Record<string, SessionSummary>,
  knownProjectIds: readonly string[],
  refreshProjects: () => Promise<void>,
  enabled = true,
) {
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (!enabled) return
    const known = new Set(knownProjectIds)
    const unknown = [...new Set(Object.values(sessions).map((session) => session.project_id).filter((id): id is string => Boolean(id)))]
      .filter((id) => !known.has(id) && !asked.current.has(id))
    if (!unknown.length) return
    for (const id of unknown) asked.current.add(id)
    void refreshProjects()
  }, [sessions, knownProjectIds, refreshProjects, enabled])
}
