import { useReducedMotion } from 'framer-motion'
import { useUIStore } from '../../stores/ui'

export const PROCESSES_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const PROCESSES_DURATION = {
  stripEnter: 0.18,
  rowEnter: 0.15,
  inspector: 0.22,
  selection: 0.11,
  stateChange: 0.14,
  retire: 0.14,
} as const

/**
 * Movimiento del feature: combina la preferencia de la app con la del
 * sistema. Con movimiento reducido, layout inmediato y opacidad breve.
 * El hook se ejecuta siempre para no alterar el orden de hooks.
 */
export function useProcessesMotion() {
  const systemReducedMotion = useReducedMotion()
  const appReduceMotion = useUIStore((s) => s.reduceMotion)
  const reducedMotion = appReduceMotion || Boolean(systemReducedMotion)
  const scale = reducedMotion ? 0 : 1
  return {
    reducedMotion,
    transition: (seconds: number) => ({
      duration: seconds * scale,
      ease: PROCESSES_EASE,
    }),
    // Desplazamiento vertical de entrada; 0 con movimiento reducido.
    enterY: (pixels: number) => (reducedMotion ? 0 : pixels),
  }
}
