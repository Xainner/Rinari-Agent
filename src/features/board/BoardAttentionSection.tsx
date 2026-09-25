import { useMemo } from 'react'
import { CheckCheck, CircleHelp, Columns3, MessageSquareShare, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBoardStore } from '../../stores/board'
import { selectAttentionCounts, useBoardStatusStore } from '../../stores/boardStatus'
import { useBoardAttentionStore, unreadTurnIds } from '../../stores/boardAttention'
import type { PaneStatus } from '../engine/sessionSelectors'
import { markAllBoardResultsRead, revealBoardAttention } from './boardCommands'

export interface BoardAttentionSectionProps {
  labelFor: (sessionId: string) => string
  goBoard: () => void
  /** Se eligió una fila: el centro de notificaciones se cierra. */
  onNavigate: () => void
}

interface AttentionRow {
  sessionId: string
  label: string
  status: PaneStatus
  unreadTurns: string[]
}

/** Cuántos paneles piden atención: el número de la campana suma esto. */
export function useBoardAttentionTotal(): number {
  return useBoardStatusStore(selectAttentionCounts).attentionPaneCount
}

/**
 * Sección Boards del centro de notificaciones: pendientes del board
 * (resultados sin leer, intervenciones, mensajes de pares) con navegación
 * exacta. Se deriva en vivo del estado de los paneles; con el motor
 * desconectado, lo conocido se marca como «sincronizando».
 */
export default function BoardAttentionSection({ labelFor, goBoard, onNavigate }: BoardAttentionSectionProps) {
  const { t } = useI18n()
  const byPane = useBoardStatusStore((state) => state.byPane)
  const counts = useBoardStatusStore(selectAttentionCounts)
  const sessions = useBoardAttentionStore((state) => state.sessions)
  const panes = useBoardStore((state) => state.panes)
  const rows = useMemo<AttentionRow[]>(() => {
    const seen = new Set<string>()
    const out: AttentionRow[] = []
    for (const pane of panes) {
      const status = byPane[pane.paneId]
      if (!status || seen.has(pane.sessionId)) continue
      seen.add(pane.sessionId)
      const unread = unreadTurnIds(sessions[pane.sessionId])
      const needsYou = status.kind === 'needs_you'
      const peers = (status.unreadPeerCount ?? 0) > 0
      if (unread.length === 0 && !needsYou && !peers) continue
      out.push({ sessionId: pane.sessionId, label: labelFor(pane.sessionId), status, unreadTurns: unread })
    }
    return out
  }, [panes, byPane, sessions, labelFor])
  const syncing = rows.some((row) => row.status.availability !== 'ready')

  function go(row: AttentionRow) {
    onNavigate()
    revealBoardAttention({ sessionId: row.sessionId, turnId: row.unreadTurns[0] ?? row.status.turnId ?? undefined }, { goBoard })
  }

  // Como cualquier otro módulo de la campana: sin pendientes, no ocupa sitio.
  if (rows.length === 0) return null
  return (
    <section aria-label={t('board.attention.title')} className="border-t border-[var(--border)] pt-2">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-subtle)] uppercase"><Columns3 size={12} aria-hidden="true" /> {t('board.attention.title')}</span>
        {counts.unreadResultCount > 0 && (
          <button type="button" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-2)] hover:underline" onClick={() => markAllBoardResultsRead()}>
            <CheckCheck size={12} aria-hidden="true" /> {t('board.attention.markAll')}
          </button>
        )}
      </div>
      {syncing && <p className="px-1 pb-1 text-[11px] text-[var(--text-subtle)]">{t('topbar.engine.starting')}</p>}
      {(
        <ul className="space-y-1" aria-label={t('board.attention.title')}>
          {rows.map((row) => (
            <li key={row.sessionId}>
              <button
                type="button"
                onClick={() => go(row)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-hover)]"
              >
                <span className="min-w-0 flex-1 truncate text-[var(--text)]">{row.label}</span>
                {row.status.kind === 'needs_you' && (
                  <span className="inline-flex items-center gap-1 text-[var(--warning)]" title={t('board.attention.interventions')}>
                    {row.status.pendingQuestions ? <CircleHelp size={12} aria-hidden="true" /> : <ShieldAlert size={12} aria-hidden="true" />}
                    {(row.status.pendingApprovals ?? 0) + (row.status.pendingQuestions ?? 0)}
                  </span>
                )}
                {row.unreadTurns.length > 0 && (
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--success,#3fbf7f)_20%,transparent)] px-1.5 text-[10px] font-bold text-[var(--success,#3fbf7f)]" title={t('board.attention.results')}>
                    {row.unreadTurns.length}
                  </span>
                )}
                {(row.status.unreadPeerCount ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-[var(--accent-2)]" title={t('board.attention.peerMessages')}>
                    <MessageSquareShare size={12} aria-hidden="true" />{row.status.unreadPeerCount}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
