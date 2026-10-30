import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppWindow, ArrowLeft, ArrowRight, ExternalLink, Globe, Hand, Lock, Plus, RotateCw, Star, X } from 'lucide-react'

import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import type { NativeBrowserContext, NativeBrowserTarget } from '../../platform/contract'
import { RinariAvatar } from '../rinari/RinariAvatar'

export interface BrowserToolbarProps {
  /** Estado del contexto nativo, o `null` con el visor de capturas. */
  context: NativeBrowserContext | null
  /** Pestañas a enseñar: del contexto nativo o del visor de capturas. */
  targets: NativeBrowserTarget[]
  activeTargetId: string
  /** URL que se muestra; con el visor viene de la captura. */
  url: string
  connected: boolean
  /** Estado del contexto, para no llamar «desconectado» a lo que se prepara. */
  state?: string
  /** Hay un turno en marcha: Rinari puede estar usando la página. */
  busy?: boolean
  onSelectTarget: (targetId: string) => void
  onNavigate?: (url: string) => void
  /** Atrás, adelante, recargar y detener. Usarlos es tomar el navegador (#46). */
  onHistory?: (action: 'back' | 'forward' | 'reload' | 'stop') => void
  /** Pestaña nueva («+»); sin él, no se ofrece (visor de capturas). */
  onNewTab?: () => void
  /** Cerrar una pestaña («×»); sin él, no se ofrece. */
  onCloseTab?: (targetId: string) => void
  /** Sube cuando hay que llevar el foco a la dirección (Ctrl+L con el foco en la página). */
  focusAddress?: number
  /** La página está fijada en la página de inicio del proyecto (#46). */
  pinned?: boolean
  onTogglePin?: () => void
  /**
   * El sitio del selector de tamaño de página (Ajustar · 390 · 768 · 1280 ·
   * 1920), junto a la dirección (decisión del dueño, #47). Lo llena el #44b
   * cuando el navegador nativo sepa cambiar su viewport; hasta entonces no se
   * ofrece nada que no funcione.
   */
  sizeControl?: ReactNode
  /**
   * Se ve la página de inicio: su pie ya dice el estado, y «Preparando…» aquí
   * contradiría a «Lista para navegar» (no hay nada que preparar hasta abrir algo).
   */
  home?: boolean
}

/** Separa el dominio del resto de la dirección para leerla como en un navegador. */
function splitUrl(url: string): { secure: boolean; host: string; rest: string } | null {
  try {
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol)) return null
    return { secure: parsed.protocol === 'https:', host: parsed.host, rest: `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}` }
  } catch {
    return null
  }
}

/** Cómo se llama una pestaña: su título, su dominio o «Nueva pestaña». */
function tabLabel(page: NativeBrowserTarget, blank: string): string {
  if (page.title && page.title !== 'about:blank') return page.title
  if (!page.url || page.url === 'about:blank') return blank
  return splitUrl(page.url)?.host || page.url
}

/**
 * Barra del navegador, como uno de verdad: pestañas, navegación y dirección
 * arriba, y debajo una línea de estado.
 *
 * Sin «Tomar control» ni «Devolver al agente» (plan 0.4.0 #46): usar la
 * página o esta barra es tomar el navegador, y main espera a que el Engine lo
 * confirme antes de tocar nada. Cuando Rinari necesita la página y tú la
 * estás usando, espera, y aquí se dice.
 */
export default function BrowserToolbar({
  context,
  targets,
  activeTargetId,
  url,
  connected,
  state,
  busy = false,
  onSelectTarget,
  onNavigate,
  onHistory,
  onNewTab,
  onCloseTab,
  focusAddress = 0,
  pinned = false,
  onTogglePin,
  sizeControl,
  home = false,
}: BrowserToolbarProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(url)
  const [editing, setEditing] = useState(false)
  const [openError, setOpenError] = useState('')
  const address = useRef<HTMLInputElement | null>(null)

  // La URL del contexto manda salvo mientras el usuario está escribiendo.
  useEffect(() => { if (!editing) setDraft(url) }, [url, editing])

  // Ctrl+L pulsado en la página: main devuelve el foco a Rinari y lo avisa.
  useEffect(() => {
    if (focusAddress === 0) return
    address.current?.focus()
    address.current?.select()
  }, [focusAddress])

  const control = context?.control_state
  const userHasControl = control === 'user'
  const uncertain = control === 'uncertain'
  const waiting = Boolean(context?.agent_waiting)
  const external = Boolean(context?.external)
  const native = Boolean(context?.backend === 'electron-native')
  const preparing = state === 'creating' || state === 'absent'
  const parts = splitUrl(url)
  const navDisabled = !native || !onHistory
  const activePage = targets.find((page) => page.target_id === activeTargetId)
  // Lo que dice el host de la pestaña visible; un host antiguo no lo manda y
  // entonces los botones siguen como antes, siempre disponibles.
  const loading = Boolean(native && activePage?.loading)
  const canGoBack = activePage?.can_go_back ?? true
  const canGoForward = activePage?.can_go_forward ?? true
  // Con una sola pestaña y sin poder abrir otra (visor de capturas), la tira
  // no dice nada.
  const showTabs = targets.length > 1 || (Boolean(onNewTab) && targets.length > 0)
  const agentUsing = native && busy && !userHasControl && !uncertain && !waiting && !external
  // La línea de estado es un chip canónico: su tono dice de quién es la página.
  // En reposo («lista para navegar») no hay nada que decir y no se muestra:
  // solo quedan los avisos de verdad (preparando, desconectado, externo,
  // control dudoso, Rinari esperando o usándola).
  const status: { text: string; tone?: 'accent' | 'success' | 'warning' | 'danger'; icon?: ReactNode } | null = preparing
    ? { text: t('browser.nativePreparing') }
    : !connected
      ? { text: t('browser.disconnected'), tone: 'danger' }
      : !native
        ? { text: t('browser.live'), tone: 'success' }
        : external
          ? { text: t('browser.external'), tone: 'accent', icon: <AppWindow size={11} aria-hidden="true" /> }
          : uncertain
            ? { text: t('browser.controlUncertain'), tone: 'warning' }
            : waiting
              ? { text: t('browser.agentWaiting'), tone: 'warning', icon: <Hand size={11} aria-hidden="true" /> }
              : busy && !userHasControl
                ? { text: t('browser.agentUsing'), tone: 'accent' }
                : null

  return (
    <header className="browser-toolbar">
      <div className="browser-chrome">
        <button type="button" className="browser-nav" aria-label={t('browser.back')} title={t('browser.back')} disabled={navDisabled || !canGoBack} onClick={() => onHistory?.('back')}><ArrowLeft size={15} /></button>
        <button type="button" className="browser-nav" aria-label={t('browser.forward')} title={t('browser.forward')} disabled={navDisabled || !canGoForward} onClick={() => onHistory?.('forward')}><ArrowRight size={15} /></button>
        {/* Mientras carga, recargar se vuelve detener, como en cualquier navegador. */}
        {loading ? (
          <button type="button" className="browser-nav" data-testid="browser-stop" aria-label={t('browser.stop')} title={t('browser.stop')} disabled={navDisabled} onClick={() => onHistory?.('stop')}><X size={15} /></button>
        ) : (
          <button type="button" className="browser-nav" data-testid="browser-reload" aria-label={t('browser.reload')} title={t('browser.reload')} disabled={navDisabled} onClick={() => onHistory?.('reload')}><RotateCw size={14} /></button>
        )}

        {native && onNavigate ? (
          <form
            className="browser-address"
            data-editing={editing || undefined}
            onSubmit={(event) => {
              event.preventDefault()
              if (draft.trim()) onNavigate(draft.trim())
              ;(event.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur()
            }}
          >
            {parts?.secure ? <Lock size={12} aria-hidden="true" className="text-[var(--success)]" /> : <Globe size={12} aria-hidden="true" />}
            <input
              ref={address}
              aria-label={t('browser.url')}
              className="browser-toolbar-url-input"
              value={draft}
              // Escribir una dirección es tomar el navegador: main lo pide al
              // Engine y espera a que Rinari termine su paso (#46).
              onFocus={(event) => { setEditing(true); event.currentTarget.select() }}
              onBlur={() => setEditing(false)}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              placeholder={t('browser.addressPlaceholder')}
            />
            {!editing && parts && <span className="browser-address-pretty" aria-hidden="true"><b>{parts.host}</b>{parts.rest}</span>}
          </form>
        ) : (
          <span className="browser-address" title={url || undefined}>
            <Globe size={12} aria-hidden="true" />
            <span className="browser-toolbar-url">{parts ? <><b>{parts.host}</b>{parts.rest}</> : url || t('browser.waiting')}</span>
          </span>
        )}

        {onTogglePin && (
          <button
            type="button"
            className="browser-nav"
            data-testid="browser-pin"
            aria-pressed={pinned}
            aria-label={pinned ? t('browser.unpin') : t('browser.pin')}
            title={pinned ? t('browser.unpin') : t('browser.pin')}
            onClick={onTogglePin}
          >
            <Star size={14} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        )}
        {/* Abrir fuera es **otra** ventana y otro contexto, no tomar el control
            de esta página: el §7 pide que siga rotulado como acción secundaria. */}
        {url && /^https?:\/\//i.test(url) && (
          <button
            type="button"
            className="browser-nav"
            aria-label={t('browser.openExternal')}
            title={t('browser.openExternal')}
            onClick={() =>
              void platform()
                .opener.openUrl(url)
                .catch((reason) => setOpenError(String(reason)))
            }
          >
            <ExternalLink size={14} />
          </button>
        )}
        {sizeControl}
      </div>

      {showTabs && (
        <div className="browser-tabs" role="group" aria-label={t('browser.tabs')} data-testid="browser-tabs">
          {targets.map((page) => {
            const active = page.target_id === activeTargetId
            const label = tabLabel(page, t('browser.newTab'))
            return (
              <div key={page.target_id} className="browser-tab" data-active={active || undefined} data-testid="browser-tab">
                <button
                  type="button"
                  className="browser-tab-select"
                  aria-current={active ? 'page' : undefined}
                  title={page.url && page.url !== 'about:blank' ? `${label}\n${page.url}` : label}
                  // Cambiar de pestaña redirige la siguiente operación del
                  // agente, que sin `target_id` va a la activa: main toma el
                  // navegador para ti antes de cambiarla (#46).
                  onClick={() => { if (!active) onSelectTarget(page.target_id) }}
                >
                  {page.loading
                    ? <span className="browser-tab-spinner" role="img" aria-label={t('browser.loading')} />
                    : <Globe size={12} aria-hidden="true" className="shrink-0" />}
                  <span className="browser-tab-title">{label}</span>
                </button>
                {onCloseTab && (
                  <button
                    type="button"
                    className="browser-tab-close"
                    aria-label={t('browser.closeTab', { title: label })}
                    title={t('browser.closeTab', { title: label })}
                    onClick={() => onCloseTab(page.target_id)}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}
          {onNewTab && (
            <button type="button" className="browser-nav browser-tab-new" data-testid="browser-new-tab" aria-label={t('browser.newTab')} title={t('browser.newTab')} onClick={onNewTab}>
              <Plus size={14} />
            </button>
          )}
        </div>
      )}

      {!home && (preparing || loading || (busy && !userHasControl && connected)) && <div className="browser-progress" aria-hidden="true"><i /></div>}

      {!home && status && <div
        className="browser-control"
        data-control={native ? (control ?? 'agent') : 'viewer'}
        data-waiting={waiting || undefined}
      >
        {agentUsing && <RinariAvatar state="working" size={20} />}
        {/* Un contexto que se está preparando no está desconectado, y decirlo
            así hace pensar que algo se rompió. */}
        <span role="status" className="browser-toolbar-state r-chip" data-tone={status.tone} data-connected={connected || undefined}>
          {status.icon}
          {status.text}
        </span>
      </div>}
      {openError && (
        <span role="alert" className="px-3 pb-2 text-xs text-[var(--warning)]">
          {openError}
        </span>
      )}
    </header>
  )
}
