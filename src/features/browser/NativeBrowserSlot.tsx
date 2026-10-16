import { useEffect, useRef, type ReactNode } from 'react'

import { useI18n } from '../../i18n'
import type { NativeBrowserContext } from '../../platform/contract'

export interface NativeBrowserSlotProps {
  context: NativeBrowserContext
  slotRef: (element: HTMLElement | null) => void
  onPrepare: () => void
  /** La página de inicio (#46): con ella la vista nativa no se presenta. */
  home?: ReactNode
  /**
   * Ancho fijo de la página (#44b), o `null` para ajustarla al panel. Con un
   * ancho fijo el hueco mide eso y su contenedor se desplaza en horizontal:
   * main coloca la página desplazada sin cambiar su viewport, como con el
   * scroll de Boards (`logicalBounds` frente a `visibleBounds`).
   */
  pageWidth?: number | null
  /** Alto del hueco, para enseñar «1280 × 800». */
  onHeight?: (height: number) => void
}

/**
 * El hueco que ocupa la vista nativa (documento 03 §8.1).
 *
 * Este div **no dibuja la página**: reserva su rectángulo y reporta dónde
 * está. La superficie la coloca main, porque `setBounds` de una vista nativa
 * no se controla con CSS [E3, E6].
 *
 * Lo que sí dibuja es lo que pasa cuando todavía no hay página: un contexto
 * que se está creando, uno desconectado, o uno que aún no existe. Enseñar un
 * hueco vacío sin explicación haría pensar que el browser está roto.
 *
 * Con la página lista no dibuja nada: se ve en vivo mande quien mande (plan
 * 0.4.0 #46), ya no una captura cada segundo mientras trabaja Rinari.
 */
export default function NativeBrowserSlot({ context, slotRef, onPrepare, home, pageWidth, onHeight }: NativeBrowserSlotProps) {
  const { t } = useI18n()
  const state = context.context_state
  const node = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = node.current
    if (!element || !onHeight || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => onHeight(Math.round(element.getBoundingClientRect().height)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [onHeight])

  const slot = (
    <div
      ref={(element) => {
        node.current = element
        slotRef(element)
      }}
      style={pageWidth ? { width: pageWidth, minWidth: pageWidth, flex: '0 0 auto' } : undefined}
      data-page-width={pageWidth ?? undefined}
      className="browser-view-slot"
      data-testid="browser-view-slot"
      data-mode="native"
      data-state={state}
      data-home={home ? true : undefined}
    >
      {home ? home : state === 'ready' ? null : state === 'creating' ? (
        <p className="p-4 text-xs text-[var(--text-muted)]">{t('browser.nativePreparing')}</p>
      ) : state === 'disconnected' || state === 'disposed' ? (
        <p className="p-4 text-xs text-[var(--text-muted)]">{t('browser.nativeDisconnected')}</p>
      ) : (
        <div className="flex flex-col items-start gap-2 p-4">
          <p className="text-xs text-[var(--text-muted)]">{t('browser.nativeIdle')}</p>
          {/* Crear el contexto es una acción explícita: consultar el estado no
              puede abrir un navegador (§6.2). */}
          <button type="button" className="browser-toolbar-action" onClick={onPrepare}>
            {t('browser.openNative')}
          </button>
        </div>
      )}
    </div>
  )

  if (!pageWidth) return slot
  return (
    <div className="browser-view-scroll" data-testid="browser-view-scroll" style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      {slot}
    </div>
  )
}
