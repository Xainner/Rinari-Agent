import type { useI18n } from '../../i18n'
import { activityState, turnDuration, turnIsActive } from '../activity/activityPresentation'
import { liveActionLabel } from '../activity/ActivityHeader'
import type { TurnTimeline } from '../activity/types'
import type { Checklist } from '../../types/protocol.generated'
import type { ChildSession } from '../../services/engine'

type Translate = ReturnType<typeof useI18n>['t']

/**
 * Lo que un panel plegado cuenta de su sesión sin montar el chat (plan-boards
 * B.2): el turno más reciente, la lista de pasos con el paso en curso, la
 * acción del momento, la última respuesta y sus hijas. Funciones puras sobre
 * los mismos datos que ya lee la cabecera del turno.
 */
export interface PaneDigest {
  latest: TurnTimeline | null
  live: boolean
  /** Lista de pasos de la sesión: hechos / total, y el paso en curso. */
  steps: { done: number; total: number; current: string | null; index: number } | null
  /** Qué hace ahora, en una línea; `null` si no trabaja. */
  action: string | null
  /** Primeras líneas de la última respuesta terminada. */
  lastResponse: string | null
  /** Tokens del último turno y su duración. */
  tokens: number | null
  elapsedMs: number | null
  /** Sus hijas mientras alguna trabaja: terminadas / total. */
  children: { done: number; total: number } | null
}

export function latestTurn(timelines: Record<string, TurnTimeline>, sessionId: string): TurnTimeline | null {
  let latest: TurnTimeline | null = null
  for (const turn of Object.values(timelines)) {
    if (turn.sessionId !== sessionId) continue
    if (!latest || turn.startedAt >= latest.startedAt) latest = turn
  }
  return latest
}

export function lastFinalResponse(timelines: Record<string, TurnTimeline>, sessionId: string): string | null {
  const turns = Object.values(timelines).filter((turn) => turn.sessionId === sessionId).sort((a, b) => b.startedAt - a.startedAt)
  for (const turn of turns) {
    const final = [...turn.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final' && item.content)
    if (final && final.type === 'model' && final.content) return final.content
  }
  return null
}

export function paneDigest(input: {
  sessionId: string
  timelines: Record<string, TurnTimeline>
  checklist: Checklist | null
  children: ChildSession[]
  now: number
  t: Translate
}): PaneDigest {
  const latest = latestTurn(input.timelines, input.sessionId)
  const live = Boolean(latest && turnIsActive(latest.status))
  const list = input.checklist && input.checklist.items.length > 0 ? input.checklist : null
  const index = list ? list.items.findIndex((item) => item.status === 'in_progress') : -1
  const steps = list
    ? {
        done: list.items.filter((item) => item.status === 'completed').length,
        total: list.items.length,
        current: index >= 0 ? (list.items[index].active_form || list.items[index].content) : null,
        index,
      }
    : null
  const state = latest && live ? activityState(latest) : null
  const action = latest && live && state && !['approval', 'question'].includes(state.kind) ? liveActionLabel(latest, input.t) : null
  const working = input.children.filter((child) => child.state === 'working' || child.busy).length
  return {
    latest,
    live,
    steps,
    action,
    lastResponse: lastFinalResponse(input.timelines, input.sessionId),
    tokens: latest?.usage ? (latest.usage.context_tokens || latest.usage.total_tokens) : null,
    elapsedMs: latest ? turnDuration(latest, input.now) : null,
    children: working > 0 ? { done: input.children.length - working, total: input.children.length } : null,
  }
}

/** La primera línea con texto, sin marcas de markdown al principio. */
export function firstLine(text: string | null): string | null {
  if (!text) return null
  const line = text.split('\n').map((value) => value.replace(/^[#>*\-\s`]+/, '').trim()).find(Boolean)
  return line ?? null
}

/** «1 pendiente de ti» / «N pendientes de ti» (F14, plan 0.4.0 v2). */
export function pendingLabel(t: ReturnType<typeof useI18n>['t'], n: number): string {
  return n === 1 ? t('board.pane.pendingOne') : t('board.pane.pending', { n })
}
