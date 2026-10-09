import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Image as ImageIcon, LoaderCircle, RotateCcw } from 'lucide-react'
import { engineApi, commandMessage } from '../../services/engine'
import { translate, useI18n } from '../../i18n'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog'
import type { ToolPresentation } from './types'

type ActivityImage = NonNullable<ToolPresentation['image']>
const ImageInspection = createContext<((image: ActivityImage) => void) | null>(null)

/** Keep the viewer outside virtualized activity so folding cannot dismiss an open image. */
export function ActivityImageProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ActivityImage | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const turn = useRef<HTMLElement | null>(null)
  const inspect = useCallback((image: ActivityImage) => {
    opener.current = document.activeElement as HTMLElement
    turn.current = opener.current?.closest('[data-activity-turn]') ?? null
    setSelected(image)
  }, [])
  return <ImageInspection.Provider value={inspect}>
    {children}
    {selected && <ImageActivity key={selected.uri} image={selected} dialogOnly onClose={() => setSelected(null)} restoreFocus={() => {
      const target = opener.current?.isConnected ? opener.current : turn.current?.querySelector<HTMLElement>('[data-activity-disclosure="turn"] button')
      target?.focus({ preventScroll: true })
    }} />}
  </ImageInspection.Provider>
}

export function ImageActivity({ image, dialogOnly = false, onClose, restoreFocus }: { image: ActivityImage; dialogOnly?: boolean; onClose?: () => void; restoreFocus?: () => void }) {
  const { lang } = useI18n()
  const inspect = useContext(ImageInspection)
  const [open, setOpen] = useState(dialogOnly)
  const [thumbnail, setThumbnail] = useState<string>()
  const [large, setLarge] = useState<string>()
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if ((open && large) || (!open && thumbnail)) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError('')
    void engineApi.attachmentPreview(image.uri, 512 * 1024, open ? 2048 : 512).then(result => {
      if (cancelled) return
      if (typeof result.data_url !== 'string' || !result.data_url.startsWith('data:image/jpeg;base64,')) throw new Error(translate(lang, 'activity.invalidImagePreview'))
      if (open) setLarge(result.data_url)
      else setThumbnail(result.data_url)
    }).catch(reason => { if (!cancelled) setError(commandMessage(reason)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [image.uri, open, retry, large, thumbnail])
  return <>
    {!dialogOnly && <button type="button" onClick={() => inspect ? inspect(image) : setOpen(true)} title={image.path}
      aria-label={`${lang === 'es' ? 'Ampliar imagen' : 'Enlarge image'}: ${image.name}`}
      className="my-1.5 flex max-w-sm items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2 text-left hover:bg-[var(--bg-hover)]">
      {thumbnail ? <img src={thumbnail} alt="" className="size-16 rounded-lg object-contain" /> : <ImageIcon size={24} className="m-5 shrink-0" />}
      <span className="min-w-0"><span className="block truncate text-xs text-[var(--text)]">{image.name}</span><span className="text-[11px] text-[var(--text-subtle)]">{image.width} × {image.height}</span></span>
      {loading && <LoaderCircle size={14} className="animate-spin" />}
    </button>}
    {error && !open && <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>}
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) onClose?.() }}>
      <DialogContent className="max-w-6xl" onCloseAutoFocus={restoreFocus ? event => { event.preventDefault(); restoreFocus() } : undefined}>
        <DialogTitle className="break-all pr-8">{image.name}</DialogTitle>
        <DialogDescription className="break-all">{image.path} · {image.width} × {image.height}</DialogDescription>
        {loading && <LoaderCircle aria-label={lang === 'es' ? 'Cargando imagen' : 'Loading image'} className="animate-spin" />}
        {(large || thumbnail) && <img src={large || thumbnail} alt={image.name} className="mx-auto max-h-[65vh] max-w-full object-contain" />}
        {error && <div role="alert" className="text-sm text-[var(--danger)]">{error}<button type="button" onClick={() => setRetry(n => n + 1)} className="ml-3 inline-flex items-center gap-1"><RotateCcw size={14} />{lang === 'es' ? 'Reintentar' : 'Retry'}</button></div>}
      </DialogContent>
    </Dialog>
  </>
}
