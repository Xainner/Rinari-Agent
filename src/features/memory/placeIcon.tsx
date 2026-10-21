import { Bot, Brain, FolderOpen, MessageSquare, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import type { MemoryPlace } from './types'

/** Un icono por lugar de la memoria (#75): se reconoce dónde vive un recuerdo sin leerlo. */
export const PLACE_ICONS: Record<MemoryPlace, LucideIcon> = {
  general: Brain,
  profile: UserRound,
  project: FolderOpen,
  chat: MessageSquare,
  // Rinari Agency: la memoria propia de un agente (D-24).
  agent: Bot,
  // A2: lo que aprenden los puestos de un equipo.
  team: UsersRound,
}

export function PlaceIcon({ place, size = 12 }: { place: MemoryPlace; size?: number }) {
  const Icon = PLACE_ICONS[place] ?? Brain
  return <Icon size={size} aria-hidden="true" />
}
