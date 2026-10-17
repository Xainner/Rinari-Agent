import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react'
import { toast } from 'sonner'
import { Virtualizer, type VirtualizerHandle } from 'virtua'
import {
  ChevronRight, ChevronsDownUp, Crosshair, File, FileCode, FileImage, FileText, Folder, FolderOpen, LoaderCircle,
} from 'lucide-react'
import { translate, useI18n, type I18nKey } from '../../i18n'
import { platform, type ContextMenuItem } from '../../platform'
import { copyText } from '../../lib/clipboard'
import { useUIStore } from '../../stores/ui'
import { useSessionDockStore } from '../../stores/sessionDock'
import { MENTION_FILE_EVENT, TREE_FILE_MIME, type TreeFileRef } from './treeFile'
import { commandMessage, engineApi, type WorkspaceDirEntry } from '../../services/engine'
import { SearchField } from '../../components/ui/SearchField'
import { useFileWorkspace } from './FileWorkspace'

const CODE = /\.(tsx?|jsx?|mjs|cjs|py|rs|go|java|kt|rb|php|cs|cpp|c|h|swift|css|scss|html|json|ya?ml|toml|sh|ps1|sql)$/i
const TEXT = /\.(md|mdx|txt|rst|log|csv)$/i
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i

const storageKey = (sessionId: string) => `rinari.fileTree.open.${sessionId}`
function readOpen(sessionId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId))
    const value = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}
function writeOpen(sessionId: string, open: Set<string>) {
  try { window.localStorage.setItem(storageKey(sessionId), JSON.stringify([...open])) } catch { /* not stored */ }
}

function FileIcon({ name }: { name: string }) {
  const Icon = IMAGE.test(name) ? FileImage : CODE.test(name) ? FileCode : TEXT.test(name) ? FileText : File
  return <Icon size={14} aria-hidden="true" className="file-tree-icon" />
}

/** Desde cuántas filas visibles el árbol se dibuja como lista virtual. */
const VIRTUAL_FROM = 120

/** `label`: una carpeta compacta («src/caja») cuando cada una solo contiene otra. */
interface Row { entry: WorkspaceDirEntry; depth: number; label: string }

/**
 * El árbol del proyecto en la vista Archivos (plan 0.4.0 #98), como el de
 * Claude Code: carpetas primero, cada una cargada al desplegarla, con el
 * estado git en color y letra, y lo desplegado recordado por conversación.
 * Arriba, un solo buscador de archivos, «Revelar el archivo activo» y
 * «Plegar todo».
 */
export default function FileTree({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const files = useFileWorkspace()
  const [children, setChildren] = useState<Record<string, WorkspaceDirEntry[]>>({})
  const [loading, setLoading] = useState<Set<string>>(() => new Set())
  const [open, setOpen] = useState<Set<string>>(() => readOpen(sessionId))
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ path: string; relative_path: string; name: string }[] | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const [root, setRoot] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (path: string): Promise<WorkspaceDirEntry[]> => {
    setLoading((current) => new Set(current).add(path))
    try {
      const listing = await engineApi.workspaceDirList(sessionId, path)
      setChildren((current) => ({ ...current, [path]: listing.entries }))
      if (path === '') setRoot(listing.root)
      setError('')
      return listing.entries
    } catch (err) {
      if (path === '') setError(err instanceof Error ? err.message : String(err))
      return []
    } finally {
      setLoading((current) => { const next = new Set(current); next.delete(path); return next })
    }
  }, [sessionId])

  // The root, and the folders that were open last time.
  useEffect(() => {
    setChildren({})
    const remembered = readOpen(sessionId)
    setOpen(remembered)
    void load('')
    for (const path of remembered) void load(path)
  }, [sessionId, load])

  // Abrir una carpeta que solo contiene otra abre también esa (se ven juntas, «a/b»).
  const openDeep = async (path: string) => {
    setOpen((current) => { const next = new Set(current).add(path); writeOpen(sessionId, next); return next })
    const entries = children[path] ?? await load(path)
    if (entries.length === 1 && entries[0].kind === 'dir') await openDeep(entries[0].relative_path)
  }
  const toggle = (path: string) => {
    if (!open.has(path)) { void openDeep(path); return }
    setOpen((current) => {
      const next = new Set(current)
      next.delete(path)
      writeOpen(sessionId, next)
      return next
    })
  }
  const collapseAll = () => { const next = new Set<string>(); setOpen(next); writeOpen(sessionId, next) }

  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (path: string, depth: number) => {
      for (const first of children[path] ?? []) {
        // Carpetas compactas: mientras una carpeta (ya cargada) solo contiene otra, van en una fila.
        let entry = first
        let label = first.name
        let inside = first.kind === 'dir' ? children[first.relative_path] : undefined
        while (inside && inside.length === 1 && inside[0].kind === 'dir') {
          entry = inside[0]
          label = `${label}/${entry.name}`
          inside = children[entry.relative_path]
        }
        out.push({ entry, depth, label })
        if (entry.kind === 'dir' && open.has(entry.relative_path)) walk(entry.relative_path, depth + 1)
      }
    }
    walk('', 0)
    return out
  }, [children, open])

  // «Revelar el archivo activo»: open its folders and bring its row into view.
  const selectedTab = files?.selected
  const activePath = selectedTab && selectedTab.sessionId === sessionId ? (selectedTab.file?.path ?? selectedTab.target) : null
  const reveal = async () => {
    if (!activePath) return
    const normal = activePath.replace(/\\/g, '/')
    const base = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/`
    const relative = normal.toLowerCase().startsWith(base.toLowerCase())
      ? normal.slice(base.length)
      : /^([A-Za-z]:)?\//.test(normal) ? null : normal
    if (!relative) return
    const parts = relative.split('/')
    const next = new Set(open)
    let prefix = ''
    for (const part of parts.slice(0, -1)) {
      prefix = prefix ? `${prefix}/${part}` : part
      next.add(prefix)
      if (!children[prefix]) await load(prefix)
    }
    setOpen(next)
    writeOpen(sessionId, next)
    setFocused(relative)
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-path="${CSS.escape(relative)}"]`)?.scrollIntoView({ block: 'nearest' }))
  }

  // One search for files across the workspace.
  useEffect(() => {
    const needle = query.trim()
    if (!needle) { setResults(null); return }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void engineApi.searchWorkspaceFiles(sessionId, needle, 50)
        .then((found) => { if (!cancelled) setResults(found.files) })
        .catch(() => { if (!cancelled) setResults([]) })
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, sessionId])

  const openFile = (path: string) => files?.open(path)

  // Lista virtual para carpetas grandes: la recorre la sección que hace scroll.
  const virtRef = useRef<VirtualizerHandle>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const parent = listRef.current?.closest<HTMLElement>('.dock-section') ?? null
    scrollRef.current = parent
    setScroller(parent)
  }, [results])
  const virtual = scroller !== null && rows.length >= VIRTUAL_FROM

  const fileRef = (entry: WorkspaceDirEntry): TreeFileRef => ({ sessionId, path: entry.path, relative_path: entry.relative_path, name: entry.name })
  const mention = (entry: WorkspaceDirEntry) => window.dispatchEvent(new CustomEvent(MENTION_FILE_EVENT, { detail: fileRef(entry) }))

  /** El menú de una fila: abrir, fuera, en la carpeta, copiar rutas, mencionar y ver cambios. Sin renombrar ni borrar. */
  const menu = (event: MouseEvent, entry: WorkspaceDirEntry) => {
    if (!platform().isDesktop()) return
    event.preventDefault()
    const lang = useUIStore.getState().lang
    const tr = (key: I18nKey) => translate(lang, key)
    const items: ContextMenuItem[] = []
    if (entry.kind === 'file') {
      items.push({ kind: 'action', text: tr('app.openFile'), run: () => openFile(entry.path) })
      items.push({ kind: 'action', text: tr('files.tree.openExternal'), run: () => files?.openExternal(entry.path) })
    }
    items.push({ kind: 'action', text: tr('files.revealInFolder'), run: () => files?.reveal(entry.path) })
    items.push({ kind: 'action', text: tr('files.tree.copyRelative'), run: () => void copyText(entry.relative_path) })
    items.push({ kind: 'action', text: tr('files.tree.copyAbsolute'), run: () => void copyText(entry.path) })
    if (entry.kind === 'file') {
        items.push({ kind: 'action', text: tr('files.tree.mention'), run: () => mention(entry) })
      if (entry.git) items.push({ kind: 'action', text: tr('files.tree.viewChanges'), run: () => useSessionDockStore.getState().openView(sessionId, 'changes') })
    }
    void platform().contextMenu.show(items, { x: event.clientX, y: event.clientY }).catch((error) => toast.error(commandMessage(error)))
  }
  const drag = (event: DragEvent, entry: WorkspaceDirEntry) => {
    if (entry.kind !== 'file') { event.preventDefault(); return }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(TREE_FILE_MIME, JSON.stringify(fileRef(entry)))
    event.dataTransfer.setData('text/plain', entry.relative_path)
  }
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, row: Row) => {
    const index = rows.findIndex((item) => item.entry.relative_path === row.entry.relative_path)
    const move = (to: number) => {
      const at = Math.max(0, Math.min(rows.length - 1, to))
      const target = rows[at]
      if (!target) return
      setFocused(target.entry.relative_path)
      const focus = () => listRef.current?.querySelector<HTMLButtonElement>(`[data-path="${CSS.escape(target.entry.relative_path)}"]`)?.focus()
      // En la lista virtual la fila puede no estar montada: primero se trae a la vista.
      if (virtual) { virtRef.current?.scrollToIndex(at, { align: 'nearest' }); requestAnimationFrame(focus) }
      else focus()
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); move(index + 1) }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(index - 1) }
    if (event.key === 'ArrowRight' && row.entry.kind === 'dir' && !open.has(row.entry.relative_path)) { event.preventDefault(); toggle(row.entry.relative_path) }
    if (event.key === 'ArrowLeft' && row.entry.kind === 'dir' && open.has(row.entry.relative_path)) { event.preventDefault(); toggle(row.entry.relative_path) }
  }

  const renderRow = ({ entry, depth, label }: Row): ReactElement => {
    const expanded = entry.kind === 'dir' && open.has(entry.relative_path)
    const selected = activePath !== null && entry.path.replace(/\\/g, '/').toLowerCase() === activePath.replace(/\\/g, '/').toLowerCase()
    return (
      <button
        key={entry.relative_path}
        type="button"
        role="treeitem"
        aria-expanded={entry.kind === 'dir' ? expanded : undefined}
        aria-selected={selected}
        aria-level={depth + 1}
        tabIndex={focused === entry.relative_path || (focused === null && depth === 0 && rows[0]?.entry === entry) ? 0 : -1}
        data-path={entry.relative_path}
        data-git={entry.git}
        data-compact={label !== entry.name || undefined}
        draggable={entry.kind === 'file'}
        className="file-tree-row"
        style={{ paddingLeft: 8 + depth * 14 }}
        title={entry.relative_path}
        onClick={() => (entry.kind === 'dir' ? toggle(entry.relative_path) : openFile(entry.path))}
        onFocus={() => setFocused(entry.relative_path)}
        onKeyDown={(event) => onKey(event, { entry, depth, label })}
        onContextMenu={(event) => menu(event, entry)}
        onDragStart={(event) => drag(event, entry)}
      >
        {Array.from({ length: depth }, (_, i) => <span key={i} className="file-tree-guide" style={{ left: 14 + i * 14 }} aria-hidden="true" />)}
        {entry.kind === 'dir'
          ? <><ChevronRight size={12} aria-hidden="true" className="file-tree-chevron" data-open={expanded || undefined} />{expanded ? <FolderOpen size={14} aria-hidden="true" className="file-tree-icon" /> : <Folder size={14} aria-hidden="true" className="file-tree-icon" />}</>
          : <><span className="file-tree-chevron-space" aria-hidden="true" /><FileIcon name={entry.name} /></>}
        <span className="file-tree-name">{label}</span>
        {loading.has(entry.relative_path) && <LoaderCircle size={11} className="motion-safe:animate-spin" aria-hidden="true" />}
        {entry.git && <span className="file-tree-git" title={t(`files.tree.git.${entry.git}` as I18nKey)}>{entry.git}</span>}
      </button>
    )
  }

  return (
    <div className="file-tree" data-testid="file-tree">
      <div className="file-tree-head">
        <SearchField label={t('files.tree.search')} value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1" />
        <button type="button" className="btn btn-quiet btn-icon btn-xs" title={t('files.tree.reveal')} aria-label={t('files.tree.reveal')} disabled={!activePath} onClick={() => void reveal()}>
          <Crosshair size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-quiet btn-icon btn-xs" title={t('files.tree.collapse')} aria-label={t('files.tree.collapse')} onClick={collapseAll}>
          <ChevronsDownUp size={14} aria-hidden="true" />
        </button>
      </div>
      {error && <p role="alert" className="file-tree-error">{error}</p>}
      {results !== null ? (
        <ul className="file-tree-results" data-testid="file-tree-results">
          {results.length === 0 && <li className="file-tree-empty">{t('files.tree.noMatch')}</li>}
          {results.map((file) => (
            <li key={file.path}>
              <button type="button" className="file-tree-row" onClick={() => openFile(file.path)} title={file.relative_path}>
                <FileIcon name={file.name} />
                <span className="file-tree-name">{file.name}</span>
                <span className="file-tree-dir">{file.relative_path.slice(0, -file.name.length).replace(/\/$/, '')}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div ref={listRef} role="tree" aria-label={t('files.tree.label')} className="file-tree-list">
          {loading.has('') && rows.length === 0 && <p className="file-tree-empty"><LoaderCircle size={12} className="inline motion-safe:animate-spin" aria-hidden="true" /> {t('files.tree.loading')}</p>}
          {!loading.has('') && !error && rows.length === 0 && <p className="file-tree-empty">{t('files.tree.empty')}</p>}
          {virtual
            ? <Virtualizer ref={virtRef} scrollRef={scrollRef} data={rows} bufferSize={240}>{(row) => renderRow(row)}</Virtualizer>
            : rows.map((row) => renderRow(row))}
        </div>
      )}
    </div>
  )
}
