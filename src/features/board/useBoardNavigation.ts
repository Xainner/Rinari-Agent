import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { useBoardStore, isDraftPane } from '../../stores/board'
import { useBoardStatusStore } from '../../stores/boardStatus'
import { FOCUS_COMPOSER_EVENT } from '../../components/composer/focusComposer'

/** Pide a un panel plegado que abra su vistazo (y tome el foco). */
export const PANE_PEEK_EVENT = 'rinari:board-peek'

export function requestPanePeek(paneId: string) {
  window.dispatchEvent(new CustomEvent(PANE_PEEK_EVENT, { detail: { paneId } }))
}

/** Un panel te necesita: una aprobación, una pregunta o un fallo. */
const NEEDS_YOU = new Set(['needs_you', 'failed'])

/**
 * Atajos de Boards (plan-boards B.4.1):
 * - Ctrl+1…9 va al panel N: lo enfoca y pone el cursor en su composer; si
 *   está plegado, lo enfoca sin desplegarlo y abre su vistazo.
 * - Ctrl+J (acción `board-next-needs-you`) va al siguiente panel que te
 *   necesita, en orden de llegada; plegado, abre su vistazo. Si no hay
 *   ninguno, lo dice.
 */
export function useBoardNavigation() {
  const { t } = useI18n()
  // Desde cuándo cada panel te necesita: el orden de llegada.
  const since = useRef(new Map<string, number>())
  useEffect(() => {
    const track = (byPane: Record<string, { kind: string }>) => {
      const now = Date.now()
      for (const [paneId, status] of Object.entries(byPane)) {
        if (NEEDS_YOU.has(status.kind)) {
          if (!since.current.has(paneId)) since.current.set(paneId, now)
        } else since.current.delete(paneId)
      }
      for (const paneId of [...since.current.keys()]) if (!byPane[paneId]) since.current.delete(paneId)
    }
    track(useBoardStatusStore.getState().byPane)
    return useBoardStatusStore.subscribe((state) => track(state.byPane))
  }, [])

  const goTo = useCallback((paneId: string) => {
    const board = useBoardStore.getState()
    const pane = board.panes.find((item) => item.paneId === paneId)
    if (!pane) return
    if (pane.collapsed) {
      board.selectPane(pane.paneId)
      requestPanePeek(pane.paneId)
      return
    }
    board.focusPane(pane.paneId)
    if (!isDraftPane(pane)) window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT, { detail: { sessionId: pane.sessionId } }))
  }, [])

  const nextNeedsYou = useCallback(() => {
    const { panes, focusedPaneId } = useBoardStore.getState()
    const order = [...since.current.entries()]
      .filter(([paneId]) => panes.some((pane) => pane.paneId === paneId))
      .sort((a, b) => a[1] - b[1])
      .map(([paneId]) => paneId)
    if (order.length === 0) {
      toast.info(t('board.nextNeedsYou.none'), { id: 'board-next-needs-you' })
      return
    }
    const current = focusedPaneId ? order.indexOf(focusedPaneId) : -1
    goTo(order[(current + 1) % order.length])
  }, [goTo, t])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (!/^[1-9]$/.test(event.key)) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const pane = useBoardStore.getState().panes[Number(event.key) - 1]
      if (!pane) return
      event.preventDefault()
      goTo(pane.paneId)
    }
    function onAction(event: Event) {
      if ((event as CustomEvent).detail === 'board-next-needs-you') nextNeedsYou()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('rinari-action', onAction)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('rinari-action', onAction)
    }
  }, [goTo, nextNeedsYou])

  return { goTo, nextNeedsYou }
}
