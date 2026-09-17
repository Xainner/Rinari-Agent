import { memo } from 'react'
import { CheckCheck, ChevronsLeftRight, ChevronsRightLeft, Crosshair, ListCollapse, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { useBoardStore } from '../../stores/board'
import { selectAttentionCounts, useBoardStatusStore } from '../../stores/boardStatus'
import { cn } from '../../lib/utils'
import {
  collapseAllPanes,
  collapseFinishedPanes,
  expandAllPanes,
  markAllBoardResultsRead,
  toggleFocusMode,
} from './boardCommands'

export interface BoardToolbarProps {
  onAddPane: () => void
}

/**
 * Barra del board: conteos por categoría (sesiones, no suma de badges) y
 * acciones masivas con destino estable en el store. No monta el controlador
 * de avisos ni decide lecturas: solo despacha comandos y muestra su resultado.
 */
function BoardToolbar({ onAddPane }: BoardToolbarProps) {
  const { t } = useI18n()
  const paneCount = useBoardStore((state) => state.panes.length)
  const focusMode = useBoardStore((state) => state.focusMode)
  const allCollapsed = useBoardStore((state) => state.panes.length > 0 && state.panes.every((pane) => pane.collapsed))
  const anyCollapsed = useBoardStore((state) => state.panes.some((pane) => pane.collapsed))
  const counts = useBoardStatusStore(selectAttentionCounts)

  function collapseFinished() {
    const result = collapseFinishedPanes()
    if (result.outcome === 'focus-mode') toast.info(t('board.toolbar.collapseFinishedFocusMode'))
    else if (result.outcome === 'nothing') toast.info(t('board.toolbar.nothingToCollapse'))
    else toast.success(t('board.toolbar.collapsedFinished', { n: result.count }))
  }

  return (
    <div className="board-toolbar" role="toolbar" aria-label={t('board.toolbar.label')} data-testid="board-toolbar">
      <div className="board-toolbar-counts">
        <span className="board-toolbar-count">{t('board.toolbar.count', { n: paneCount })}</span>
        {counts.workingPaneCount > 0 && <span className="board-toolbar-count is-working" data-testid="count-working">{t('board.toolbar.working', { n: counts.workingPaneCount })}</span>}
        {counts.needsYouPaneCount > 0 && <span className="board-toolbar-count is-needs-you" data-testid="count-needs-you">{t('board.toolbar.needsYou', { n: counts.needsYouPaneCount })}</span>}
        {counts.unreadResultPaneCount > 0 && <span className="board-toolbar-count is-unread" data-testid="count-unread">{t('board.toolbar.unread', { n: counts.unreadResultPaneCount })}</span>}
      </div>
      <div className="board-toolbar-actions">
        <button type="button" className="board-toolbar-button" disabled={paneCount === 0 || allCollapsed} onClick={collapseAllPanes} title={t('board.toolbar.collapseAll')}>
          <ChevronsRightLeft size={14} aria-hidden="true" /><span>{t('board.toolbar.collapseAll')}</span>
        </button>
        <button type="button" className="board-toolbar-button" disabled={!anyCollapsed} onClick={expandAllPanes} title={t('board.toolbar.expandAll')}>
          <ChevronsLeftRight size={14} aria-hidden="true" /><span>{t('board.toolbar.expandAll')}</span>
        </button>
        <button type="button" className="board-toolbar-button" disabled={paneCount === 0 || focusMode} onClick={collapseFinished} title={focusMode ? t('board.toolbar.collapseFinishedFocusMode') : t('board.toolbar.collapseFinishedHint')}>
          <ListCollapse size={14} aria-hidden="true" /><span>{t('board.toolbar.collapseFinished')}</span>
        </button>
        <button type="button" className={cn('board-toolbar-button', focusMode && 'is-active')} aria-pressed={focusMode} disabled={paneCount === 0} onClick={() => toggleFocusMode()} title={t('board.toolbar.focusModeHint')}>
          <Crosshair size={14} aria-hidden="true" /><span>{t('board.toolbar.focusMode')}</span>
        </button>
        <button type="button" className="board-toolbar-button" disabled={counts.unreadResultCount === 0} onClick={() => markAllBoardResultsRead()} title={t('board.toolbar.markAllRead')}>
          <CheckCheck size={14} aria-hidden="true" /><span>{t('board.toolbar.markAllRead')}</span>
        </button>
        <button type="button" className="board-toolbar-button is-primary" onClick={onAddPane} title={t('board.toolbar.addPane')}>
          <Plus size={14} aria-hidden="true" /><span>{t('board.toolbar.addPane')}</span>
        </button>
      </div>
    </div>
  )
}

export default memo(BoardToolbar)
