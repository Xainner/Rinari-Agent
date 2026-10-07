import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, FileSpreadsheet, FileText, FolderOpen, LoaderCircle, MessageSquarePlus, Presentation, RefreshCw, Square } from 'lucide-react'
import { requestComposerFocus } from '../../components/composer/focusComposer'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import { useComposerStore } from '../../stores/composer'
import { useArtifactImage } from '../files/artifactImage'
import { DocumentChecks, DocumentRevisions } from './DocumentChecks'
import { documentsApi, ACTIVE_JOB, documentKind, type PreviewPage } from './documentsApi'
import { useDocument, type DocumentSource } from './useDocument'

type Tab = 'preview' | 'content' | 'checks' | 'revisions'
const TABS: readonly Tab[] = ['preview', 'content', 'checks', 'revisions']
const TAB_LABEL: Record<Tab, I18nKey> = {
  preview: 'documents.preview',
  content: 'documents.content',
  checks: 'documents.checks',
  revisions: 'documents.revisions',
}

const KIND_ICON = { pptx: Presentation, xlsx: FileSpreadsheet, docx: FileText, pdf: FileText } as const

/** Riesgos que el Engine detectó; ninguno se ejecuta ni se actualiza. */
const RISK_KEYS: Record<string, I18nKey> = {
  macros: 'documents.risk.macros',
  external_links: 'documents.risk.externalLinks',
  external_targets: 'documents.risk.externalTargets',
  embedded_objects: 'documents.risk.embedded',
  signed: 'documents.risk.signed',
  data_connections: 'documents.risk.connections',
  pivot_tables: 'documents.risk.pivots',
  smartart: 'documents.risk.smartart',
  activex: 'documents.risk.activex',
  forms: 'documents.risk.forms',
  actions: 'documents.risk.actions',
  javascript: 'documents.risk.javascript',
  attachments: 'documents.risk.attachments',
}

function PreviewImage({ page, size, className, alt }: { page: PreviewPage; size: number; className?: string; alt: string }) {
  const image = useArtifactImage(page.uri, size)
  const ratio = page.width && page.height ? `${page.width} / ${page.height}` : '16 / 9'
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-white/95 shadow-sm ring-1 ring-black/10', className)} style={{ aspectRatio: ratio }}>
      {image.url
        ? <img src={image.url} alt={alt} className="block h-full w-full object-contain" draggable={false} />
        : <div className="absolute inset-0 flex items-center justify-center text-[var(--text-subtle)]">
            {image.failed ? <AlertTriangle size={14} /> : <LoaderCircle size={14} className="animate-spin" />}
          </div>}
    </div>
  )
}

/**
 * Un documento Office o PDF abierto en el workspace: la vista previa es el
 * render del Engine para esta revisión exacta (no una reinterpretación en
 * React), y «Contenido» es lo que el Engine leyó de él.
 */
export function DocumentView({ source, name, onOpenExternally, onReveal, headerActions = true }: {
  source: DocumentSource
  name: string
  onOpenExternally?: () => void
  onReveal?: () => void
  /** Falso cuando el contenedor ya ofrece «abrir fuera» y «en su carpeta» (el visor de archivos). */
  headerActions?: boolean
}) {
  const { t } = useI18n()
  // Otra revisión del mismo documento (las que Rinari creó o editó).
  const [revisionRef, setRevisionRef] = useState<string>()
  const active = useMemo<DocumentSource>(
    () => (revisionRef ? { sessionId: source.sessionId, ref: revisionRef } : source),
    [revisionRef, source],
  )
  const document = useDocument(active)
  const [tab, setTab] = useState<Tab>('preview')
  const kind = (document.inspection?.revision.kind ?? documentKind(name) ?? 'pdf') as keyof typeof KIND_ICON
  const Icon = KIND_ICON[kind] ?? FileText
  const inspection = document.inspection?.inspection as Record<string, unknown> | null | undefined
  const count = [inspection?.slide_count, inspection?.page_count, inspection?.sheet_count].find((value): value is number => typeof value === 'number')
    ?? document.job?.result?.page_count ?? document.preview?.pages.length
  const risks = document.inspection?.container.risks ?? []

  return (
    <div className="flex h-full min-h-0 flex-col" data-document-kind={kind}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Icon size={15} className="shrink-0 text-[var(--accent-2)]" aria-hidden="true" />
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text)]">{name}</span>
        <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--text-muted)]">{kind}</span>
        {typeof count === 'number' && (
          <span className="text-[11px] text-[var(--text-subtle)]">
            {t(kind === 'pptx' ? 'documents.slides' : kind === 'xlsx' ? 'documents.sheets' : 'documents.pages', { count })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {headerActions && onOpenExternally && (
            <button type="button" onClick={onOpenExternally} aria-label={t('files.openExternally')} title={t('files.openExternally')}
              className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
              <ExternalLink size={14} />
            </button>
          )}
          {headerActions && onReveal && (
            <button type="button" onClick={onReveal} aria-label={t('files.revealInFolder')} title={t('files.revealInFolder')}
              className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
              <FolderOpen size={14} />
            </button>
          )}
        </div>
        <div role="tablist" aria-label={t('documents.views')} className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
          {TABS.map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
              className={cn('rounded-md px-2.5 py-1 transition-colors', tab === value ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
              {t(TAB_LABEL[value])}
            </button>
          ))}
        </div>
      </div>
      {risks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-3 py-1.5" aria-label={t('documents.risks')}>
          {risks.map((risk) => (
            <span key={risk.code} title={risk.detail} className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
              <AlertTriangle size={10} aria-hidden="true" />{RISK_KEYS[risk.code] ? t(RISK_KEYS[risk.code]) : risk.code}
            </span>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {document.loading ? (
          <Centered><LoaderCircle size={16} className="animate-spin" /> {t('documents.loading')}</Centered>
        ) : document.error ? (
          <div role="alert" className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle size={22} className="text-red-400" />
            <p className="text-sm break-words text-[var(--text)]">{document.error}</p>
            <OpenButtons onOpenExternally={onOpenExternally} onReveal={onReveal} />
          </div>
        ) : tab === 'content' ? (
          <DocumentContent source={active} revisionId={document.inspection!.revision.id} kind={kind} />
        ) : tab === 'checks' ? (
          <DocumentChecks key={document.inspection!.revision.id} sessionId={source.sessionId} revisionId={document.inspection!.revision.id} />
        ) : tab === 'revisions' ? (
          <DocumentRevisions sessionId={source.sessionId} documentId={document.inspection!.revision.document_id}
            currentId={document.inspection!.revision.id}
            onSelect={(revision) => { setRevisionRef(revision.id); setTab('preview') }} />
        ) : (
          <PreviewPane document={document} kind={kind} name={name} sessionId={source.sessionId} onOpenExternally={onOpenExternally} onReveal={onReveal} />
        )}
      </div>
      {document.preview?.backend && (
        <p className="border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-subtle)]">
          {t('documents.renderedBy', { backend: t(`documents.backend.${document.preview.backend === 'office' || document.preview.backend === 'office-com' ? 'office' : document.preview.backend === 'pdfium' || document.preview.backend === 'native' ? 'pdfium' : 'libreoffice'}` as I18nKey) })}
          {' · '}{t('documents.revision', { id: (document.inspection?.revision.sha256 ?? '').slice(0, 8) })}
        </p>
      )}
    </div>
  )
}

function OpenButtons({ onOpenExternally, onReveal }: { onOpenExternally?: () => void; onReveal?: () => void }) {
  const { t } = useI18n()
  return <>
    {onOpenExternally && (
      <button type="button" onClick={onOpenExternally} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs text-white">
        <ExternalLink size={13} />{t('files.openExternally')}
      </button>
    )}
    {onReveal && (
      <button type="button" onClick={onReveal} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
        <FolderOpen size={13} />{t('files.revealInFolder')}
      </button>
    )}
  </>
}

function Centered({ children, role }: { children: React.ReactNode; role?: string }) {
  return <div role={role ?? 'status'} className="flex h-full items-center justify-center gap-2 p-6 text-center text-sm text-[var(--text-muted)]">{children}</div>
}

/** Las notas del orador de una diapositiva, leídas por el Engine. */
function useSlideNotes(sessionId: string, revisionId: string | undefined, slide: number): string | null {
  const [notes, setNotes] = useState<string | null>(null)
  useEffect(() => {
    if (!revisionId) return
    let alive = true
    setNotes(null)
    documentsApi.range(sessionId, revisionId, String(slide))
      .then((result) => {
        const slides = result.slides as Array<{ notes?: string }> | undefined
        if (alive) setNotes(slides?.[0]?.notes?.trim() || null)
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [revisionId, sessionId, slide])
  return notes
}

/** Deja en el composer de la sesión una referencia exacta a la diapositiva. */
function askForChanges(sessionId: string, text: string) {
  const store = useComposerStore.getState()
  const current = store.getDraft(sessionId).text
  store.setTextFor(sessionId, current.trim() ? `${current.trimEnd()}\n${text}` : text)
  requestComposerFocus(sessionId)
}

function PreviewPane({ document, kind, name, sessionId, onOpenExternally, onReveal }: { document: ReturnType<typeof useDocument>; kind: string; name: string; sessionId: string; onOpenExternally?: () => void; onReveal?: () => void }) {
  const { t } = useI18n()
  const pages = document.preview?.pages ?? []
  const [selected, setSelected] = useState(1)
  const main = useRef<HTMLDivElement>(null)
  useEffect(() => { if (pages.length && !pages.some((page) => page.page === selected)) setSelected(pages[0].page) }, [pages, selected])
  const job = document.job
  const working = job && ACTIVE_JOB.has(job.status)
  const revision = document.inspection?.revision
  const notes = useSlideNotes(sessionId, kind === 'pptx' ? revision?.id : undefined, selected)

  if (!pages.length) {
    if (working) {
      return (
        <Centered>
          <LoaderCircle size={16} className="animate-spin text-[var(--accent-2)]" />
          <span>{t(job.phase === 'render' ? 'documents.rendering' : 'documents.queued')}</span>
          <button type="button" onClick={document.cancel} className="ml-1 inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-xs hover:text-[var(--text)]">
            <Square size={10} />{t('documents.cancel')}
          </button>
        </Centered>
      )
    }
    const unavailable = document.unavailable
    return (
      <div role="status" className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-amber-300" />
        <p className="text-sm text-[var(--text)]">
          {unavailable?.code === 'BACKEND_UNAVAILABLE' ? t('documents.noRenderer') : job?.status === 'cancelled' ? t('documents.cancelled') : t('documents.renderFailed')}
        </p>
        {unavailable && unavailable.code !== 'BACKEND_UNAVAILABLE' && <p className="text-xs break-words text-[var(--text-muted)]">{unavailable.message}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <OpenButtons onOpenExternally={onOpenExternally} onReveal={onReveal} />
          {unavailable?.code !== 'BACKEND_UNAVAILABLE' && (
            <button type="button" onClick={document.rerender} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
              <RefreshCw size={13} />{t('documents.retry')}
            </button>
          )}
        </div>
      </div>
    )
  }

  const partial = typeof job?.result?.page_count === 'number' && job.result.page_count > pages.length
  if (kind === 'pptx') {
    const current = pages.find((page) => page.page === selected) ?? pages[0]
    return (
      <div className="flex h-full min-h-0">
        <ol aria-label={t('documents.slideList')} className="w-28 shrink-0 space-y-2 overflow-y-auto border-r border-[var(--border)] p-2"
          onKeyDown={(event) => {
            const index = pages.findIndex((page) => page.page === current.page)
            const next = event.key === 'ArrowDown' ? pages[index + 1] : event.key === 'ArrowUp' ? pages[index - 1] : undefined
            if (next) { event.preventDefault(); setSelected(next.page) }
          }}>
          {pages.map((page) => (
            <li key={page.page}>
              <button type="button" aria-current={page.page === current.page ? 'true' : undefined} aria-label={t('documents.slideN', { n: page.page })}
                onClick={() => setSelected(page.page)}
                className={cn('w-full rounded-md p-0.5 text-left outline-none transition-colors', page.page === current.page ? 'bg-[var(--accent-2)]/20 ring-1 ring-[var(--accent-2)]/60' : 'hover:bg-[var(--bg-hover)]')}>
                <PreviewImage page={page} size={320} alt="" />
                <span className="mt-0.5 block text-center text-[10px] text-[var(--text-subtle)]">{page.page}</span>
              </button>
            </li>
          ))}
        </ol>
        <div ref={main} className="flex min-w-0 flex-1 flex-col items-center gap-2 overflow-auto bg-[var(--bg-subtle)] p-4">
          <PreviewImage page={current} size={1600} alt={t('documents.slideAlt', { n: current.page, name })} className="w-full max-w-5xl" />
          <div className="flex w-full max-w-5xl flex-col gap-2">
            {revision && (
              <button type="button" title={t('documents.askChangesTitle')}
                onClick={() => askForChanges(sessionId, t('documents.askChangesPrompt', { n: current.page, name, rev: revision.id }))}
                className="self-end inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
                <MessageSquarePlus size={13} aria-hidden="true" />{t('documents.askChanges')}
              </button>
            )}
            {notes && (
              <p className="w-full whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)]" aria-label={t('documents.notes')}>
                <span className="mr-1 font-medium text-[var(--text)]">{t('documents.notes')}:</span>{notes}
              </p>
            )}
          </div>
          {partial && <p className="text-[11px] text-[var(--text-subtle)]">{t('documents.partialRender', { shown: pages.length, total: job!.result!.page_count! })}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className="h-full space-y-4 overflow-auto bg-[var(--bg-subtle)] p-4">
      {pages.map((page) => (
        <figure key={page.page} className="mx-auto max-w-3xl">
          <PreviewImage page={page} size={1600} alt={t('documents.pageAlt', { n: page.page, name })} />
          <figcaption className="mt-1 text-center text-[10px] text-[var(--text-subtle)]">{page.page}</figcaption>
        </figure>
      ))}
      {partial && <p className="text-center text-[11px] text-[var(--text-subtle)]">{t('documents.partialRender', { shown: pages.length, total: job!.result!.page_count! })}</p>}
    </div>
  )
}

interface SlideShape { shape_id: number; kind: string; text?: string; table?: string[][]; chart?: { type?: string; categories?: string[]; series?: Array<{ name: string; values: unknown[] }> } }
interface SlideRead { index: number; shapes: SlideShape[]; notes?: string }
interface PageRead { page: number; text: string; has_text: boolean }
interface BlockRead { block: number; type: 'paragraph' | 'table'; style?: string | null; text?: string; rows?: string[][] }
interface RowRead { row: number; cells: Array<{ cell: string; value: unknown }> }
type Section = { key: string; title: string; body: React.ReactNode }

function Table({ rows }: { rows: string[][] }) {
  return (
    <table className="mt-1 w-full border-collapse text-[11px]">
      <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="border border-[var(--border)] px-1.5 py-0.5">{cell}</td>)}</tr>)}</tbody>
    </table>
  )
}

/** Lo que el Engine leyó, por diapositiva, página, bloque o fila. */
function sections(result: Record<string, unknown>, t: ReturnType<typeof useI18n>['t']): Section[] {
  if (Array.isArray(result.slides)) {
    return (result.slides as SlideRead[]).map((slide) => ({
      key: `s${slide.index}`,
      title: t('documents.slideN', { n: slide.index }),
      body: <>
        {slide.shapes.map((shape) => (
          <div key={shape.shape_id}>
            {shape.text && <p className="whitespace-pre-wrap">{shape.text}</p>}
            {shape.table && <Table rows={shape.table} />}
            {shape.chart && (
              <p className="font-mono text-[11px] text-[var(--text-subtle)]">
                {t('documents.chart', { type: shape.chart.type ?? '' })}: {shape.chart.series?.map((series) => `${series.name} (${series.values.length})`).join(', ')}
              </p>
            )}
          </div>
        ))}
        {slide.notes && <p className="border-l-2 border-[var(--border)] pl-2 text-[11px] italic">{slide.notes}</p>}
      </>,
    }))
  }
  if (Array.isArray(result.pages)) {
    return (result.pages as PageRead[]).map((page) => ({
      key: `p${page.page}`,
      title: t('documents.pageN', { n: page.page }),
      body: page.has_text ? <p className="whitespace-pre-wrap">{page.text}</p> : <p className="italic">{t('documents.noTextLayer')}</p>,
    }))
  }
  if (Array.isArray(result.blocks)) {
    return [{
      key: 'blocks',
      title: t('documents.body'),
      body: <>{(result.blocks as BlockRead[]).map((block) => block.type === 'table'
        ? <Table key={block.block} rows={block.rows ?? []} />
        : block.text ? <p key={block.block} className={cn('whitespace-pre-wrap', /heading|t[ií]tulo|title/i.test(block.style ?? '') && 'font-semibold text-[var(--text)]')}>{block.text}</p> : null)}</>,
    }]
  }
  if (Array.isArray(result.rows)) {
    return [{
      key: 'rows',
      title: `${String(result.sheet ?? '')}!${String(result.range ?? '')}`,
      body: (
        <table className="w-full border-collapse font-mono text-[11px]">
          <tbody>{(result.rows as RowRead[]).map((row) => (
            <tr key={row.row}>
              <td className="pr-2 text-right text-[var(--text-subtle)]">{row.row}</td>
              {row.cells.map((cell) => <td key={cell.cell} title={cell.cell} className="border border-[var(--border)] px-1.5 py-0.5">{String(cell.value)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      ),
    }]
  }
  return []
}

function DocumentContent({ source, revisionId }: { source: DocumentSource; revisionId: string; kind: string }) {
  const { t } = useI18n()
  const [items, setItems] = useState<Section[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const more = useMemo(() => async (from?: number) => {
    setLoading(true)
    try {
      const result = await documentsApi.range(source.sessionId, revisionId, undefined, from)
      const next = sections(result, t)
      setItems((previous) => [...(from ? previous : []), ...next])
      setCursor(result.next_cursor ?? null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [revisionId, source.sessionId, t])
  useEffect(() => { void more() }, [more])
  if (error) return <Centered role="alert">{error}</Centered>
  return (
    <div className="h-full space-y-3 overflow-auto p-4">
      {items.map((item) => (
        <section key={item.key} className="rounded-xl border border-[var(--border)] p-3">
          <h3 className="mb-1.5 text-xs font-semibold text-[var(--text)]">{item.title}</h3>
          <div className="space-y-1.5 text-[12px] text-[var(--text-muted)]">{item.body}</div>
        </section>
      ))}
      {loading && <p className="text-center text-xs text-[var(--text-subtle)]"><LoaderCircle size={12} className="inline animate-spin" /></p>}
      {!loading && cursor && (
        <button type="button" onClick={() => void more(cursor)} className="mx-auto block rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
          {t('documents.loadMore')}
        </button>
      )}
    </div>
  )
}
