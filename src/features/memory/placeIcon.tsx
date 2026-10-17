import { Brain, FolderOpen, MessageSquare, UserRound, type LucideIcon } from 'lucide-react'
import type { MemoryPlace } from './types'

/** Un icono por lugar de la memoria (#75): se reconoce dónde vive un recuerdo sin leerlo. */
export const PLACE_ICONS: Record<MemoryPlace, LucideIcon> = {
  general: Brain,
  profile: UserRound,
  project: FolderOpen,
  chat: MessageSquare,
}

export function PlaceIcon({ place, size = 12 }: { place: MemoryPlace; size?: number }) {
  const Icon = PLACE_ICONS[place] ?? Brain
  return <Icon size={size} aria-hidden="true" />
}
