import { ClipboardList, EllipsisVertical } from 'lucide-react'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { DOCK_VIEW_ICONS, DOCK_VIEW_LABELS } from '../../features/session/dockViews'
import {
  MORE_VIEWS,
  PRIMARY_VIEWS,
  selectDockLayout,
  selectSummaryOpen,
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
 * con su indicador vivo, y el menú «⋮» para Agentes, Flujos e Insight (si una
 * de ellas avisa, el botón del menú lleva su punto). Actúan
 * sobre la sesión destino: la abierta en Normal, el panel enfocado en Boards.
 * Sin conversación no aparecen. Con cuatro vistas abiertas, abrir otra
 * pregunta cuál reemplazar.
 */
export default function DockViewButtons({ sessionId, terminalEnabled, extraViews = [], onlyViews }: {
  sessionId: string
  terminalEnabled: boolean
  /** Vistas con botón solo en esta conversación (Rinari Agency: «Reglas» en el chat de un agente). */
  extraViews?: DockView[]
  /**
   * Solo estas vistas, sin Resumen ni «⋮»: un lugar que no es una conversación
   * con proyecto (la oficina de un equipo: Recado, Pizarra, Ficha).
   */
  onlyViews?: DockView[]
}) {
  const { t } = useI18n()
  const layout = useSessionDockStore(selectDockLayout(sessionId))
  const signals = useDockSignalsStore(selectDockSignals(sessionId))
  const toggleView = useSessionDockStore((state) => state.toggleView)
  const openView = useSessionDockStore((state) => state.openView)
  const [replace, setReplace] = useState<{ view: DockView; rect: DOMRect | undefined } | null>(null)
  const group = useRef<HTMLDivElement>(null)
  // La vista elegida en el menú «⋮», que se abre al cerrarse el menú.
  const picked = useRef<DockView | null>(null)
  // «Plan» se suma a los botones solo cuando la conversación tiene un plan (#55).
  const available = onlyViews ?? [...PRIMARY_VIEWS, ...(signals.plans > 0 ? (['plan'] as DockView[]) : []), ...extraViews].filter((view) => view !== 'terminal' || terminalEnabled)
  const shown = (view: DockView) => layout.visible && layout.views.includes(view)
  const toggleSummary = useSessionDockStore((state) => state.toggleSummary)
  // El Resumen flota sobre el chat, aparte del panel: su botón no toca las vistas.
  const summaryOpen = useSessionDockStore(selectSummaryOpen(sessionId))
  // El Resumen avisa cuando algo pide atención: por ahora, que la rama cambió desde el último trabajo.
  const branchChanged = useBranchNoticeStore((state) => Boolean(state.bySession[sessionId]))
  // En una ventana estrecha los botones no le quitan el sitio al título: quedan
  // los de las vistas abiertas o con algo que avisar, y el resto va en «Más».
  const compact = useSyncExternalStore(subscribeCompact, isCompact, () => false)
  const primary = compact ? available.filter((view) => shown(view) || indicatorFor(view, signals, t) !== null) : available
  const overflow = onlyViews ? available.filter((view) => !primary.includes(view)) : [...available.filter((view) => !primary.includes(view)), ...MORE_VIEWS]

  const press = useCallback((view: DockView, button: HTMLElement | null) => {
    const rect = button?.getBoundingClientRect()
    const launch = rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    if (toggleView(sessionId, view, launch) === 'full') setReplace({ view, rect })
  }, [sessionId, toggleView])

  const moreOpen = overflow.filter(shown)
  // Lo que avisa dentro del menú se ve en su botón: un subagente trabajando, un Flujo que te necesita.
  const moreSignals = overflow.map((view) => indicatorFor(view, signals, t)).filter((indicator): indicator is Indicator => indicator !== null)
  const moreTone = moreSignals.find((indicator) => indicator.tone === 'warning')?.tone ?? moreSignals[0]?.tone ?? (moreSignals.length ? 'live' : undefined)
  const moreLabel = moreSignals.length ? `${t('dock.more')} · ${moreSignals.map((indicator) => indicator.label).join(' · ')}` : t('dock.more')
  return (
    <Popover open={replace !== null} onOpenChange={(open) => { if (!open) setReplace(null) }}>
      <PopoverAnchor asChild>
        <div ref={group} className="dock-view-bar" role="toolbar" aria-label={t('dock.views')} data-session-id={sessionId}>
          {!onlyViews && <button
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
          </button>}
          {!onlyViews && <span className="dock-view-sep" aria-hidden="true" />}
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
          {overflow.length > 0 && <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="app-topbar-icon dock-view-button" data-view="more" aria-label={moreLabel} title={moreLabel} aria-pressed={moreOpen.length > 0}>
                <EllipsisVertical size={16} aria-hidden="true" />
                {moreTone && <span className="dock-view-dot" data-tone={moreTone} aria-hidden="true" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              // La vista elegida se abre cuando el menú ya se cerró: si el foco volviera al
              // botón «⋮» después, cerraría la pregunta de cuál reemplazar recién abierta.
              onCloseAutoFocus={(event) => {
                const view = picked.current
                if (!view) return
                picked.current = null
                event.preventDefault()
                press(view, group.current?.querySelector<HTMLElement>('[data-view="more"]') ?? null)
              }}
            >
              {overflow.map((view) => {
                const Icon = DOCK_VIEW_ICONS[view]
                const indicator = indicatorFor(view, signals, t)
                return (
                  <DropdownMenuCheckboxItem
                    key={view}
                    data-view={view}
                    checked={shown(view)}
                    onSelect={() => { picked.current = view }}
                  >
                    <Icon size={14} aria-hidden="true" /> {t(DOCK_VIEW_LABELS[view])}
                    {indicator?.label && <span className="dock-more-signal" data-tone={indicator.tone}>{indicator.count ?? '●'}</span>}
                  </DropdownMenuCheckboxItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>}
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
