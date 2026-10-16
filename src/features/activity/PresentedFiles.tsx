import { Archive, ExternalLink, File, FileSpreadsheet, FileText, Film, Folder, Globe, Image, MonitorPlay, Music, Presentation } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { FileLink, InlineMedia } from '../files/FileWorkspace'
import type { PresentTimelineItem, PresentedFile } from './types'

const ICONS: Record<string, ReactNode> = {
  image: <Image size={14} />,
  audio: <Music size={14} />,
  video: <Film size={14} />,
  pdf: <FileText size={14} />,
  office: <Presentation size={14} />,
  sheet: <FileSpreadsheet size={14} />,
  html: <Globe size={14} />,
  markdown: <FileText size={14} />,
  text: <FileText size={14} />,
  archive: <Archive size={14} />,
  folder: <Folder size={14} />,
  preview: <MonitorPlay size={14} />,
  web: <ExternalLink size={14} />,
}

function size(bytes?: number): string | null {
  if (bytes === undefined) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function PresentedRow({ file }: { file: PresentedFile }) {
  const { t } = useI18n()
  const href = file.url ?? file.uri ?? file.path ?? ''
  const detail = file.kind === 'folder' || file.kind === 'archive'
    ? t('present.entries', { n: file.entry_count ?? 0 })
    : size(file.size_bytes)
  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--bg-hover)]" data-present-kind={file.kind}>
      <span className="mt-0.5 shrink-0 text-[var(--text-subtle)]" aria-hidden="true">{ICONS[file.kind] ?? <File size={14} />}</span>
      <span className="min-w-0 flex-1">
        <FileLink href={href}><span className="text-[13px] font-medium text-[var(--text)]">{file.name}</span></FileLink>
        {(file.kind === 'audio' || file.kind === 'video') && <InlineMedia href={href} />}
        {file.caption && <span className="block truncate text-[11px] text-[var(--text-subtle)]">{file.caption}</span>}
        {file.entries && file.entries.length > 0 && <span className="block truncate text-[11px] text-[var(--text-subtle)]">{file.entries.join(' · ')}</span>}
      </span>
      {detail && <span className="shrink-0 text-[11px] text-[var(--text-subtle)]">{detail}</span>}
    </li>
  )
}

/**
 * Lo que Rinari entregó con `file.present` (plan 0.4.0 #35): una tarjeta por
 * entrega, siempre a la vista aunque la actividad esté plegada. Al pulsar un
 * archivo se abre en «Archivos»; el audio y el video llevan su reproductor.
 */
export function PresentedFiles({ item }: { item: PresentTimelineItem }) {
  const { t } = useI18n()
  return (
    <section data-testid="presented-files" className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1.5" aria-label={t('present.title', { n: item.files.length })}>
      <ul className="space-y-1">
        {item.files.map((file, index) => <PresentedRow key={`${file.path ?? file.url}:${index}`} file={file} />)}
      </ul>
    </section>
  )
}
