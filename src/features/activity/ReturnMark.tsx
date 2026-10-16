import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { useBoardAttentionStore, type TerminalOutcome } from '../../stores/boardAttention'
import { useReadTracking } from '../board/useResultVisibility'

/** Lo que dura apagarse el brillo cuando el resultado ya se leyó. */
export const RETURN_FADE_MS = 2400

export type ReturnState = 'unread' | 'fading' | null

/**
 * La marca de un resultado que terminó mientras no estabas (plan 0.4.0 #62):
 * `unread` mientras no se lee; al leerse pasa a `fading` (el brillo se apaga
 * en unos segundos, o al instante con movimiento reducido) y luego a nada. Un
 * resultado que ya estaba leído al montarse no se marca.
 */
export function useReturnMark(turnId: string, calm: boolean): { state: ReturnState; outcome?: TerminalOutcome; completedAt?: number } {
  const sessionId = useReadTracking()?.sessionId ?? null
  const receipt = useBoardAttentionStore((store) => (sessionId ? store.sessions[sessionId]?.turns[turnId] : undefined))
  const marked = receipt?.away === true && receipt.state === 'unread'
  const wasMarked = useRef(marked)
  const [fading, setFading] = useState(false)
  useEffect(() => {
    if (marked) { wasMarked.current = true; setFading(false); return }
    if (!wasMarked.current) return
    wasMarked.current = false
    if (calm) return
    setFading(true)
    const timer = window.setTimeout(() => setFading(false), RETURN_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [marked, calm])
  const state: ReturnState = marked ? 'unread' : fading ? 'fading' : null
  return { state, outcome: receipt?.outcome, completedAt: receipt?.completedAt }
}

/** «hace 4 minutos», que avanza solo mientras se ve. */
function useAgo(at: number | undefined, lang: string): string | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (at === undefined) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [at])
  if (at === undefined) return null
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  if (seconds < 60) return format.format(-seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return format.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return format.format(-hours, 'hour')
  return format.format(-Math.round(hours / 24), 'day')
}

/** La píldora de arriba del resultado: «Nuevo · terminó hace 4 min», o «Falló · …». */
export function ReturnPill({ outcome, completedAt }: { outcome?: TerminalOutcome; completedAt?: number }) {
  const { t, lang } = useI18n()
  const ago = useAgo(completedAt, lang)
  const tone = outcome === 'failed' ? 'danger' : outcome === 'cancelled' || outcome === 'stopped' ? 'warning' : 'accent'
  const label = outcome === 'failed' ? t('result.return.failed') : outcome === 'cancelled' || outcome === 'stopped' ? t('result.return.stopped') : t('result.return.new')
  return (
    <p className="turn-return-pill" data-testid="turn-return" data-tone={tone}>
      <span className="turn-return-dot" aria-hidden="true" />
      <span className="turn-return-label">{label}</span>
      {ago && <span className="turn-return-ago">{t('result.return.ago', { ago })}</span>}
    </p>
  )
}
