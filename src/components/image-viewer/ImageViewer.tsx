import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FolderOpen, LoaderCircle, Maximize, Minus, PanelRightOpen, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import { commandMessage } from '../../services/engine'
import { useCalmMotion } from '../../lib/motion'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

/** Una imagen del visor: lista para pintar (`src`) o por cargar (`load`). */
export interface ViewerImage {
  key: string
  name: string
  src?: string
  load?: () => Promise<string>
  /** «900 × 500», la ruta… */
  detail?: string
  /** Texto reconocido (OCR): pestaña propia junto a la imagen. */
  recognized?: ReactNode
  /** «Abrir en Archivos». */
  onOpenInFiles?: () => void
  /** «Mostrar en el explorador». */
  onReveal?: () => void
  /** «Abrir fuera». */
  onOpenExternal?: () => void
  /**
   * El archivo de la imagen (`artifact://` o ruta del workspace): con él,
   * «Copiar» y «Descargar» la piden entera al host, que la resuelve con el Engine.
   */
  file?: { session_id: string; path: string; turn_id?: string }
}

const MIN_SCALE = 0.05
const MAX_SCALE = 8
const PAN_STEP = 80

type Size = { width: number; height: number }

/**
 * El visor de imágenes de Rinari (plan 0.4.0 #77): uno solo para el composer,
 * los mensajes, las imágenes que ve Rinari y Archivos. Casi toda la ventana;
 * zoom con la rueda, doble clic o Ajustar/100 %; arrastrar para moverse;
 * flechas y ← → entre las imágenes del mismo mensaje con «2 de 4»; abrir en
 * Archivos, en el explorador o fuera; y, con OCR, la pestaña «Texto
 * reconocido». Entra desde la miniatura y sale con el diálogo (sin
 * animación con movimiento reducido). Esc cierra.
 */
export default function ImageViewer({
  open,
  images,
  index,
  onIndexChange,
  onClose,
  origin,
  onCloseFocus,
}: {
  open: boolean
  images: ViewerImage[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /** De dónde sale (la miniatura pulsada), para entrar desde ahí. */
  origin?: DOMRect | null
  /** A dónde vuelve el foco al cerrar. */
  onCloseFocus?: () => void
}) {
  const { t } = useI18n()
  const calm = useCalmMotion()
  const image = images[Math.min(index, images.length - 1)]
  const [src, setSrc] = useState<string | null>(image?.src ?? null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState<'image' | 'text'>('image')
  const [natural, setNatural] = useState<Size | null>(null)
  const [stage, setStage] = useState<Size | null>(null)
  const [scale, setScale] = useState<number | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const entered = useRef(false)
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  // Cada imagen: la propia o cargada, y la vista ajustada de nuevo.
  useEffect(() => {
    if (!open || !image) return
    setScale(null)
    setPan({ x: 0, y: 0 })
    setNatural(null)
    setError('')
    setTab('image')
    if (image.src) { setSrc(image.src); return }
    setSrc(null)
    if (!image.load) return
    let alive = true
    image.load().then((url) => { if (alive) setSrc(url) }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { alive = false }
  }, [open, image, retry])

  useLayoutEffect(() => {
    const element = stageRef.current
    if (!open || !element) return
    const measure = () => setStage({ width: element.clientWidth, height: element.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open, tab])

  // Sin escenario medido todavía, se ajusta al 100 %.
  const fit = natural && stage && stage.width > 48 && stage.height > 48 ? Math.min(1, (stage.width - 48) / natural.width, (stage.height - 48) / natural.height) : 1
  const effective = scale ?? fit
  const zoomed = effective > fit + 0.001

  /** Mantiene la imagen a la vista: no se puede arrastrar más allá de sus bordes. */
  const clampPan = useCallback((next: { x: number; y: number }, at: number) => {
    if (!natural || !stage) return next
    const limitX = Math.max(0, (natural.width * at - stage.width) / 2 + 24)
    const limitY = Math.max(0, (natural.height * at - stage.height) / 2 + 24)
    return { x: Math.max(-limitX, Math.min(limitX, next.x)), y: Math.max(-limitY, Math.min(limitY, next.y)) }
  }, [natural, stage])

  /** Zoom alrededor de un punto del escenario (relativo a su centro). */
  const zoomTo = useCallback((next: number, around = { x: 0, y: 0 }) => {
    const target = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next))
    if (Math.abs(target - fit) < 0.001) { setScale(null); setPan({ x: 0, y: 0 }); return }
    const ratio = target / effective
    setScale(target)
    setPan((current) => clampPan({ x: around.x - (around.x - current.x) * ratio, y: around.y - (around.y - current.y) * ratio }, target))
  }, [clampPan, effective, fit])

  // La rueda acerca y aleja (y nunca mueve la conversación de detrás).
  useEffect(() => {
    const element = stageRef.current
    if (!open || !element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      zoomTo(effective * Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [open, effective, zoomTo, tab])

  // Entra desde la miniatura: la imagen viaja de su rectángulo al centro.
  useLayoutEffect(() => {
    const element = imgRef.current
    const frame = frameRef.current
    if (!open || calm || entered.current || !origin || !natural || !stage || !element || !frame || typeof frame.animate !== 'function') return
    entered.current = true
    const final = element.getBoundingClientRect()
    if (!final.width || !final.height) return
    const dx = origin.left + origin.width / 2 - (final.left + final.width / 2)
    const dy = origin.top + origin.height / 2 - (final.top + final.height / 2)
    const s = Math.max(0.05, Math.min(origin.width / final.width, origin.height / final.height))
    // El marco no tiene transformación propia y su centro es el de la imagen ajustada.
    frame.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.4 },
      { transform: 'none', opacity: 1 },
    ], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  }, [open, calm, origin, natural, stage])
  useEffect(() => { if (!open) entered.current = false }, [open])

  // «Copiar» confirma en el propio botón; un error o «Descargar» van al aviso.
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(null), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])
  const copyImage = async (target: ViewerImage) => {
    if (!target.file) return
    try {
      await platform().images.copy(target.file)
      setCopied(target.key)
    } catch (error) {
      toast.error((error as { code?: string } | null)?.code === 'UNSUPPORTED_IMAGE' ? t('viewer.copyUnsupported') : commandMessage(error))
    }
  }
  const saveImage = async (target: ViewerImage) => {
    if (!target.file) return
    try {
      if ((await platform().images.save(target.file)).saved) toast.success(t('viewer.saved', { name: target.name }))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  const go = useCallback((step: number) => {
    if (images.length < 2) return
    onIndexChange((index + step + images.length) % images.length)
  }, [images.length, index, onIndexChange])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (tab !== 'image') return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      if (zoomed) setPan((current) => clampPan({ ...current, x: current.x + (event.key === 'ArrowLeft' ? PAN_STEP : -PAN_STEP) }, effective))
      else go(event.key === 'ArrowLeft' ? -1 : 1)
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && zoomed) {
      event.preventDefault()
      setPan((current) => clampPan({ ...current, y: current.y + (event.key === 'ArrowUp' ? PAN_STEP : -PAN_STEP) }, effective))
    } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(effective * 1.25) }
    else if (event.key === '-') { event.preventDefault(); zoomTo(effective / 1.25) }
    else if (event.key === '0') { event.preventDefault(); zoomTo(fit) }
  }

  if (!image) return null
  const percent = Math.round(effective * 100)
  const many = images.length > 1

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        aria-label={t('attach.previewOf', { name: image.name })}
        aria-describedby={undefined}
        className="image-viewer"
        data-testid="image-viewer"
        onKeyDown={onKeyDown}
        onCloseAutoFocus={onCloseFocus ? (event) => { event.preventDefault(); onCloseFocus() } : undefined}
      >
        <div className="image-viewer-bar">
          <div className="min-w-0 flex-1">
            <DialogTitle className="image-viewer-title">{image.name}</DialogTitle>
            <DialogDescription className="image-viewer-detail">
              {[many ? t('viewer.position', { n: index + 1, total: images.length }) : null, image.detail].filter(Boolean).join(' · ') || ' '}
            </DialogDescription>
          </div>
          {image.recognized && (
            <div role="tablist" aria-label={image.name} className="seg-tabs">
              {(['image', 'text'] as const).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} className="seg-tab" onClick={() => setTab(value)}>
                  {tab === value && <span className="seg-tab-pill" aria-hidden="true" />}
                  <span className="relative">{t(value === 'image' ? 'viewer.image' : 'viewer.text')}</span>
                </button>
              ))}
            </div>
          )}
          {tab === 'image' && (
            <div className="image-viewer-zoom" role="group" aria-label={t('viewer.zoom')}>
              <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('viewer.zoomOut')} title={t('viewer.zoomOut')} onClick={() => zoomTo(effective / 1.25)}><Minus size={13} aria-hidden="true" /></button>
              <span className="image-viewer-percent" aria-live="polite">{percent} %</span>
              <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('viewer.zoomIn')} title={t('viewer.zoomIn')} onClick={() => zoomTo(effective * 1.25)}><Plus size={13} aria-hidden="true" /></button>
              <button type="button" className="btn btn-quiet btn-xs" aria-pressed={scale === null} onClick={() => zoomTo(fit)}><Maximize size={12} aria-hidden="true" /> {t('viewer.fit')}</button>
              <button type="button" className="btn btn-quiet btn-xs" aria-pressed={Math.abs(effective - 1) < 0.001} onClick={() => zoomTo(1)}>100 %</button>
            </div>
          )}
          <div className="image-viewer-actions">
            {image.file && <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={copied === image.key ? t('viewer.copied') : t('viewer.copy')} title={t('viewer.copy')} data-state={copied === image.key ? 'done' : undefined} onClick={() => void copyImage(image)}>{copied === image.key ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</button>}
            {image.file && <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={t('viewer.download')} title={t('viewer.download')} onClick={() => void saveImage(image)}><Download size={14} aria-hidden="true" /></button>}
            {image.onOpenInFiles && <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={t('viewer.openInFiles')} title={t('viewer.openInFiles')} onClick={() => { image.onOpenInFiles?.(); onClose() }}><PanelRightOpen size={14} aria-hidden="true" /></button>}
            {image.onReveal && <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={t('files.revealInFolder')} title={t('files.revealInFolder')} onClick={image.onReveal}><FolderOpen size={14} aria-hidden="true" /></button>}
            {image.onOpenExternal && <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={t('files.openExternally')} title={t('files.openExternally')} onClick={image.onOpenExternal}><ExternalLink size={14} aria-hidden="true" /></button>}
          </div>
        </div>

        {tab === 'text' && image.recognized ? (
          <div className="image-viewer-text">{image.recognized}</div>
        ) : (
          <div
            ref={stageRef}
            className="image-viewer-stage"
            data-zoomed={zoomed || undefined}
            data-dragging={drag.current ? true : undefined}
            onDoubleClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              const around = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
              if (zoomed) zoomTo(fit)
              else zoomTo(Math.max(1, fit * 2), around)
            }}
            onPointerDown={(event) => {
              if (!zoomed || event.button !== 0) return
              event.currentTarget.setPointerCapture?.(event.pointerId)
              drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
            }}
            onPointerMove={(event) => {
              const start = drag.current
              if (!start) return
              setPan(clampPan({ x: start.panX + event.clientX - start.x, y: start.panY + event.clientY - start.y }, effective))
            }}
            onPointerUp={() => { drag.current = null }}
            onPointerCancel={() => { drag.current = null }}
          >
            {src && (
              <div ref={frameRef} className="image-viewer-frame">
              <img
                ref={imgRef}
                src={src}
                alt={image.name}
                draggable={false}
                className="image-viewer-img"
                style={natural ? { width: natural.width, height: natural.height, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${effective})` } : undefined}
                onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                data-ready={natural ? true : undefined}
              />
              </div>
            )}
            {!src && !error && <span className="image-viewer-loading" role="status"><LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> {t('viewer.loading')}</span>}
            {error && (
              <div role="alert" className="image-viewer-error">
                {error}
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setRetry((value) => value + 1)}><RotateCcw size={12} aria-hidden="true" /> {t('viewer.retry')}</button>
              </div>
            )}
            {many && (
              <>
                <button type="button" className="image-viewer-nav is-prev" aria-label={t('viewer.previous')} title={t('viewer.previous')} onClick={() => go(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
                <button type="button" className="image-viewer-nav is-next" aria-label={t('viewer.next')} title={t('viewer.next')} onClick={() => go(1)}><ChevronRight size={20} aria-hidden="true" /></button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Estado de un visor en su sitio: qué imágenes, cuál y desde dónde se abrió. */
export function useImageViewer() {
  const [state, setState] = useState<{ open: boolean; images: ViewerImage[]; index: number; origin: DOMRect | null; opener: HTMLElement | null }>({ open: false, images: [], index: 0, origin: null, opener: null })
  const show = useCallback((images: ViewerImage[], index: number, from?: Element | null) => {
    const opener = from instanceof HTMLElement ? from : document.activeElement instanceof HTMLElement ? document.activeElement : null
    const thumb = from?.querySelector('img') ?? from ?? null
    setState({ open: true, images, index, origin: thumb ? thumb.getBoundingClientRect() : null, opener })
  }, [])
  const props = {
    open: state.open,
    images: state.images,
    index: state.index,
    origin: state.origin,
    onIndexChange: (index: number) => setState((current) => ({ ...current, index })),
    onClose: () => setState((current) => ({ ...current, open: false })),
    onCloseFocus: () => { if (state.opener?.isConnected) state.opener.focus({ preventScroll: true }) },
  }
  return { show, props }
}
