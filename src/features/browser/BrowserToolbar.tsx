import { useEffect, useState } from 'react'
import { Globe } from 'lucide-react'

import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import type { NativeBrowserContext, NativeBrowserTarget } from '../../platform/contract'

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
  onSelectTarget: (targetId: string) => void
  onNavigate?: (url: string) => void
  onTakeControl?: () => void
  onReturnControl?: () => void
}

/**
 * Toolbar del navegador: quién manda, qué pestaña y qué URL.
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
  onSelectTarget,
  onNavigate,
  onTakeControl,
  onReturnControl,
}: BrowserToolbarProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(url)
  const [openError, setOpenError] = useState('')

  // La URL del contexto manda salvo mientras el usuario está escribiendo.
  useEffect(() => setDraft(url), [url])

  const control = context?.control_state
  const inTransition = control === 'taking-user-control'
  const userHasControl = control === 'user'
  const uncertain = control === 'uncertain'
  const native = Boolean(context?.backend === 'electron-native')

  return (
    <header className="browser-toolbar">
      <Globe size={14} aria-hidden="true" />
      {/* Un contexto que se está preparando no está desconectado, y decirlo
          así hace pensar que algo se rompió. */}
      <span role="status" className="browser-toolbar-state" data-connected={connected || undefined}>
        {connected
          ? t('browser.live')
          : state === 'creating' || state === 'absent'
            ? t('browser.nativePreparing')
            : t('browser.disconnected')}
      </span>

      {targets.length > 1 && (
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
      )}

      {native && onNavigate ? (
        <form
          className="browser-toolbar-url-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.trim()) onNavigate(draft.trim())
          }}
        >
          <input
            aria-label={t('browser.url')}
            className="browser-toolbar-url-input"
            value={draft}
            // Navegar se lleva por delante el DOM que el agente está usando.
            // main lo rechaza igualmente —la autoridad no está aquí—, pero
            // ofrecer algo que va a fallar es peor que no ofrecerlo.
            disabled={!userHasControl}
            title={!userHasControl ? t('browser.needsControl') : undefined}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
          />
        </form>
      ) : (
        <span className="browser-toolbar-url" title={url || undefined}>
          {url || t('browser.waiting')}
        </span>
      )}

      {native && (
        <span className="browser-toolbar-control" data-control={control}>
          {uncertain
            ? t('browser.controlUncertain')
            : userHasControl
              ? t('browser.controlUser')
              : t('browser.controlAgent')}
        </span>
      )}

      {native && onTakeControl && onReturnControl && (
        <button
          type="button"
          className="browser-toolbar-action"
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

      {/* Abrir fuera es **otra** ventana y otro contexto, no tomar el control
          de esta página: el §7 pide que siga rotulado como acción secundaria. */}
      {url && /^https?:\/\//i.test(url) && (
        <button
          type="button"
          className="browser-toolbar-action"
          onClick={() =>
            void platform()
              .opener.openUrl(url)
              .catch((reason) => setOpenError(String(reason)))
          }
        >
          {t('browser.openExternal')}
        </button>
      )}
      {openError && (
        <span role="alert" className="text-xs text-amber-400">
          {openError}
        </span>
      )}
    </header>
  )
}
