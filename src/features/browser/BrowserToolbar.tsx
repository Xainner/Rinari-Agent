import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Lock, RotateCw } from 'lucide-react'

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
  /** Atrás, adelante, recargar. Solo con el control (como navegar). */
  onHistory?: (action: 'back' | 'forward' | 'reload') => void
  onTakeControl?: () => void
  onReturnControl?: () => void
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

/**
 * Barra del navegador, en dos filas como uno de verdad: navegación y
 * dirección arriba; abajo quién manda (Rinari o tú) con la acción para cambiarlo.
 *
 * El control se enseña siempre que el contexto sea nativo, porque es lo que
 * distingue mirar de intervenir. Mientras la transición está en curso los dos
 * botones se deshabilitan: conceder antes de que el Engine confirme sería
 * prometer una exclusión que todavía no existe (§7).
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
  onTakeControl,
  onReturnControl,
}: BrowserToolbarProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(url)
  const [editing, setEditing] = useState(false)
  const [openError, setOpenError] = useState('')

  // La URL del contexto manda salvo mientras el usuario está escribiendo.
  useEffect(() => { if (!editing) setDraft(url) }, [url, editing])

  const control = context?.control_state
  const inTransition = control === 'taking-user-control'
  const userHasControl = control === 'user'
  const uncertain = control === 'uncertain'
  const native = Boolean(context?.backend === 'electron-native')
  const preparing = state === 'creating' || state === 'absent'
  const parts = splitUrl(url)
  const navDisabled = !native || !userHasControl || !onHistory
  const navTitle = native && !userHasControl ? t('browser.needsControl') : undefined

  return (
    <header className="browser-toolbar">
      <div className="browser-chrome">
        <button type="button" className="browser-nav" aria-label={t('browser.back')} title={navTitle ?? t('browser.back')} disabled={navDisabled} onClick={() => onHistory?.('back')}><ArrowLeft size={15} /></button>
        <button type="button" className="browser-nav" aria-label={t('browser.forward')} title={navTitle ?? t('browser.forward')} disabled={navDisabled} onClick={() => onHistory?.('forward')}><ArrowRight size={15} /></button>
        <button type="button" className="browser-nav" aria-label={t('browser.reload')} title={navTitle ?? t('browser.reload')} disabled={navDisabled} onClick={() => onHistory?.('reload')}><RotateCw size={14} /></button>

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
              aria-label={t('browser.url')}
              className="browser-toolbar-url-input"
              value={draft}
              // Navegar se lleva por delante el DOM que el agente está usando.
              // main lo rechaza igualmente —la autoridad no está aquí—, pero
              // ofrecer algo que va a fallar es peor que no ofrecerlo.
              disabled={!userHasControl}
              title={!userHasControl ? t('browser.needsControl') : undefined}
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
      </div>

      {targets.length > 1 && (
        <div className="browser-tabs">
          <select
            aria-label={t('browser.tab')}
            className="browser-toolbar-select"
            value={activeTargetId}
            // Cambiar de pestaña con el navegador nativo redirige la siguiente
            // operación del agente, que sin `target_id` va a la activa. Mientras
            // no mande el usuario, no se ofrece (§7). En el visor de capturas no
            // aplica: allí no hay una vista que el agente esté usando.
            disabled={native && !userHasControl}
            title={native && !userHasControl ? t('browser.needsControl') : undefined}
            onChange={(event) => onSelectTarget(event.target.value)}
          >
            {targets.map((page) => (
              <option key={page.target_id} value={page.target_id}>
                {page.title || page.url}
              </option>
            ))}
          </select>
        </div>
      )}

      {(preparing || (busy && !userHasControl && connected)) && <div className="browser-progress" aria-hidden="true"><i /></div>}

      <div className="browser-control" data-control={native ? (control ?? 'agent') : 'viewer'}>
        {native && !userHasControl && !uncertain && <RinariAvatar state={busy ? 'working' : 'idle'} size={22} />}
        {/* Un contexto que se está preparando no está desconectado, y decirlo
            así hace pensar que algo se rompió. */}
        <span role="status" className="browser-toolbar-state" data-connected={connected || undefined}>
          {preparing
            ? t('browser.nativePreparing')
            : !connected
              ? t('browser.disconnected')
              : !native
                ? t('browser.live')
                : uncertain
                  ? t('browser.controlUncertain')
                  : userHasControl
                    ? t('browser.controlUser')
                    : t('browser.controlAgent')}
        </span>
        {native && onTakeControl && onReturnControl && (
          <button
            type="button"
            className="btn btn-secondary btn-xs ml-auto"
            disabled={inTransition}
            onClick={() => (userHasControl ? onReturnControl() : onTakeControl())}
          >
            {inTransition
              ? t('browser.controlPending')
              : userHasControl
                ? t('browser.returnControl')
                : t('browser.takeControl')}
          </button>
        )}
      </div>
      {openError && (
        <span role="alert" className="px-3 pb-2 text-xs text-[var(--warning)]">
          {openError}
        </span>
      )}
    </header>
  )
}
