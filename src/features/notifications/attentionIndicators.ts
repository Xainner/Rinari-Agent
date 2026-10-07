import { useEffect, useRef, useState } from 'react'
import { platform } from '../../platform'
import type { AttentionCategory, AttentionIndicators } from '../../platform/contract'
import { translate } from '../../i18n'
import type { Language } from '../../types'
import type { TurnTimelineState } from '../activity/types'
import { useBoardAttentionStore, type SessionAttention, type TerminalOutcome } from '../../stores/boardAttention'
import { getPendingQuestions, subscribePendingQuestions } from '../questions/usePendingQuestions'
import { useIndicatorPrefs } from '../../stores/indicatorPrefs'

/** Lo que pesa de una sesión para los indicadores fuera de la ventana. */
export interface SessionPending {
  sessionId: string
  /** Pregunta o permiso esperando al dueño. */
  needsYou: boolean
  /** Resultado de cada turno terminado y todavía sin leer. */
  unread: TerminalOutcome[]
  unreadPeers: number
  working: boolean
}

export interface AttentionSummary {
  /** Chats con algo pendiente; un chat cuenta una vez aunque tenga varios. */
  count: number
  category: AttentionCategory
  working: number
}

/**
 * Número y color salen de la misma cuenta. Precedencia: algo que te necesita →
 * un fallo sin revisar → un resultado terminado → cualquier otro pendiente.
 * Un éxito leído nunca tapa un fallo anterior sin leer: se miran todos los
 * recibos, no el último turno. Trabajar no suma al número.
 */
export function summarizeAttention(sessions: SessionPending[]): AttentionSummary {
  let count = 0
  let working = 0
  let needsYou = false
  let failed = false
  let done = false
  for (const session of sessions) {
    if (session.working) working += 1
    const pending = session.needsYou || session.unread.length > 0 || session.unreadPeers > 0
    if (!pending) continue
    count += 1
    if (session.needsYou) needsYou = true
    if (session.unread.includes('failed')) failed = true
    if (session.unread.includes('completed')) done = true
  }
  const category: AttentionCategory = count === 0 ? 'none' : needsYou ? 'needs_you' : failed ? 'failed' : done ? 'done' : 'other'
  return { count, category, working }
}

export function indicatorTexts(summary: AttentionSummary, lang: Language): Pick<AttentionIndicators, 'tooltip' | 'description'> {
  const parts = ['Rinari Agent']
  if (summary.count > 0) parts.push(translate(lang, summary.count === 1 ? 'indicators.pendingOne' : 'indicators.pendingMany', { count: summary.count }))
  if (summary.working > 0) parts.push(translate(lang, 'indicators.working', { count: summary.working }))
  const description = summary.category === 'none'
    ? ''
    : `${translate(lang, summary.count === 1 ? 'indicators.pendingOne' : 'indicators.pendingMany', { count: summary.count })}. ${translate(lang, `indicators.category.${summary.category}`)}`
  return { tooltip: parts.join(' · '), description }
}

const ACTIVE = new Set(['running', 'approval', 'cancelling'])

function unreadOutcomes(receipts: SessionAttention | undefined): TerminalOutcome[] {
  if (!receipts) return []
  return Object.values(receipts.turns).filter((receipt) => receipt.state === 'unread').map((receipt) => receipt.outcome)
}

/** Sesiones a mirar: las del runtime (Normal y Boards) y las que tienen recibos pendientes. */
export function pendingBySession(
  runtime: Pick<TurnTimelineState, 'timelines' | 'approvals'>,
  attention: Record<string, SessionAttention>,
  questions: (sessionId: string) => number,
): SessionPending[] {
  const ids = new Set<string>()
  const working = new Set<string>()
  for (const timeline of Object.values(runtime.timelines)) {
    ids.add(timeline.sessionId)
    if (ACTIVE.has(timeline.status)) working.add(timeline.sessionId)
  }
  for (const [sessionId, receipts] of Object.entries(attention)) {
    if (unreadOutcomes(receipts).length > 0 || receipts.unreadPeerMessageIds.length > 0) ids.add(sessionId)
  }
  const approvals = new Set<string>()
  for (const item of runtime.approvals) if (item.status !== 'resolving' && item.session_id) approvals.add(item.session_id)
  for (const id of approvals) ids.add(id)
  return [...ids].map((sessionId) => ({
    sessionId,
    needsYou: approvals.has(sessionId) || questions(sessionId) > 0,
    unread: unreadOutcomes(attention[sessionId]),
    unreadPeers: attention[sessionId]?.unreadPeerMessageIds.length ?? 0,
    working: working.has(sessionId),
  }))
}

let generation = 0
function nextGeneration(): number {
  // Creciente también entre recargas del renderer: main descarta lo más viejo.
  generation = Math.max(Date.now(), generation + 1)
  return generation
}

/**
 * Único escritor de los indicadores nativos (número en la barra de tareas,
 * marca en la bandeja). Manda el estado completo solo cuando cambia; sin
 * Engine conectado no manda nada, así no se pinta un cero que no se sabe.
 * Abrir la ventana no limpia nada: bajan al leerse los resultados.
 */
export function useAttentionIndicators(
  runtime: { getState(): TurnTimelineState; subscribe(listener: () => void): () => void },
  options: { ready: boolean; lang: Language; liveSessionIds: string[] },
): AttentionSummary {
  const enabled = useIndicatorPrefs((state) => state.enabled)
  const [summary, setSummary] = useState<AttentionSummary>({ count: 0, category: 'none', working: 0 })
  const sent = useRef('')
  const liveKey = options.liveSessionIds.join('|')

  useEffect(() => {
    const compute = () => {
      const sessions = pendingBySession(runtime.getState(), useBoardAttentionStore.getState().sessions, (id) => getPendingQuestions(id).length)
      const next = summarizeAttention(sessions)
      setSummary((current) => (current.count === next.count && current.category === next.category && current.working === next.working ? current : next))
    }
    compute()
    // Preguntas: solo de las sesiones vivas (cada suscripción consulta al Engine).
    const live = new Set(liveKey ? liveKey.split('|') : [])
    for (const timeline of Object.values(runtime.getState().timelines)) if (ACTIVE.has(timeline.status)) live.add(timeline.sessionId)
    const stops = [runtime.subscribe(compute), useBoardAttentionStore.subscribe(compute), ...[...live].map((id) => subscribePendingQuestions(id, compute))]
    return () => { for (const stop of stops) stop() }
  }, [runtime, liveKey])

  useEffect(() => {
    if (!options.ready) return
    const shown = enabled ? summary : { count: 0, category: 'none' as const, working: 0 }
    const texts = indicatorTexts(shown, options.lang)
    const key = JSON.stringify([shown, texts])
    if (key === sent.current) return
    sent.current = key
    void platform().app.setIndicators({ generation: nextGeneration(), ...shown, ...texts }).catch(() => undefined)
  }, [enabled, summary, options.ready, options.lang])

  return summary
}
