import { toast } from 'sonner'

import { platform } from '../platform'
import { useNativeSurfaces, type NativeRect } from '../stores/nativeSurfaces'

const START = 'rinari:browser-vertical-toast-start'
const STOP = 'rinari:browser-vertical-toast-stop'
const SURFACE_ID = 'browser-vertical-toast'
const TOAST_ID = 'browser-vertical-toast'

interface ProbeStart {
  slotId: string
  logicalBounds: NativeRect
  visibleBounds: NativeRect
  layoutRevision: number
}

const rect = (value: unknown): value is NativeRect => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every(
    (key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]),
  )
}

function startOf(value: unknown): ProbeStart | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.slotId !== 'string' ||
    !rect(candidate.logicalBounds) ||
    !rect(candidate.visibleBounds) ||
    typeof candidate.layoutRevision !== 'number'
  ) {
    return null
  }
  return candidate as unknown as ProbeStart
}

/**
 * Adaptador de aceptación habilitado sólo por `RINARI_BROWSER_VERTICAL=1`.
 * Monta un toast Sonner real y publica la oclusión por el mismo store y el
 * mismo puente que usa `useNativeBrowser`; no existe en un arranque normal.
 */
export function registerBrowserVerticalUiProbe(enabled: boolean): () => void {
  if (!enabled) return () => {}
  let unsubscribe: (() => void) | null = null
  let current: ProbeStart | null = null
  let revision = 0
  let stopping = false
  let finishing = false

  const finish = () => {
    unsubscribe?.()
    unsubscribe = null
    current = null
    stopping = false
    finishing = false
    useNativeSurfaces.getState().setSurface(SURFACE_ID, null)
    delete document.documentElement.dataset.rinariVerticalToastOcclusions
    delete document.documentElement.dataset.rinariVerticalToastFirstFrameProtected
  }

  const publish = () => {
    const active = current
    if (!active) return
    const occlusions = useNativeSurfaces.getState().toastOcclusions
    document.documentElement.dataset.rinariVerticalToastOcclusions = JSON.stringify(occlusions)
    if (
      occlusions.some(
        (block) =>
          block.x === active.visibleBounds.x &&
          block.y === active.visibleBounds.y &&
          block.width === active.visibleBounds.width &&
          block.height === active.visibleBounds.height,
      )
    ) {
      document.documentElement.dataset.rinariVerticalToastFirstFrameProtected = 'true'
    }
    revision += 1
    const update = platform().browser.updateSlot({
      slotId: active.slotId,
      logicalBounds: active.logicalBounds,
      visibleBounds: active.visibleBounds,
      shown: true,
      layoutRevision: revision,
      overlayDepth: 0,
      occlusions,
    })
    // Al cerrar, Sonner mantiene el toast durante su animación de salida. La
    // vista nativa sólo recupera su geometría cuando AdaptiveToaster anuncia
    // que la pila real ya desapareció; así tampoco puede tapar el fade-out.
    if (stopping && occlusions.length === 0 && !finishing) {
      finishing = true
      void update.finally(finish)
    }
  }

  const stop = () => {
    toast.dismiss(TOAST_ID)
    if (!current) return finish()
    stopping = true
    if (useNativeSurfaces.getState().toastOcclusions.length === 0) publish()
  }

  const onStart = (event: Event) => {
    const detail = startOf((event as CustomEvent).detail)
    if (!detail) return
    void (async () => {
      stop()
      if (current) finish()
      // El restart previo puede haber mostrado avisos normales de la app. El
      // gate mide una sola pila conocida, así que deja terminar esas salidas
      // antes de crear el toast de aceptación.
      toast.dismiss()
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (useNativeSurfaces.getState().toastOcclusions.length === 0) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      current = detail
      stopping = false
      revision = detail.layoutRevision
      delete document.documentElement.dataset.rinariVerticalToastFirstFrameProtected
      useNativeSurfaces.getState().setSurface(SURFACE_ID, detail.visibleBounds)
      unsubscribe = useNativeSurfaces.subscribe(publish)
      publish()
      toast('Toast real sobre browser nativo\ncon contenido multilínea y acción', {
        id: TOAST_ID,
        testId: TOAST_ID,
        duration: Number.POSITIVE_INFINITY,
        description: 'La pila se mide; la superficie nativa se recorta antes de recibir clicks.',
        action: {
          label: 'Confirmar',
          onClick: () => {
            const root = document.documentElement
            root.dataset.rinariVerticalToastAction = String(
              Number(root.dataset.rinariVerticalToastAction ?? '0') + 1,
            )
          },
        },
      })
    })()
  }
  const onStop = () => stop()
  window.addEventListener(START, onStart)
  window.addEventListener(STOP, onStop)
  return () => {
    stop()
    window.removeEventListener(START, onStart)
    window.removeEventListener(STOP, onStop)
  }
}
