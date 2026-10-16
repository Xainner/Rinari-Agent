import { ClipboardList, Ellipsis } from 'lucide-react'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { DOCK_VIEW_ICONS, DOCK_VIEW_LABELS } from '../../features/session/dockViews'
import {
  MORE_VIEWS,
  PRIMARY_VIEWS,
  selectDockLayout,
  useSessionDockStore,
  type DockView,
} from '../../stores/sessionDock'
import { selectDockSignals, useDockSignalsStore, type DockSignals } from '../../stores/dockSignals'
import { useBranchNoticeStore } from '../../stores/branchNotice'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'

/** Por debajo de este ancho de ventana, la barra deja a la vista solo lo abierto o lo que avisa. */
const COMPACT_QUERY = '(max-width: 1099px)'
function subscribeCompact(change: () => void): () => void {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_QUERY) : null
  query?.addEventListener('change', change)
  return () => query?.removeEventListener('change', change)
}
const isCompact = () => typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_QUERY).matches

/**
 * Un botón por vista del panel lateral en la barra de título (plan 0.4.0 #47),
 * con su indicador vivo, y «Más» para Tareas, Verificación e Insight. Actúan
 * sobre la sesión destino: la abierta en Normal, el panel enfocado en Boards.
 * Sin conversación no aparecen. Con cuatro vistas abiertas, abrir otra
 * pregunta cuál reemplazar.
 */
export default function DockViewButtons({ sessionId, terminalEnabled }: { sessionId: string; terminalEnabled: boolean }) {
  const { t } = useI18n()
  const layout = useSessionDockStore(selectDockLayout(sessionId))
  const signals = useDockSignalsStore(selectDockSignals(sessionId))
  const toggleView = useSessionDockStore((state) => state.toggleView)
  const openView = useSessionDockStore((state) => state.openView)
  const [replace, setReplace] = useState<{ view: DockView; rect: DOMRect | undefined } | null>(null)
  const group = useRef<HTMLDivElement>(null)
  // «Plan» se suma a los botones solo cuando la conversación tiene un plan (#55).
  const available = [...PRIMARY_VIEWS, ...(signals.plans > 0 ? (['plan'] as DockView[]) : [])].filter((view) => view !== 'terminal' || terminalEnabled)
  const shown = (view: DockView) => layout.visible && !layout.summary && layout.views.includes(view)
  const toggleSummary = useSessionDockStore((state) => state.toggleSummary)
  const summaryOpen = layout.visible && layout.summary
  // El Resumen avisa cuando algo pide atención: por ahora, que la rama cambió desde el último trabajo.
  const branchChanged = useBranchNoticeStore((state) => Boolean(state.bySession[sessionId]))
  // En una ventana estrecha los botones no le quitan el sitio al título: quedan
  // los de las vistas abiertas o con algo que avisar, y el resto va en «Más».
  const compact = useSyncExternalStore(subscribeCompact, isCompact, () => false)
  const primary = compact ? available.filter((view) => shown(view) || indicatorFor(view, signals, t) !== null) : available
  const overflow = [...available.filter((view) => !primary.includes(view)), ...MORE_VIEWS]

  const press = useCallback((view: DockView, button: HTMLElement | null) => {
    const rect = button?.getBoundingClientRect()
    const launch = rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    if (toggleView(sessionId, view, launch) === 'full') setReplace({ view, rect })
  }, [sessionId, toggleView])

  const moreOpen = overflow.filter(shown)
  return (
    <Popover open={replace !== null} onOpenChange={(open) => { if (!open) setReplace(null) }}>
      <PopoverAnchor asChild>
        <div ref={group} className="dock-view-bar" role="toolbar" aria-label={t('dock.views')} data-session-id={sessionId}>
          <button
            type="button"
            className="app-topbar-icon dock-view-button dock-summary-button"
            data-view="summary"
            aria-label={branchChanged ? `${t('dock.summary')} · ${t('dock.signal.branchChanged')}` : t('dock.summary')}
            title={branchChanged ? `${t('dock.summary')} · ${t('dock.signal.branchChanged')}` : t('dock.summary')}
            aria-pressed={summaryOpen}
            onClick={() => toggleSummary(sessionId)}
          >
            <ClipboardList size={16} aria-hidden="true" />
            {branchChanged && <span className="dock-view-dot" data-tone="warning" aria-hidden="true" />}
          </button>
          <span className="dock-view-sep" aria-hidden="true" />
          {primary.map((view) => {
            const Icon = DOCK_VIEW_ICONS[view]
            const label = t(DOCK_VIEW_LABELS[view])
            const indicator = indicatorFor(view, signals, t)
            return (
              <button
                key={view}
                type="button"
                className={cn('app-topbar-icon dock-view-button', indicator?.ring && 'has-ring')}
                data-view={view}
                data-ring={indicator?.ring}
                aria-label={indicator?.label ? `${label} · ${indicator.label}` : label}
                title={indicator?.label ? `${label} · ${indicator.label}` : label}
                aria-pressed={shown(view)}
                onClick={(event) => press(view, event.currentTarget)}
              >
                <Icon size={16} aria-hidden="true" />
                {indicator?.count !== undefined && <span className="dock-view-count" data-tone={indicator.tone} aria-hidden="true">{indicator.count}</span>}
                {indicator?.dot && <span className="dock-view-dot" data-tone={indicator.tone} aria-hidden="true" />}
              </button>
            )
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="app-topbar-icon dock-view-button" aria-label={t('dock.more')} title={t('dock.more')} aria-pressed={moreOpen.length > 0}>
                <Ellipsis size={16} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflow.map((view) => {
                const Icon = DOCK_VIEW_ICONS[view]
                return (
                  <DropdownMenuCheckboxItem
                    key={view}
                    checked={shown(view)}
                    onSelect={() => {
                      const anchor = group.current?.querySelector<HTMLElement>('[aria-label="' + t('dock.more') + '"]') ?? null
                      // Después de que el menú se cierre, para medir el botón ya en su sitio.
                      window.setTimeout(() => press(view, anchor), 0)
                    }}
                  >
                    <Icon size={14} aria-hidden="true" /> {t(DOCK_VIEW_LABELS[view])}
                  </DropdownMenuCheckboxItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PopoverAnchor>
      <PopoverContent align="end" className="dock-replace" aria-label={t('dock.replaceTitle')}>
        <p className="dock-replace-title">{t('dock.replaceTitle')}</p>
        <p className="dock-replace-hint">{replace && t('dock.replaceHint', { view: t(DOCK_VIEW_LABELS[replace.view]) })}</p>
        <div className="dock-replace-list">
          {layout.views.map((view) => {
            const Icon = DOCK_VIEW_ICONS[view]
            return (
              <button
                key={view}
                type="button"
                className="dock-replace-option"
                onClick={() => {
                  if (!replace) return
                  const rect = replace.rect
                  openView(sessionId, replace.view, { replace: view, launch: rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height } })
                  setReplace(null)
                }}
              >
                <Icon size={14} aria-hidden="true" /> {t(DOCK_VIEW_LABELS[view])}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type Indicator = { label?: string; count?: number; dot?: boolean; ring?: 'agent' | 'live'; tone?: 'live' | 'warning' | 'accent' }

/** El indicador vivo de cada botón: lo dice también su nombre accesible, no solo el color. */
function indicatorFor(view: DockView, signals: DockSignals, t: ReturnType<typeof useI18n>['t']): Indicator | null {
  switch (view) {
    case 'browser':
      return signals.browser ? { ring: signals.browser, label: t(signals.browser === 'agent' ? 'dock.signal.browserAgent' : 'dock.signal.browserLive') } : null
    case 'terminal':
      return signals.terminal > 0 ? { dot: true, tone: 'live', label: t('terminal.agentRunning', { n: signals.terminal }) } : null
    case 'changes':
      return signals.changes > 0 ? { count: signals.changes, tone: 'accent', label: t('dock.signal.changes', { n: signals.changes }) } : null
    case 'agents':
      return signals.agents > 0 ? { count: signals.agents, tone: 'live', label: t('agents.countRunning', { n: signals.agents }) } : null
    case 'flow':
      return signals.flowNeedsYou ? { dot: true, tone: 'warning', label: t('dock.signal.flowNeedsYou') } : null
    case 'files':
      return signals.filesNew ? { dot: true, tone: 'accent', label: t('dock.signal.filesNew') } : null
    default:
      return null
  }
}
