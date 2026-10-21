import { createContext, useContext } from 'react'
import type { AgencyAgent, AgencyTeam } from './types'

/**
 * Los agentes y equipos de la Agency que `useAgency` ya tiene en `App`, para
 * lo que vive lejos de esa pantalla (las vistas del panel lateral de una
 * oficina). No pide nada al Engine por su cuenta.
 */
export interface AgencyData {
  agents: AgencyAgent[]
  teams: AgencyTeam[]
  reload: () => void | Promise<void>
}

const EMPTY: AgencyData = { agents: [], teams: [], reload: () => undefined }

export const AgencyDataContext = createContext<AgencyData>(EMPTY)

export function useAgencyData(): AgencyData {
  return useContext(AgencyDataContext)
}

/**
 * La oficina de un equipo usa el mismo panel lateral que una conversación
 * (Recado, Pizarra, Ficha): su disposición se guarda con esta clave, que no es
 * una sesión del Engine.
 */
const OFFICE_PREFIX = 'office:'
export function officeDockKey(teamId: string): string {
  return `${OFFICE_PREFIX}${teamId}`
}
export function teamIdOfDockKey(key: string): string | null {
  return key.startsWith(OFFICE_PREFIX) ? key.slice(OFFICE_PREFIX.length) : null
}
