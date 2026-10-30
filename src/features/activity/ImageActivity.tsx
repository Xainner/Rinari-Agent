import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Image as ImageIcon, RotateCcw } from 'lucide-react'
import { engineApi, commandMessage } from '../../services/engine'
import { translate, useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import ImageViewer, { useImageViewer, type ViewerImage } from '../../components/image-viewer/ImageViewer'
import { useFileWorkspace, type FileWorkspaceController } from '../files/FileWorkspace'
import type { ToolPresentation } from './types'

type ActivityImage = NonNullable<ToolPresentation['image']>

/** Abre el visor compartido con unas imágenes, desde la miniatura pulsada. */
type ShowImages = (images: ViewerImage[], index: number, from: Element | null) => void
const ImageInspection = createContext<ShowImages | null>(null)

/** Lo que el Engine devuelve de una imagen de la actividad, en JPEG. */
async function activityImageUrl(uri: string, maxDimension: number): Promise<string> {
  const result = await engineApi.attachmentPreview(uri, 512 * 1024, maxDimension)
  if (typeof result.data_url !== 'string' || !result.data_url.startsWith('data:image/jpeg;base64,')) throw new Error(translate(useUIStore.getState().lang, 'activity.invalidImagePreview'))
  return result.data_url
}

/** Miniaturas ya pedidas: una lista larga no las vuelve a pedir al plegarse y desplegarse. */
const thumbs = new Map<string, Promise<string>>()
function thumbnail(uri: string): Promise<string> {
  let pending = thumbs.get(uri)
  if (!pending) {
    pending = activityImageUrl(uri, 512)
    pending.catch(() => thumbs.delete(uri))
    thumbs.set(uri, pending)
    if (thumbs.size > 120) thumbs.delete(thumbs.keys().next().value as string)
  }
  return pending
}

function useThumbnail(uri: string, retry = 0) {
  const [state, setState] = useState<{ url?: string; error?: string }>({})
  useEffect(() => {
    let alive = true
    setState({})
    thumbnail(uri).then((url) => { if (alive) setState({ url }) }).catch((reason) => { if (alive) setState({ error: commandMessage(reason) }) })
    return () => { alive = false }
  }, [uri, retry])
  return state
}

function viewerImages(images: ActivityImage[], files: FileWorkspaceController | null): ViewerImage[] {
  return images.map((image) => ({
    key: image.uri,
    name: image.name,
    load: () => activityImageUrl(image.uri, 2048),
    detail: [image.width && image.height ? `${image.width} × ${image.height}` : null, image.path].filter(Boolean).join(' · '),
    onOpenInFiles: files ? () => files.open(image.uri) : undefined,
    file: files ? { session_id: files.sessionId, path: image.uri } : undefined,
    onReveal: files && image.path && !image.path.startsWith('artifact:') ? () => files.reveal(image.path) : undefined,
    onOpenExternal: files && image.path && !image.path.startsWith('artifact:') ? () => files.openExternal(image.path) : undefined,
  }))
}

/**
 * El visor vive fuera de la actividad virtualizada: plegar un turno no cierra
 * una imagen abierta. Es el mismo visor grande del resto de la app (#77).
 */
export function ActivityImageProvider({ children }: { children: ReactNode }) {
  const viewer = useImageViewer()
  const show = useCallback<ShowImages>((images, index, from) => viewer.show(images, index, from), [viewer])
  return <ImageInspection.Provider value={show}>
    {children}
    <ImageViewer {...viewer.props} />
  </ImageInspection.Provider>
}

/**
 * El visor grande para cualquier imagen de la actividad: el compartido del
 * chat si lo hay; si no (una tarjeta fuera del chat), uno propio que hay que
 * pintar (`viewer`).
 */
export function useImageInspector() {
  const shared = useContext(ImageInspection)
  const local = useImageViewer()
  const show = useCallback<ShowImages>((images, index, from) => {
    if (shared) shared(images, index, from)
    else local.show(images, index, from)
  }, [shared, local])
  return { show, viewer: shared ? null : <ImageViewer {...local.props} /> }
}

function useInspect() {
  const files = useFileWorkspace()
  const { show, viewer } = useImageInspector()
  const inspect = useCallback((images: ActivityImage[], index: number, from: Element | null) => show(viewerImages(images, files), index, from), [show, files])
  return { inspect, viewer }
}

/**
 * La miniatura pequeña de una fila cerrada (#15): unos 28 px junto a la
 * etiqueta; pulsarla abre el visor sin desplegar la fila.
 */
export function ImageThumb({ image, group, index = 0 }: { image: ActivityImage; group?: ActivityImage[]; index?: number }) {
  const { t } = useI18n()
  const { inspect, viewer } = useInspect()
  const { url, error } = useThumbnail(image.uri)
  return <>
    <button
      type="button"
      className="act-thumb"
      data-state={url ? 'ready' : error ? 'error' : 'loading'}
      aria-label={t('activity.enlargeImage', { name: image.name })}
      title={image.name}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); inspect(group ?? [image], index, event.currentTarget) }}
    >
      {url ? <img src={url} alt="" draggable={false} /> : <ImageIcon size={12} aria-hidden="true" />}
    </button>
    {viewer}
  </>
}

/**
 * La tarjeta de una imagen dentro de la fila abierta: la miniatura, el nombre
 * y el tamaño; un esqueleto mientras carga y, si falla, el aviso con
 * «Reintentar». Pulsarla abre el visor grande.
 */
export function ImageActivity({ image, group, index = 0 }: { image: ActivityImage; group?: ActivityImage[]; index?: number }) {
  const { t } = useI18n()
  const { inspect, viewer } = useInspect()
  const [retry, setRetry] = useState(0)
  const { url, error } = useThumbnail(image.uri, retry)
  return <>
    <button
      type="button"
      className="img-activity"
      data-state={url ? 'ready' : error ? 'error' : 'loading'}
      title={image.path}
      aria-label={t('activity.enlargeImage', { name: image.name })}
      onClick={(event) => inspect(group ?? [image], index, event.currentTarget)}
    >
      <span className="img-activity-frame">
        {url ? <img src={url} alt="" draggable={false} /> : <ImageIcon size={18} aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="img-activity-name">{image.name}</span>
        {image.width > 0 && <span className="img-activity-size">{image.width} × {image.height}</span>}
      </span>
    </button>
    {error && (
      <p role="alert" className="act-notice img-activity-error" data-tone="warning">
        <span className="min-w-0">{error}</span>
        <button type="button" className="act-notice-action" onClick={() => setRetry((value) => value + 1)}><RotateCcw size={11} aria-hidden="true" /> {t('viewer.retry')}</button>
      </p>
    )}
    {viewer}
  </>
}

/** Solo para pruebas: olvida las miniaturas pedidas. */
export function resetActivityThumbsForTests() {
  thumbs.clear()
}
