import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { platform } from '../../platform'
import type { AttentionCategory, AttentionIndicators } from '../../platform/contract'
import { translate } from '../../i18n'
import type { Language } from '../../types'
import type { TurnTimelineState } from '../activity/types'
import { useBoardAttentionStore, type SessionAttention, type TerminalOutcome } from '../../stores/boardAttention'
import { getPendingQuestions, subscribePendingQuestions } from '../questions/usePendingQuestions'
import { useIndicatorPrefs } from '../../stores/indicatorPrefs'
import { APP_NAME } from '../../lib/channel'

/** Lo que pesa de una sesión para los indicadores fuera de la ventana. */
export interface SessionPending {
  sessionId: string
  /** Pregunta o permiso esperando al dueño. */
  needsYou: boolean
  /** Resultado de cada turno terminado y todavía sin leer. */
  unread: TerminalOutcome[]
  unreadPeers: number
  working: boolean
  /** Perfil de Rinari de la conversación, si se conoce (#34). */
  profileId?: string | null
}

export interface AttentionSummary {
  /** Chats con algo pendiente; un chat cuenta una vez aunque tenga varios. */
  count: number
  category: AttentionCategory
  working: number
  /** Las conversaciones que suman al número, para nombrarlas (#84). */
  pending?: string[]
}

/** Windows corta el texto del icono de la bandeja a 127 caracteres. */
const TOOLTIP_MAX = 120

/**
 * Número y color salen de la misma cuenta. Precedencia: algo que te necesita →
 * un fallo sin revisar → un resultado terminado → cualquier otro pendiente.
 * Un éxito leído nunca tapa un fallo anterior sin leer: se miran todos los
 * recibos, no el último turno. Trabajar no suma al número.
 */
export function summarizeAttention(sessions: SessionPending[]): AttentionSummary {
  let count = 0
  let working = 0
  const pendingIds: string[] = []
  let needsYou = false
  let failed = false
  let done = false
  for (const session of sessions) {
    if (session.working) working += 1
    const pending = session.needsYou || session.unread.length > 0 || session.unreadPeers > 0
    if (!pending) continue
    count += 1
    pendingIds.push(session.sessionId)
    if (session.needsYou) needsYou = true
    if (session.unread.includes('failed')) failed = true
    if (session.unread.includes('completed')) done = true
  }
  const category: AttentionCategory = count === 0 ? 'none' : needsYou ? 'needs_you' : failed ? 'failed' : done ? 'done' : 'other'
  return { count, category, working, pending: pendingIds }
}

export function indicatorTexts(
  summary: AttentionSummary,
  lang: Language,
  titleFor: (sessionId: string) => string | null = () => null,
): Pick<AttentionIndicators, 'tooltip' | 'description'> {
  const parts = [APP_NAME]
  if (summary.count > 0) {
    const label = translate(lang, summary.count === 1 ? 'indicators.pendingOne' : 'indicators.pendingMany', { count: summary.count })
    // Cuáles: «2 chats pendientes: Título A, Título B» (#84).
    const names = (summary.pending ?? []).map(titleFor).filter((name): name is string => Boolean(name))
    parts.push(names.length > 0 ? `${label}: ${names.join(', ')}` : label)
  }
  if (summary.working > 0) parts.push(translate(lang, 'indicators.working', { count: summary.working }))
  const description = summary.category === 'none'
    ? ''
    : `${translate(lang, summary.count === 1 ? 'indicators.pendingOne' : 'indicators.pendingMany', { count: summary.count })}. ${translate(lang, `indicators.category.${summary.category}`)}`
  const tooltip = parts.join(' · ')
  return { tooltip: tooltip.length > TOOLTIP_MAX ? `${tooltip.slice(0, TOOLTIP_MAX - 1)}…` : tooltip, description }
}

/** Una línea para `app.log` cuando cambia el número: ids y estados, nunca contenido (#84). */
export function describeAttention(sessions: SessionPending[]): string {
  const parts = sessions
    .filter((session) => session.needsYou || session.unread.length > 0 || session.unreadPeers > 0)
    .map((session) => {
      const states = [
        session.needsYou ? 'needs_you' : null,
        session.unread.length > 0 ? `unread(${session.unread.join(',')})` : null,
        session.unreadPeers > 0 ? `peers(${session.unreadPeers})` : null,
      ].filter(Boolean)
      return `${session.sessionId} ${states.join(' ')}`
    })
  return `[rinari] attention ${parts.length}${parts.length > 0 ? `: ${parts.join('; ')}` : ''}`
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

/** Señal de una conversación para la barra lateral y la campana (#33). */
export type SessionSignal = 'needs_you' | 'failed' | 'unread'

export function signalOf(session: SessionPending | undefined): SessionSignal | null {
  if (!session) return null
  if (session.needsYou) return 'needs_you'
  if (session.unread.includes('failed')) return 'failed'
  if (session.unread.length > 0 || session.unreadPeers > 0) return 'unread'
  return null
}

const SIGNAL_RANK: Record<SessionSignal, number> = { needs_you: 3, failed: 2, unread: 1 }

/** La más urgente de varias (un proyecto plegado muestra la de sus conversaciones). */
export function strongestSignal(signals: Array<SessionSignal | null | undefined>): SessionSignal | null {
  let best: SessionSignal | null = null
  for (const signal of signals) if (signal && (!best || SIGNAL_RANK[signal] > SIGNAL_RANK[best])) best = signal
  return best
}

/**
 * Lo pendiente de cada conversación, publicado por el único cálculo
 * (`useAttentionIndicators`): la barra lateral, la campana y los perfiles
 * leen lo mismo que el número de la barra de tareas.
 */
export const useSessionPendingStore = create<{ bySession: Record<string, SessionPending> }>(() => ({ bySession: {} }))

function samePending(a: SessionPending | undefined, b: SessionPending): boolean {
  return Boolean(a) && a!.needsYou === b.needsYou && a!.unreadPeers === b.unreadPeers && a!.working === b.working && a!.unread.join() === b.unread.join() && a!.profileId === b.profileId
}

function publishPending(sessions: SessionPending[]): void {
  const current = useSessionPendingStore.getState().bySession
  const next: Record<string, SessionPending> = {}
  let changed = false
  for (const session of sessions) {
    const pending = session.needsYou || session.unread.length > 0 || session.unreadPeers > 0
    if (!pending) continue
    next[session.sessionId] = samePending(current[session.sessionId], session) ? current[session.sessionId] : session
    if (next[session.sessionId] !== current[session.sessionId]) changed = true
  }
  if (!changed && Object.keys(current).length === Object.keys(next).length) return
  useSessionPendingStore.setState({ bySession: next })
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
  options: {
    ready: boolean
    lang: Language
    liveSessionIds: string[]
    titleFor?: (sessionId: string) => string | null
    /** Perfil de cada conversación, para los pendientes de otros perfiles (#34). */
    profileFor?: (sessionId: string) => string | null
  },
): AttentionSummary {
  const enabled = useIndicatorPrefs((state) => state.enabled)
  const [summary, setSummary] = useState<AttentionSummary>({ count: 0, category: 'none', working: 0, pending: [] })
  const sent = useRef('')
  const logged = useRef('')
  const titleFor = useRef(options.titleFor)
  titleFor.current = options.titleFor
  const profileFor = useRef(options.profileFor)
  profileFor.current = options.profileFor
  const profileKey = options.profileFor
  const liveKey = options.liveSessionIds.join('|')

  useEffect(() => {
    const compute = () => {
      const sessions = pendingBySession(runtime.getState(), useBoardAttentionStore.getState().sessions, (id) => getPendingQuestions(id).length)
        .map((session) => ({ ...session, profileId: profileFor.current?.(session.sessionId) ?? null }))
      const next = summarizeAttention(sessions)
      publishPending(sessions)
      const line = describeAttention(sessions)
      if (line !== logged.current) {
        logged.current = line
        console.info(line)
      }
      setSummary((current) => (
        current.count === next.count && current.category === next.category && current.working === next.working && (current.pending ?? []).join('|') === (next.pending ?? []).join('|')
          ? current
          : next
      ))
    }
    compute()
    // Preguntas: solo de las sesiones vivas (cada suscripción consulta al Engine).
    const live = new Set(liveKey ? liveKey.split('|') : [])
    for (const timeline of Object.values(runtime.getState().timelines)) if (ACTIVE.has(timeline.status)) live.add(timeline.sessionId)
    const stops = [runtime.subscribe(compute), useBoardAttentionStore.subscribe(compute), ...[...live].map((id) => subscribePendingQuestions(id, compute))]
    return () => { for (const stop of stops) stop() }
    // `profileKey`: cambia cuando llegan las sesiones y se sabe su perfil.
  }, [runtime, liveKey, profileKey])

  useEffect(() => {
    if (!options.ready) return
    const shown = enabled ? summary : { count: 0, category: 'none' as const, working: 0, pending: [] }
    const texts = indicatorTexts(shown, options.lang, (id) => titleFor.current?.(id) ?? null)
    const key = JSON.stringify([shown, texts])
    if (key === sent.current) return
    sent.current = key
    void platform().app.setIndicators({ generation: nextGeneration(), count: shown.count, category: shown.category, working: shown.working, ...texts }).catch(() => undefined)
  }, [enabled, summary, options.ready, options.lang])

  return summary
}
