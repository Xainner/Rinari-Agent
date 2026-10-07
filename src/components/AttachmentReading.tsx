import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useI18n, type I18nKey } from '../i18n'
import { engineApi } from '../services/engine'
import type { AttachmentRef, ReadingCoverage } from '../types'
import { cn } from '../lib/utils'

const COUNT = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined)

/** La cobertura que mandó el Engine, solo si trae los conteos que la vista usa. */
export function readingCoverage(value: unknown): ReadingCoverage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const total = COUNT(raw.total_pages)
  const prepared = COUNT(raw.prepared_pages)
  if (total === undefined || prepared === undefined) return undefined
  return {
    total_pages: total,
    prepared_pages: prepared,
    text_pages: COUNT(raw.text_pages) ?? 0,
    ocr_pages: COUNT(raw.ocr_pages) ?? 0,
    empty_pages: COUNT(raw.empty_pages) ?? 0,
    unprocessed_pages: COUNT(raw.unprocessed_pages) ?? 0,
    failed_pages: COUNT(raw.failed_pages) ?? 0,
  }
}

const PARTS: Array<[keyof ReadingCoverage, I18nKey]> = [
  ['text_pages', 'attach.coverage.text'],
  ['ocr_pages', 'attach.coverage.ocr'],
  ['empty_pages', 'attach.coverage.empty'],
  ['unprocessed_pages', 'attach.coverage.unprocessed'],
  ['failed_pages', 'attach.coverage.failed'],
]

/** «14 con texto · 6 con OCR · 60 sin preparar»: solo lo que el Engine contó. */
export function coverageDetail(coverage: ReadingCoverage, t: (key: I18nKey, vars?: Record<string, string | number>) => string): string {
  const parts = PARTS.filter(([key]) => coverage[key] > 0).map(([key, label]) => t(label, { count: coverage[key] }))
  const omitted = coverage.total_pages - coverage.prepared_pages
  if (omitted > 0) parts.push(t('attach.coverage.omitted', { count: omitted }))
  return parts.join(' · ')
}

/** Cómo se leyó el adjunto: OCR (y si la imagen también fue) y páginas leídas de un PDF. */
export function ReadingBadges({ attachment }: { attachment: Pick<AttachmentRef, 'ocr' | 'keepImage' | 'coverage'> }) {
  const { t } = useI18n()
  const coverage = attachment.coverage
  const partial = coverage && (coverage.prepared_pages < coverage.total_pages || coverage.failed_pages + coverage.unprocessed_pages > 0)
  return <>
    {attachment.ocr && (
      <span title={t(attachment.keepImage ? 'attach.read.bothHint' : 'attach.read.textHint')} className="rounded bg-[var(--accent-2)]/10 px-1 text-[10px] text-[var(--accent-2)]">
        {attachment.keepImage ? t('attach.badge.ocrImage') : 'OCR'}
      </span>
    )}
    {coverage && (
      <span
        title={coverageDetail(coverage, t)}
        aria-label={`${t('attach.coverage.pages', { read: coverage.prepared_pages, total: coverage.total_pages })}. ${coverageDetail(coverage, t)}`}
        className={cn('rounded px-1 text-[10px]', partial ? 'bg-amber-400/10 text-amber-300' : 'bg-[var(--bg-hover)] text-[var(--text-subtle)]')}
      >
        {t('attach.coverage.pages', { read: coverage.prepared_pages, total: coverage.total_pages })}
      </span>
    )}
  </>
}

/**
 * Vista previa de una imagen leída con OCR: el original y el texto que se
 * reconoció, para comprobar lo que recibió el modelo. Antes la miniatura
 * tapaba el texto y no había forma de verlo después de enviar.
 */
export function RecognizedPreview({ attachment, previewUrl }: { attachment: Pick<AttachmentRef, 'name' | 'derivedUri'>; previewUrl?: string }) {
  const { t } = useI18n()
  const [view, setView] = useState<'original' | 'text'>(previewUrl ? 'original' : 'text')
  const [text, setText] = useState<string>()
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (view !== 'text' || text !== undefined || !attachment.derivedUri) return
    let cancelled = false
    setLoading(true)
    engineApi.attachmentPreview(attachment.derivedUri, 512 * 1024)
      .then((result) => { if (!cancelled) setText(typeof result.text === 'string' ? result.text : t('attach.previewUnavailable')) })
      .catch(() => { if (!cancelled) setText(t('attach.previewFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [attachment.derivedUri, t, text, view])
  return <div className="space-y-3">
    <div role="tablist" aria-label={t('attach.read.views')} className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
      {(['original', 'text'] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={view === value}
          disabled={value === 'original' && !previewUrl}
          onClick={() => setView(value)}
          className={cn('rounded-md px-2.5 py-1 transition-colors disabled:opacity-40', view === value ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}
        >
          {t(value === 'original' ? 'attach.read.original' : 'attach.read.recognized')}
        </button>
      ))}
    </div>
    {view === 'original' && previewUrl && <img src={previewUrl} alt={attachment.name} className="mx-auto max-h-[60vh] max-w-full rounded-lg object-contain" />}
    {view === 'text' && loading && <div className="flex justify-center py-8"><LoaderCircle size={16} className="animate-spin" /></div>}
    {view === 'text' && !loading && text !== undefined && <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-muted)]">{text}</pre>}
  </div>
}
