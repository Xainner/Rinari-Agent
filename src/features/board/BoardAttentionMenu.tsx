import { useMemo, useState } from 'react'
import { BellRing, CheckCheck, CircleHelp, MessageSquareShare, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { useBoardStore } from '../../stores/board'
import { selectAttentionCounts, useBoardStatusStore } from '../../stores/boardStatus'
import { useBoardAttentionStore, unreadTurnIds } from '../../stores/boardAttention'
import type { PaneStatus } from '../engine/sessionSelectors'
import { markAllBoardResultsRead, revealBoardAttention } from './boardCommands'

export interface BoardAttentionMenuProps {
  labelFor: (sessionId: string) => string
  goBoard: () => void
  disabled?: boolean
}

interface AttentionRow {
  sessionId: string
  label: string
  status: PaneStatus
  unreadTurns: string[]
}

/**
 * Lista accesible de pendientes del board (resultados sin leer, intervenciones,
 * mensajes de pares) con navegación exacta. Muestra lo conocido también en
 * Normal/Ajustes; con el motor desconectado, lo conocido se marca como
 * «sincronizando».
 */
export default function BoardAttentionMenu({ labelFor, goBoard, disabled = false }: BoardAttentionMenuProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
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
  const total = counts.attentionPaneCount
  const syncing = rows.some((row) => row.status.availability !== 'ready')

  function go(row: AttentionRow) {
    setOpen(false)
    revealBoardAttention({ sessionId: row.sessionId, turnId: row.unreadTurns[0] ?? row.status.turnId ?? undefined }, { goBoard })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="app-topbar-icon app-topbar-attention"
          aria-label={t('board.attention.open', { n: total })}
          title={t('board.attention.open', { n: total })}
          disabled={disabled}
          data-testid="board-attention-trigger"
        >
          <BellRing size={16} aria-hidden="true" />
          {total > 0 && <span className="app-topbar-attention-badge" aria-hidden="true">{total > 99 ? '99+' : total}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2" aria-label={t('board.attention.title')}>
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-xs font-semibold text-[var(--text)]">{t('board.attention.title')}</span>
          {counts.unreadResultCount > 0 && (
            <button type="button" className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-2)] hover:underline" onClick={() => markAllBoardResultsRead()}>
              <CheckCheck size={12} aria-hidden="true" /> {t('board.attention.markAll')}
            </button>
          )}
        </div>
        {syncing && <p className="px-1 pb-1 text-[11px] text-[var(--text-subtle)]">{t('topbar.engine.starting')}</p>}
        {rows.length === 0 ? (
          <p className="px-1 py-2 text-xs text-[var(--text-muted)]">{t('board.attention.empty')}</p>
        ) : (
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
      </PopoverContent>
    </Popover>
  )
}
