/**
 * Vocabulario de movimiento compartido (refleja los tokens --dur-* y --ease-*
 * de index.css). Los componentes con framer-motion usan estas transiciones y
 * `useCalmMotion()`, que respeta tanto el sistema como «Reducir animaciones».
 */
import { useReducedMotion, type Transition } from 'framer-motion'
import { useUIStore } from '../stores/ui'

export const duration = { fast: 0.12, base: 0.22, slow: 0.42 }
export const ease = { out: [0.22, 1, 0.36, 1] as const, inOut: [0.65, 0, 0.35, 1] as const }
export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }
export const instant: Transition = { duration: 0 }

/** Verdadero cuando el sistema o el ajuste de la app piden menos movimiento. */
export function useCalmMotion(): boolean {
  const system = useReducedMotion()
  const app = useUIStore((state) => state.reduceMotion)
  return Boolean(system || app)
}
