import { useEffect, useState, type ReactNode } from 'react'
import { Maximize2, Monitor, Smartphone, Tablet, Tv } from 'lucide-react'

import { useI18n } from '../../i18n'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'
import type { NativeBrowserContext, NativeBrowserTarget } from '../../platform/contract'
import { CHAT_KEY, rememberable, useBrowserPrefs } from '../../stores/browserPrefs'

import BrowserHome from './BrowserHome'
import { PAGE_WIDTHS, usePageSizeStore } from './pageSize'
import { Select } from '../../components/ui/select'

/** Un icono de dispositivo para cada ancho de página (#99.3). */
const PAGE_WIDTH_ICONS: Record<(typeof PAGE_WIDTHS)[number], ReactNode> = {
  390: <Smartphone size={14} />,
  768: <Tablet size={14} />,
  1280: <Monitor size={14} />,
  1920: <Tv size={14} />,
}
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
  /** Hay un turno en curso en la sesión: Rinari puede estar usando la página. */
  busy?: boolean
  /** Proyecto de la conversación: los recientes y fijados de la página de inicio son suyos. */
  projectId?: string | null
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
/**
 * ¿Se ve la página de inicio? Sin navegador todavía, mientras se prepara, o
 * con la pestaña activa en blanco (plan 0.4.0 #46).
 */
export function showsHome(context: NativeBrowserContext | null): boolean {
  if (!context || context.context_state === 'absent' || context.context_state === 'creating') return true
  if (context.context_state !== 'ready') return false
  const active = (context.targets ?? []).find((page) => page.active)
  return !active || !active.url || active.url === 'about:blank'
}

export default function BrowserSurface({
  sessionId,
  frame,
  error,
  targetId,
  onTargetChange,
  shown = true,
  overlayDepth = 0,
  busy,
  projectId,
}: BrowserSurfaceProps) {
  const { t } = useI18n()
  // A loose chat keeps its own recents: they were shared by every chat and
  // showed pages the owner never opened in this one (#99.2).
  const projectKey = projectId || `${CHAT_KEY}:${sessionId}`
  const recordVisit = useBrowserPrefs((state) => state.recordVisit)
  const togglePin = useBrowserPrefs((state) => state.togglePin)
  const pinnedUrls = useBrowserPrefs((state) => state.pinned[projectKey])
  // La página de inicio (#46) se ve en lugar de «Preparando…» y de una
  // página en blanco: mientras está, la vista nativa no se presenta.
  const native = useNativeBrowser(sessionId, {
    shown,
    overlayDepth,
    presentWhen: (view) => !showsHome(view),
  })
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
  const home = useNative && showsHome(context)

  // Tamaño de la página (#44b). Lo que pida el agente manda: el selector lo
  // enseña; el dueño puede cambiarlo después.
  const chosenWidth = usePageSizeStore((state) => state.bySession[sessionId])
  const setPageWidth = usePageSizeStore((state) => state.set)
  const agentWidth = context?.viewport_width
  useEffect(() => {
    if (agentWidth !== undefined) setPageWidth(sessionId, agentWidth ?? null)
  }, [agentWidth, sessionId, setPageWidth])
  const pageWidth = useNative && !home ? (chosenWidth ?? null) : null
  const [slotHeight, setSlotHeight] = useState(0)
  const sizeControl = useNative ? (
    <label className="browser-size" title={t('browser.size.label')}>
      <Select
        compact
        label={t('browser.size.label')}
        testId="browser-size"
        value={chosenWidth ? String(chosenWidth) : 'fit'}
        onChange={(value) => setPageWidth(sessionId, value === 'fit' ? null : Number(value))}
        options={[
          { value: 'fit', label: t('browser.size.fit'), icon: <Maximize2 size={14} /> },
          ...PAGE_WIDTHS.map((width) => ({ value: String(width), label: t(`browser.size.${width}` as const), icon: PAGE_WIDTH_ICONS[width] })),
        ]}
      />
      {pageWidth && slotHeight > 0 && <span className="browser-size-value" data-testid="browser-size-value">{pageWidth} × {slotHeight}</span>}
    </label>
  ) : undefined
  const activeTitle = useNative ? (nativeTargets.find((page) => page.active)?.title ?? '') : ''

  // Lo que se abre queda en «Recientes» del proyecto.
  useEffect(() => {
    if (useNative && rememberable(url)) recordVisit(projectKey, { url, title: activeTitle })
  }, [useNative, url, activeTitle, projectKey, recordVisit])

  /** Abrir desde la página de inicio: prepara el navegador si aún no existe. */
  const openFromHome = async (next: string) => {
    if (!context || context.context_state === 'absent') await native.prepare()
    await native.navigate(next)
  }

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
        state={useNative ? context?.context_state : frame?.state}
        onSelectTarget={useNative ? (id) => void native.selectTarget(id) : onTargetChange}
        onNavigate={useNative ? (next) => void native.navigate(next) : undefined}
        onHistory={useNative ? (action) => void native.history(action) : undefined}
        busy={busy}
        pinned={Boolean(url && (pinnedUrls ?? []).some((place) => place.url === url))}
        onTogglePin={useNative && rememberable(url) ? () => togglePin(projectKey, { url, title: activeTitle }) : undefined}
        sizeControl={sizeControl}
        home={home}
      />

      {problem && <p role="alert" className="browser-problem">{browserProblemText(problem, t)}</p>}

      {useNative && context ? (
        <NativeBrowserSlot
          context={context}
          slotRef={native.slotRef}
          onPrepare={() => void native.prepare()}
          pageWidth={pageWidth}
          onHeight={setSlotHeight}
          home={home ? (
            <BrowserHome
              sessionId={sessionId}
              projectKey={projectKey}
              scope={projectId ? 'project' : 'chat'}
              busy={busy}
              onOpen={(next) => void openFromHome(next)}
            />
          ) : undefined}
        />
      ) : (
        <ScreenshotBrowserFallback frame={frame} connected={Boolean(connected)} />
      )}

      {/* La vista con capturas avisa de que no se puede usar aquí; el navegador nativo no necesita nota. */}
      {!useNative && <footer className="browser-footer">{t('browser.fallbackNote')}</footer>}
    </section>
  )
}

/** What the host says when it cannot do something, in the owner's language (#99.2). */
export function browserProblemText(message: string, t: ReturnType<typeof useI18n>['t']): string {
  if (/no browser context/i.test(message)) return t('browser.problem.absent')
  if (/has to wait: Rinari is finishing a step/i.test(message)) return t('browser.problem.busy')
  if (/will not navigate to/i.test(message)) return t('browser.problem.blocked')
  if (/the window is not ready|browser host is not ready/i.test(message)) return t('browser.problem.notReady')
  return message
}
