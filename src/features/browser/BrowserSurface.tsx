import { useState } from 'react'
import { Globe } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'

import { platform } from '../../platform'
export interface BrowserSurfaceProps {
  frame: BrowserFrame | null
  error: string
  targetId: string
  onTargetChange: (targetId: string) => void
}

/**
 * Superficie **Navegador** del dock de una sesión: toolbar (estado, pestaña
 * del Engine, URL) y un slot para la vista. Hoy el slot muestra el fallback
 * de capturas JPEG que devuelve `browser.view.get`; el browser nativo
 * (documento 03) ocupará el mismo slot con el target que controla el Engine.
 * Ocultar la superficie nunca cierra el recurso del Engine.
 */
export default function BrowserSurface({ frame, error, targetId, onTargetChange }: BrowserSurfaceProps) {
  const { t } = useI18n()
  const [openError, setOpenError] = useState('')
  const connected = frame?.state === 'connected'
  const image = frame?.image?.startsWith('data:image/jpeg;base64,') ? frame.image : null
  return (
    <section aria-label={t('browser.label')} data-testid="browser-surface" data-state={frame?.state ?? 'idle'} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="browser-toolbar">
        <Globe size={14} aria-hidden="true" />
        <span role="status" className="browser-toolbar-state" data-connected={connected || undefined}>
          {connected ? t('browser.live') : t('browser.disconnected')}
        </span>
        {(frame?.pages?.length ?? 0) > 1 && (
          <select
            aria-label={t('browser.tab')}
            className="browser-toolbar-select"
            value={frame?.target_id ?? targetId}
            onChange={(event) => onTargetChange(event.target.value)}
          >
            {frame?.pages?.map((page) => <option key={page.target_id} value={page.target_id}>{page.title || page.url}</option>)}
          </select>
        )}
        <span className="browser-toolbar-url" title={frame?.url ?? undefined}>{frame?.url || t('browser.waiting')}</span>
        {frame?.url && /^https?:\/\//i.test(frame.url) && (
          <button type="button" className="browser-toolbar-action" onClick={() => void platform().opener.openUrl(frame.url!).catch((reason) => setOpenError(String(reason)))}>
            {t('browser.openExternal')}
          </button>
        )}
      </header>
      {(error || openError) && <p role="alert" className="px-3 py-2 text-xs text-amber-400">{error || openError}</p>}
      <div className="browser-view-slot" data-testid="browser-view-slot" data-mode="fallback">
        {image ? (
          <img src={image} alt={t('browser.frameAlt')} className="w-full" />
        ) : (
          <p className="p-4 text-xs text-[var(--text-muted)]">{connected ? t('browser.noFrame') : t('browser.idleHint')}</p>
        )}
      </div>
      <footer className="browser-footer">{t('browser.fallbackNote')}</footer>
    </section>
  )
}
