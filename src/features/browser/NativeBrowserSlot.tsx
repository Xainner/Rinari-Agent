import { useI18n } from '../../i18n'
import type { NativeBrowserContext } from '../../platform/contract'

export interface NativeBrowserSlotProps {
  context: NativeBrowserContext
  slotRef: (element: HTMLElement | null) => void
  onPrepare: () => void
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
 */
export default function NativeBrowserSlot({ context, slotRef, onPrepare }: NativeBrowserSlotProps) {
  const { t } = useI18n()
  const state = context.context_state

  return (
    <div
      ref={slotRef}
      className="browser-view-slot"
      data-testid="browser-view-slot"
      data-mode="native"
      data-state={state}
    >
      {state === 'ready' ? null : state === 'creating' ? (
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
}
