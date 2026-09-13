import { useEffect, useState } from 'react'
import { Image as ImageIcon, LoaderCircle, RotateCcw } from 'lucide-react'
import { engineApi, commandMessage } from '../../services/engine'
import { useI18n } from '../../i18n'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog'
import type { ToolPresentation } from './types'

export function ImageActivity({ image }: { image: NonNullable<ToolPresentation['image']> }) {
  const { lang } = useI18n()
  const [open, setOpen] = useState(false)
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
      if (typeof result.data_url !== 'string' || !result.data_url.startsWith('data:image/jpeg;base64,')) throw new Error('Invalid image preview')
      if (open) setLarge(result.data_url)
      else setThumbnail(result.data_url)
    }).catch(reason => { if (!cancelled) setError(commandMessage(reason)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [image.uri, open, retry, large, thumbnail])
  return <>
    <button type="button" onClick={() => setOpen(true)} title={image.path}
      aria-label={`${lang === 'es' ? 'Ampliar imagen' : 'Enlarge image'}: ${image.name}`}
      className="my-1.5 flex max-w-sm items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2 text-left hover:bg-[var(--bg-hover)]">
      {thumbnail ? <img src={thumbnail} alt="" className="size-16 rounded-lg object-contain" /> : <ImageIcon size={24} className="m-5 shrink-0" />}
      <span className="min-w-0"><span className="block truncate text-xs text-[var(--text)]">{image.name}</span><span className="text-[11px] text-[var(--text-subtle)]">{image.width} × {image.height}</span></span>
      {loading && <LoaderCircle size={14} className="animate-spin" />}
    </button>
    {error && !open && <p role="alert" className="text-xs text-red-400">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-6xl">
        <DialogTitle className="break-all pr-8">{image.name}</DialogTitle>
        <DialogDescription className="break-all">{image.path} · {image.width} × {image.height}</DialogDescription>
        {loading && <LoaderCircle aria-label={lang === 'es' ? 'Cargando imagen' : 'Loading image'} className="animate-spin" />}
        {(large || thumbnail) && <img src={large || thumbnail} alt={image.name} className="mx-auto max-h-[65vh] max-w-full object-contain" />}
        {error && <div role="alert" className="text-sm text-red-400">{error}<button type="button" onClick={() => setRetry(n => n + 1)} className="ml-3 inline-flex items-center gap-1"><RotateCcw size={14} />{lang === 'es' ? 'Reintentar' : 'Retry'}</button></div>}
      </DialogContent>
    </Dialog>
  </>
}
