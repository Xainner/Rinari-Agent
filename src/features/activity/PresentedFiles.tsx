import { Archive, ExternalLink, File, FileSpreadsheet, FileText, Film, Folder, FolderOpen, Globe, Image, MonitorPlay, Music, PackageCheck, PanelRightOpen, Play, Presentation } from 'lucide-react'
import { useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage } from '../../services/engine'
import { platform, type WorkspaceMedia } from '../../platform'
import { useSessionDockStore } from '../../stores/sessionDock'
import { FileLink, FileTurnContext, useFileWorkspace, type FileWorkspaceController } from '../files/FileWorkspace'
import { MediaPlayer } from '../files/MediaPlayer'
import { useArtifactImage } from '../files/artifactImage'
import { parseDelimited, useFirstPage, useNearView, useTextHead } from './presentedPreview'
import type { PresentTimelineItem, PresentedFile } from './types'

const ICONS: Record<string, (size: number) => ReactNode> = {
  image: (size) => <Image size={size} />,
  audio: (size) => <Music size={size} />,
  video: (size) => <Film size={size} />,
  pdf: (size) => <FileText size={size} />,
  office: (size) => <Presentation size={size} />,
  sheet: (size) => <FileSpreadsheet size={size} />,
  html: (size) => <Globe size={size} />,
  markdown: (size) => <FileText size={size} />,
  text: (size) => <FileText size={size} />,
  archive: (size) => <Archive size={size} />,
  folder: (size) => <Folder size={size} />,
  preview: (size) => <MonitorPlay size={size} />,
  web: (size) => <Globe size={size} />,
}
const icon = (kind: string, size = 14) => (ICONS[kind] ?? ((value: number) => <File size={value} />))(size)

/** Kinds that read better across the whole card than in a tile. */
const WIDE = new Set(['audio', 'video', 'sheet', 'text', 'markdown'])

function size(bytes?: number): string | null {
  if (bytes === undefined) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const extension = (name: string) => (name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 5) : '')

interface TileContext {
  file: PresentedFile
  href: string
  near: boolean
  files: FileWorkspaceController | null
  turnId: string | undefined
  /** Opens the delivery where it belongs: «Archivos», or the panel browser for a page. */
  open: () => void
  setDetail: (detail: string | null) => void
}

/**
 * Lo que Rinari entregó con `file.present` (plan 0.4.0 #35 y la tabla del
 * 35b): una tarjeta por entrega, siempre a la vista aunque la actividad esté
 * plegada. Cada archivo se ve por lo que es (miniatura, primera página,
 * primeras filas o líneas, reproductor, contenido de la carpeta o del ZIP, la
 * página web) y al pulsarlo se abre en «Archivos» o en el navegador del panel.
 * Nada se lee hasta que la tarjeta está cerca de la vista.
 */
export function PresentedFiles({ item }: { item: PresentTimelineItem }) {
  const { t } = useI18n()
  const count = item.files.length
  return (
    <section data-testid="presented-files" className="present-card" aria-label={t('present.title', { n: count })}>
      <header className="present-head">
        <span className="present-head-icon" aria-hidden="true"><PackageCheck size={13} /></span>
        <span className="present-kicker">{t('present.kicker')}</span>
        {count > 1 && <span className="r-chip present-count" data-tone="accent">{t('present.title', { n: count })}</span>}
      </header>
      <ul className="present-grid" data-single={count === 1 || undefined}>
        {item.files.map((file, index) => <PresentedTile key={`${file.path ?? file.url}:${index}`} file={file} index={index} single={count === 1} />)}
      </ul>
    </section>
  )
}

function PresentedTile({ file, index, single }: { file: PresentedFile; index: number; single: boolean }) {
  const { t } = useI18n()
  const files = useFileWorkspace()
  const turnId = useContext(FileTurnContext)
  const openView = useSessionDockStore((state) => state.openView)
  const ref = useRef<HTMLLIElement>(null)
  const near = useNearView(ref)
  const [detail, setDetail] = useState<string | null>(null)
  const href = file.url ?? file.uri ?? file.path ?? ''
  const web = file.kind === 'web' || file.kind === 'preview'
  const target = file.uri ?? file.path
  const open = () => {
    if (web && file.url) {
      const url = file.url
      if (files) {
        openView(files.sessionId, 'browser')
        void platform().browser.navigate(files.sessionId, url).catch(() => platform().opener.openUrl(url))
      } else void platform().opener.openUrl(url).catch((error) => toast.error(commandMessage(error)))
    } else if (target) files?.open(target, turnId)
  }
  const context: TileContext = { file, href, near, files, turnId, open, setDetail }
  const meta = detail ?? (file.kind === 'folder' || file.kind === 'archive'
    ? t('present.entries', { n: file.entry_count ?? 0 })
    : size(file.size_bytes))
  const local = Boolean(file.path) && !file.uri
  return (
    <li
      ref={ref}
      className="present-tile"
      data-present-kind={file.kind}
      data-wide={single || WIDE.has(file.kind) || undefined}
      style={{ '--i': index } as CSSProperties}
    >
      <Thumb {...context} />
      <div className="present-meta">
        <span className="present-meta-icon" aria-hidden="true">{icon(file.kind, 13)}</span>
        <span className="min-w-0 flex-1">
          {web
            ? <button type="button" className="present-name" title={file.url} onClick={open}>{file.name}</button>
            : <FileLink href={href}><span className="present-name">{file.name}</span></FileLink>}
          {file.caption && <span className="present-caption">{file.caption}</span>}
        </span>
        {meta && <span className="present-size">{meta}</span>}
        {local && files && file.path && (
          <span className="present-actions">
            <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('files.revealInFolder')} title={t('files.revealInFolder')} onClick={() => files.reveal(file.path!, turnId)}>
              <FolderOpen size={12} aria-hidden="true" />
            </button>
            {file.kind !== 'folder' && (
              <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('files.openExternally')} title={t('files.openExternally')} onClick={() => files.openExternal(file.path!, turnId)}>
                <ExternalLink size={12} aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>
    </li>
  )
}

function Thumb(context: TileContext) {
  switch (context.file.kind) {
    case 'image': return <ImageThumb {...context} />
    case 'audio':
    case 'video': return <MediaThumb {...context} />
    case 'pdf':
    case 'office': return <PageThumb {...context} />
    case 'sheet': return /\.(csv|tsv)$/i.test(context.file.name) ? <SheetThumb {...context} /> : <PageThumb {...context} />
    case 'markdown':
    case 'text': return <TextThumb {...context} />
    case 'html': return <PanelThumb {...context} label="present.openPanel" />
    case 'folder':
    case 'archive': return <EntriesThumb {...context} />
    case 'web':
    case 'preview': return <WebThumb {...context} />
    default: return <IconThumb {...context} />
  }
}

/** The tile's picture area: pressing it opens the delivery. */
function ThumbButton({ open, label, kind, state, children }: { open: () => void; label: string; kind: string; state?: 'loading' | 'ready' | 'empty'; children: ReactNode }) {
  return (
    <button type="button" className="present-thumb" data-thumb={kind} data-state={state} aria-label={label} title={label} onClick={open}>
      {children}
    </button>
  )
}

function IconThumb({ file, open }: TileContext) {
  const { t } = useI18n()
  const ext = extension(file.name)
  return (
    <ThumbButton open={open} label={t('present.open', { name: file.name })} kind="icon" state="empty">
      <span className="present-icon-art" aria-hidden="true">{icon(file.kind, 26)}{ext && <span className="present-ext">{ext}</span>}</span>
    </ThumbButton>
  )
}

function ImageThumb(context: TileContext) {
  const { file, near, files, turnId, open } = context
  const { t } = useI18n()
  const artifact = useArtifactImage(near && file.uri ? file.uri : null, 640)
  const [local, setLocal] = useState<{ url?: string; failed: boolean }>({ failed: false })
  // The controller is a new object on many renders: follow its session, not its identity.
  const media = useRef(files?.media)
  media.current = files?.media
  const sessionId = files?.sessionId
  useEffect(() => {
    const resolve = media.current
    if (!near || file.uri || !file.path || !sessionId || !resolve) return
    let alive = true
    resolve(file.path, turnId)
      .then((result) => { if (alive) setLocal(result.url ? { url: result.url, failed: false } : { failed: true }) })
      .catch(() => { if (alive) setLocal({ failed: true }) })
    return () => { alive = false }
  }, [near, file.uri, file.path, sessionId, turnId])
  const url = file.uri ? artifact.url : local.url
  const failed = file.uri ? artifact.failed : local.failed
  const [loaded, setLoaded] = useState(false)
  if (failed) return <IconThumb {...context} />
  return (
    <ThumbButton open={open} label={t('present.open', { name: file.name })} kind="image" state={loaded ? 'ready' : 'loading'}>
      {url && <img src={url} alt="" decoding="async" draggable={false} onLoad={() => setLoaded(true)} onError={() => setLocal({ failed: true })} />}
    </ThumbButton>
  )
}

function PageThumb(context: TileContext) {
  const { file, near, files, turnId, open, setDetail } = context
  const { t } = useI18n()
  const page = useFirstPage(files?.sessionId ?? null, file.uri ?? file.path, turnId, near)
  const image = useArtifactImage(page.value?.uri ?? null, 520)
  const pages = page.value?.pages ?? null
  useEffect(() => { setDetail(pages ? t(pages === 1 ? 'present.pageOne' : 'present.pages', { n: pages }) : null) }, [pages, setDetail, t])
  if (page.failed || image.failed) return <IconThumb {...context} />
  return (
    <ThumbButton open={open} label={t('present.open', { name: file.name })} kind="page" state={image.url ? 'ready' : 'loading'}>
      {image.url && <img src={image.url} alt="" decoding="async" draggable={false} />}
    </ThumbButton>
  )
}

function SheetThumb(context: TileContext) {
  const { file, near, files, turnId, open } = context
  const { t } = useI18n()
  const head = useTextHead(files?.sessionId ?? null, file.path, turnId, near)
  if (head.failed) return <IconThumb {...context} />
  const rows = head.value !== undefined ? parseDelimited(head.value, /\.tsv$/i.test(file.name) ? '\t' : ',') : null
  const width = rows ? Math.max(0, ...rows.map((row) => row.length)) : 0
  return (
    <ThumbButton open={open} label={t('present.open', { name: file.name })} kind="sheet" state={rows ? 'ready' : 'loading'}>
      {rows && rows.length > 0 && (
        <table className="present-sheet">
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>{Array.from({ length: width }, (_, column) => index === 0 ? <th key={column}>{row[column] ?? ''}</th> : <td key={column}>{row[column] ?? ''}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </ThumbButton>
  )
}

function TextThumb(context: TileContext) {
  const { file, near, files, turnId, open } = context
  const { t } = useI18n()
  const head = useTextHead(files?.sessionId ?? null, file.path, turnId, near)
  if (head.failed) return <IconThumb {...context} />
  const lines = head.value !== undefined ? head.value.split(/\r?\n/).slice(0, 8).join('\n') : null
  return (
    <ThumbButton open={open} label={t('present.open', { name: file.name })} kind="text" state={lines !== null ? 'ready' : 'loading'}>
      {lines !== null && <pre className="present-text">{lines}</pre>}
    </ThumbButton>
  )
}

function PanelThumb({ file, open, label }: TileContext & { label: 'present.openPanel' | 'present.openBrowser' }) {
  const { t } = useI18n()
  return (
    <ThumbButton open={open} label={t(label)} kind="panel" state="empty">
      <span className="present-icon-art" aria-hidden="true">{icon(file.kind, 26)}</span>
      <span className="present-panel-cta"><PanelRightOpen size={12} aria-hidden="true" /> {t(label)}</span>
    </ThumbButton>
  )
}

function EntriesThumb({ file, open }: TileContext) {
  const { t } = useI18n()
  const entries = file.entries ?? []
  const more = (file.entry_count ?? entries.length) - entries.length
  return (
    <ThumbButton open={open} label={t('present.open', { name: file.name })} kind="entries" state="ready">
      <ul className="present-entries">
        {entries.slice(0, 6).map((entry) => (
          <li key={entry}>
            {entry.endsWith('/') ? <Folder size={11} aria-hidden="true" /> : <File size={11} aria-hidden="true" />}
            <span>{entry.replace(/\/$/, '')}</span>
          </li>
        ))}
        {(more > 0 || entries.length > 6) && <li className="present-entries-more">{t('present.more', { n: more + Math.max(0, entries.length - 6) })}</li>}
      </ul>
    </ThumbButton>
  )
}

function WebThumb(context: TileContext) {
  const { file, open } = context
  const { t } = useI18n()
  let path = ''
  try { const url = new URL(file.url ?? ''); path = `${url.pathname === '/' ? '' : url.pathname}${url.search}` } catch { /* the name says it */ }
  return (
    <ThumbButton open={open} label={t('present.openBrowser')} kind="web" state="empty">
      <span className="present-web">
        <span className="present-web-bar" aria-hidden="true"><i /><i /><i /></span>
        <span className="present-web-host">{icon(file.kind, 15)}<span>{path || file.name}</span></span>
        <span className="present-panel-cta"><PanelRightOpen size={12} aria-hidden="true" /> {t('present.openBrowser')}</span>
      </span>
    </ThumbButton>
  )
}

/**
 * Audio and video play right in the card; nothing loads until «Reproducir»,
 * so a history with many deliveries downloads none of them for being in view.
 */
function MediaThumb({ file, files, turnId, setDetail }: TileContext) {
  const { t } = useI18n()
  const [state, setState] = useState<{ media?: WorkspaceMedia; loading?: boolean; error?: string }>({})
  const path = file.uri ?? file.path
  if (state.media && files && path) {
    return (
      <div className="present-player" data-thumb={file.kind}>
        <MediaPlayer media={state.media} autoPlay onOpenExternal={() => files.openExternal(path, turnId)} />
      </div>
    )
  }
  const label = t(file.kind === 'audio' ? 'files.playAudio' : 'files.playVideo', { name: file.name })
  return (
    <div className="present-player" data-thumb={file.kind} data-idle>
      <button
        type="button"
        className="present-play"
        aria-label={label}
        title={label}
        disabled={!files || !path || state.loading}
        onClick={() => {
          if (!files || !path) return
          setState({ loading: true })
          files.media(path, turnId)
            .then((media) => { setState({ media }); setDetail(null) })
            .catch((error) => setState({ error: commandMessage(error) }))
        }}
      >
        <Play size={file.kind === 'video' ? 18 : 14} aria-hidden="true" />
      </button>
      {file.kind === 'audio' && <span className="present-wave" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ '--h': `${30 + ((index * 37) % 61)}%` } as CSSProperties} />)}</span>}
      {state.error && <span role="alert" className="present-error">{state.error}</span>}
    </div>
  )
}
