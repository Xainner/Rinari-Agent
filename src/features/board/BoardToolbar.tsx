import { memo } from 'react'
import { CheckCheck, ChevronsLeftRight, ChevronsRightLeft, Crosshair, ListCollapse, MoreHorizontal, PanelsTopLeft, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { useConfirm } from '../../components/ui/useConfirm'
import { useBoardStore } from '../../stores/board'
import { selectAttentionCounts, useBoardStatusStore } from '../../stores/boardStatus'
import { cn } from '../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {
  collapseAllPanes,
  collapseFinishedPanes,
  expandAllPanes,
  markAllBoardResultsRead,
  removeAllPanes,
  toggleFocusMode,
  toggleFitToView,
} from './boardCommands'

export interface BoardToolbarProps {
  onAddPane: () => void
}

/**
 * Barra del board (plan-boards B.4.3): a la vista, los contadores por
 * categoría (sesiones, no suma de badges), «Ajustar a la vista» y «Añadir
 * panel»; el resto de acciones masivas en el menú «⋯». No monta el
 * controlador de avisos ni decide lecturas: solo despacha comandos. Que
 * aparezca un contador nunca cambia la altura de la barra (`boards-fit`).
 */
function BoardToolbar({ onAddPane }: BoardToolbarProps) {
  const { t } = useI18n()
  const paneCount = useBoardStore((state) => state.panes.length)
  const focusMode = useBoardStore((state) => state.focusMode)
  const fitToView = useBoardStore((state) => state.fitToView)
  const allCollapsed = useBoardStore((state) => state.panes.length > 0 && state.panes.every((pane) => pane.collapsed))
  const anyCollapsed = useBoardStore((state) => state.panes.some((pane) => pane.collapsed))
  const counts = useBoardStatusStore(selectAttentionCounts)
  const confirm = useConfirm()

  function collapseFinished() {
    const result = collapseFinishedPanes()
    if (result.outcome === 'focus-mode') toast.info(t('board.toolbar.collapseFinishedFocusMode'))
    else if (result.outcome === 'nothing') toast.info(t('board.toolbar.nothingToCollapse'))
    else toast.success(t('board.toolbar.collapsedFinished', { n: result.count }))
  }

  // Vaciar el board no toca las conversaciones, pero la disposición no se
  // puede deshacer: se confirma con el diálogo de la app.
  async function removeAll() {
    const ok = await confirm.ask({
      title: t('board.toolbar.removeAllConfirmTitle', { n: paneCount }),
      body: t('board.toolbar.removeAllConfirmBody'),
      confirmLabel: t('board.toolbar.removeAll'),
      cancelLabel: t('common.cancel'),
    })
    if (ok) removeAllPanes()
  }

  return (
    <div className="board-toolbar" role="toolbar" aria-label={t('board.toolbar.label')} data-testid="board-toolbar">
      <div className="board-toolbar-counts">
        <span className="board-toolbar-count">{paneCount === 1 ? t('board.toolbar.countOne') : t('board.toolbar.count', { n: paneCount })}</span>
        {counts.workingPaneCount > 0 && <span className="board-toolbar-count is-working" data-testid="count-working">{t('board.toolbar.working', { n: counts.workingPaneCount })}</span>}
        {counts.needsYouPaneCount > 0 && <span className="board-toolbar-count is-needs-you" data-testid="count-needs-you">{t('board.toolbar.needsYou', { n: counts.needsYouPaneCount })}</span>}
        {counts.unreadResultPaneCount > 0 && <span className="board-toolbar-count is-unread" data-testid="count-unread">{t('board.toolbar.unread', { n: counts.unreadResultPaneCount })}</span>}
      </div>
      <div className="board-toolbar-actions">
        {focusMode && (
          // En modo foco queda a la vista para poder salir de un gesto.
          <button type="button" className="board-toolbar-button is-active" aria-pressed onClick={() => toggleFocusMode()} title={t('board.toolbar.focusModeHint')}>
            <Crosshair size={14} aria-hidden="true" /><span>{t('board.toolbar.focusMode')}</span>
          </button>
        )}
        <button type="button" className={cn('board-toolbar-button', fitToView && 'is-active')} aria-pressed={fitToView} aria-label={t('board.toolbar.fitToView')} onClick={toggleFitToView} title={t('board.toolbar.fitToViewHint')}>
          <PanelsTopLeft size={14} aria-hidden="true" /><span>{t('board.toolbar.fitToView')}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="board-toolbar-button" aria-label={t('board.toolbar.more')} title={t('board.toolbar.more')}>
              <MoreHorizontal size={14} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem disabled={paneCount === 0 || focusMode} onSelect={collapseFinished} title={focusMode ? t('board.toolbar.collapseFinishedFocusMode') : t('board.toolbar.collapseFinishedHint')}>
              <ListCollapse size={13} aria-hidden="true" /> {t('board.toolbar.collapseFinished')}
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={focusMode} disabled={paneCount === 0} onCheckedChange={() => toggleFocusMode()} title={t('board.toolbar.focusModeHint')}>
              {t('board.toolbar.focusMode')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem disabled={counts.unreadResultCount === 0} onSelect={() => markAllBoardResultsRead()}>
              <CheckCheck size={13} aria-hidden="true" /> {t('board.toolbar.markAllRead')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={paneCount === 0 || allCollapsed} onSelect={collapseAllPanes}>
              <ChevronsRightLeft size={13} aria-hidden="true" /> {t('board.toolbar.collapseAll')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!anyCollapsed} onSelect={expandAllPanes}>
              <ChevronsLeftRight size={13} aria-hidden="true" /> {t('board.toolbar.expandAll')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={paneCount === 0} onSelect={() => void removeAll()} title={t('board.toolbar.removeAllHint')}>
              <X size={13} aria-hidden="true" /> {t('board.toolbar.removeAll')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="board-toolbar-button is-primary" onClick={onAddPane} aria-label={t('board.toolbar.addPane')} title={t('board.toolbar.addPane')}>
          <Plus size={14} aria-hidden="true" /><span>{t('board.toolbar.addPane')}</span>
        </button>
      </div>
      {confirm.dialog}
    </div>
  )
}

export default memo(BoardToolbar)
