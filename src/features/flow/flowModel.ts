import type { FlowStage } from '../../services/engine'
import type { I18nKey } from '../../i18n'

/** Derivaciones de presentación del flujo. Sin lógica de negocio: eso viene del Engine. */

export const STAGE_KIND_KEY = {
  planning: 'flow.kind.planning',
  implementation: 'flow.kind.implementation',
  review: 'flow.kind.review',
} satisfies Record<FlowStage['kind'], I18nKey>

export const STAGE_STATUS_KEY = {
  active: 'flow.status.active',
  needs_you: 'flow.status.needsYou',
  done: 'flow.status.done',
  failed: 'flow.status.failed',
  stopped: 'flow.status.stopped',
} satisfies Record<FlowStage['status'], I18nKey>

/** Misma paleta que el estado de un panel (`pane-header-status[data-kind]`). */
export const STAGE_STATUS_KIND: Record<FlowStage['status'], 'working' | 'needs_you' | 'done' | 'failed' | 'stopped'> = {
  active: 'working',
  needs_you: 'needs_you',
  done: 'done',
  failed: 'failed',
  stopped: 'stopped',
}

export function percent(value: number | null): number | null {
  return value === null ? null : Math.max(0, Math.min(100, Math.round(value * 100)))
}

export function durationLabel(ms: number | null): string | null {
  if (ms === null) return null
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

/** Etapas agrupadas por ciclo (un PLAN abre uno), para dibujar separadores. */
export function groupByCycle(stages: readonly FlowStage[]): Array<{ cycle: number; stages: FlowStage[] }> {
  const groups: Array<{ cycle: number; stages: FlowStage[] }> = []
  for (const stage of stages) {
    const last = groups[groups.length - 1]
    if (last && last.cycle === stage.cycle_index) last.stages.push(stage)
    else groups.push({ cycle: stage.cycle_index, stages: [stage] })
  }
  return groups
}

/** Nombre de archivo para un chip: último segmento, con la carpeta como título. */
export function fileChipLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}
