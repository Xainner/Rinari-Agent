import { useI18n } from '../../i18n'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'
import type { NativeBrowserTarget } from '../../platform/contract'

import BrowserToolbar from './BrowserToolbar'
import NativeBrowserSlot from './NativeBrowserSlot'
import ScreenshotBrowserFallback from './ScreenshotBrowserFallback'
import { useNativeBrowser } from './useNativeBrowser'

export interface BrowserSurfaceProps {
  sessionId: string
  frame: BrowserFrame | null
  error: string
  targetId: string
  onTargetChange: (targetId: string) => void
  /** La superficie está a la vista. Oculta, no se presenta nada. */
  shown?: boolean
  /** Overlays de Rinari encima ahora mismo (§8.3). */
  overlayDepth?: number
}

/**
 * Superficie **Navegador** del dock de una sesión.
 *
 * Elige entre dos presentaciones según lo que el host pueda hacer de verdad:
 *
 * - **Nativa**: la `WebContentsView` que controla el Engine ocupa el hueco. Es
 *   la misma página, no una copia de su URL.
 * - **Capturas**: el visor de compatibilidad del §10, para un Engine antiguo,
 *   un contexto externo o un host sin browser nativo.
 *
 * La decisión se toma con el estado efectivo, no con la capability: soporte,
 * binding y contexto listo son tres cosas distintas, y anunciar «nativo» antes
 * de tiempo enseña un hueco que nunca se llena (§5.2).
 *
 * Ocultar la superficie no cierra nada: retira la presentación y ya.
 */
export default function BrowserSurface({
  sessionId,
  frame,
  error,
  targetId,
  onTargetChange,
  shown = true,
  overlayDepth = 0,
}: BrowserSurfaceProps) {
  const { t } = useI18n()
  const native = useNativeBrowser(sessionId, { shown, overlayDepth })
  const context = native.context

  const useNative = Boolean(context?.supported && context.backend === 'electron-native')
  const connected = useNative
    ? context?.context_state === 'ready'
    : frame?.state === 'connected'

  const nativeTargets = context?.targets ?? []
  const fallbackTargets: NativeBrowserTarget[] = (frame?.pages ?? []).map((page) => ({
    target_id: page.target_id,
    url: page.url,
    title: page.title,
    active: page.target_id === (frame?.target_id ?? targetId),
  }))
  const targets = useNative ? nativeTargets : fallbackTargets
  const activeTargetId = useNative
    ? (context?.active_target_id ?? '')
    : (frame?.target_id ?? targetId)
  const url = useNative
    ? (nativeTargets.find((page) => page.active)?.url ?? '')
    : (frame?.url ?? '')

  const problem = error || native.error

  return (
    <section
      aria-label={t('browser.label')}
      data-testid="browser-surface"
      data-state={useNative ? (context?.context_state ?? 'idle') : (frame?.state ?? 'idle')}
      data-backend={useNative ? 'electron-native' : 'screenshot'}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <BrowserToolbar
        context={useNative ? context : null}
        targets={targets}
        activeTargetId={activeTargetId}
        url={url}
        connected={Boolean(connected)}
        onSelectTarget={useNative ? (id) => void native.selectTarget(id) : onTargetChange}
        onNavigate={useNative ? (next) => void native.navigate(next) : undefined}
        onTakeControl={useNative ? () => void native.takeControl() : undefined}
        onReturnControl={useNative ? () => void native.returnControl() : undefined}
      />

      {problem && <p role="alert" className="px-3 py-2 text-xs text-amber-400">{problem}</p>}

      {useNative && context ? (
        <NativeBrowserSlot
          context={context}
          slotRef={native.slotRef}
          onPrepare={() => void native.prepare()}
        />
      ) : (
        <ScreenshotBrowserFallback frame={frame} connected={Boolean(connected)} />
      )}

      <footer className="browser-footer">
        {useNative ? t('browser.nativeNote') : t('browser.fallbackNote')}
      </footer>
    </section>
  )
}
