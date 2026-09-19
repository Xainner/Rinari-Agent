import { useI18n } from '../../i18n'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'

export interface ScreenshotBrowserFallbackProps {
  frame: BrowserFrame | null
  connected: boolean
}

/**
 * Visor de capturas (documento 03 §10).
 *
 * Es el contrato de compatibilidad: un Engine antiguo, un contexto externo
 * real, o un host sin browser nativo. Se rotula como lo que es —«vista de
 * capturas, sólo lectura»— y no se presenta como tiempo real, porque no lo es.
 *
 * La imagen conserva su proporción y no se estira: deformarla para llenar el
 * panel sugeriría que el viewport cambió, que es justo lo que no ocurre aquí.
 */
export default function ScreenshotBrowserFallback({
  frame,
  connected,
}: ScreenshotBrowserFallbackProps) {
  const { t } = useI18n()
  const image = frame?.image?.startsWith('data:image/jpeg;base64,') ? frame.image : null

  return (
    <div className="browser-view-slot" data-testid="browser-view-slot" data-mode="fallback">
      {image ? (
        <img src={image} alt={t('browser.frameAlt')} className="w-full" />
      ) : (
        <p className="p-4 text-xs text-[var(--text-muted)]">
          {connected ? t('browser.noFrame') : t('browser.idleHint')}
        </p>
      )}
    </div>
  )
}
