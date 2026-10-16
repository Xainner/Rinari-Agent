import { useMemo } from 'react'
import { ArrowRight, CircleAlert, Hand, MessagesSquare, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBoardStore } from '../../stores/board'
import { unreadTurnIds, useBoardAttentionStore } from '../../stores/boardAttention'
import { signalOf, useSessionPendingStore, type SessionSignal } from './attentionIndicators'

export interface ConversationAttentionSectionProps {
  labelFor: (sessionId: string) => string
  projectFor?: (sessionId: string) => string | null
  /** «Ir»: abre la conversación en el turno pendiente. */
  onOpen: (sessionId: string, turnId?: string) => void
}

interface Row {
  sessionId: string
  signal: SessionSignal
  turnId?: string
}

const ORDER: Record<SessionSignal, number> = { needs_you: 0, failed: 1, unread: 2 }

/** Cuántas conversaciones piden algo: el número de la campana suma esto. */
export function useConversationAttentionTotal(): number {
  return useSessionPendingStore((state) => Object.keys(state.bySession).length)
}

/**
 * Sección «Conversaciones» de la campana (#33): cada conversación que te
 * necesita, falló o tiene un resultado sin leer, por su nombre, con «Ir».
 * Las que están en Boards las lista su propia sección.
 */
export default function ConversationAttentionSection({ labelFor, projectFor, onOpen }: ConversationAttentionSectionProps) {
  const { t } = useI18n()
  const pending = useSessionPendingStore((state) => state.bySession)
  const panes = useBoardStore((state) => state.panes)
  const receipts = useBoardAttentionStore((state) => state.sessions)
  const rows = useMemo<Row[]>(() => {
    const inBoard = new Set(panes.map((pane) => pane.sessionId))
    const out: Row[] = []
    for (const [sessionId, item] of Object.entries(pending)) {
      if (inBoard.has(sessionId)) continue
      const signal = signalOf(item)
      if (!signal) continue
      out.push({ sessionId, signal, turnId: unreadTurnIds(receipts[sessionId])[0] })
    }
    return out.sort((a, b) => ORDER[a.signal] - ORDER[b.signal])
  }, [pending, panes, receipts])

  if (rows.length === 0) return null
  return (
    <section aria-label={t('notifications.module.conversations')} className="border-t border-[var(--line-1)] pt-2" data-testid="notify-conversations">
      <p className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-subtle)] uppercase">
        <MessagesSquare size={12} aria-hidden="true" /> {t('notifications.module.conversations')}
      </p>
      <ul className="space-y-0.5">
        {rows.map((row) => {
          const project = projectFor?.(row.sessionId) ?? null
          const label = labelFor(row.sessionId)
          return (
            <li key={row.sessionId} className="notify-item notify-conv">
              <button
                type="button"
                onClick={() => onOpen(row.sessionId, row.turnId)}
                className="notify-conv-row"
                data-signal={row.signal}
              >
                <span className="sidebar-signal" data-signal={row.signal} aria-hidden="true">{row.signal === 'needs_you' && <Hand size={10} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-[var(--text)]">{label}</span>
                  {project && project !== label && <span className="block truncate text-[11px] text-[var(--text-muted)]">{project}</span>}
                </span>
                {row.signal === 'needs_you' && (
                  <span className="r-chip notify-conv-chip" data-tone="warning"><ShieldAlert size={11} aria-hidden="true" />{t('notifications.conversation.needsYou')}</span>
                )}
                {row.signal === 'failed' && (
                  <span className="r-chip notify-conv-chip" data-tone="danger"><CircleAlert size={11} aria-hidden="true" />{t('notifications.conversation.failed')}</span>
                )}
                {row.signal === 'unread' && <span className="r-chip notify-conv-chip" data-tone="accent">{t('notifications.conversation.unread')}</span>}
                <span className="notify-conv-go" aria-hidden="true">{t('notify.go')}<ArrowRight size={11} /></span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
