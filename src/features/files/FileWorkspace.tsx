import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DocumentView } from '../documents/DocumentView'
import { documentKind } from '../documents/documentsApi'
import type { DocumentSource } from '../documents/useDocument'
import { Copy, ExternalLink, FileText, Film, FolderOpen, Music, Play, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { desktopApi, type FilePreview } from '../../services/desktop'
import { commandMessage, engineApi, isCommandError } from '../../services/engine'
import { copyText } from '../../lib/clipboard'
import Markdown, { CodeBlock } from '../../components/Markdown'
import HtmlPreview from './HtmlPreview'
import { artifactImageUrl, isArtifactImage, rememberArtifactImageSize, useArtifactImage } from './artifactImage'
import { MediaPlayer, mediaCandidate } from './MediaPlayer'

import { platform, type ContextMenuItem, type WorkspaceMedia } from '../../platform'
import { translate, useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'

type OpenFile = (path: string, turnId?: string) => void
/**
 * Lo que se puede hacer con un enlace a archivo, ya con su sesión y su base:
 * dentro de un documento abierto, los relativos parten de su carpeta.
 */
interface FileActions {
  /** Qué es el archivo y, si es imagen, audio o video, su URL servida por el host. */
  media: (path: string, turnId?: string) => Promise<WorkspaceMedia>
  open: OpenFile
  reveal: OpenFile
  openExternal: OpenFile
}
const FileContext = createContext<FileActions | null>(null)
/** La vista de texto del Engine: más grande, se ofrece abrir fuera. */
const TEXT_PREVIEW_LIMIT = 512 * 1024
export const FileTurnContext = createContext<string | undefined>(undefined)

export function localFileTarget(href: string): string | null {
  if (/^(https?:|mailto:|#)/i.test(href)) return null
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(href) &&
    !/^(artifact:|file:|[a-z]:[\\/])/i.test(href)
  )
    return null
  let path = href
  try {
    path = decodeURIComponent(path)
  } catch {
    /* retain literal path */
  }
  if (/^file:/i.test(path)) {
    path = path.replace(/^file:\/\//i, '')
    if (/^\/[a-z]:[\\/]/i.test(path)) path = path.slice(1)
  }
  return path.replace(/:(\d+)(?::\d+)?$/, '')
}

export function fileUrlTransform(url: string): string {
  if (/^(https?:|mailto:|#)/i.test(url) || localFileTarget(url) !== null)
    return url
  return ''
}

export function FileLink({
  href = '',
  children,
}: {
  href?: string
  children?: ReactNode
}) {
  const actions = useContext(FileContext)
  const turnId = useContext(FileTurnContext)
  const target = localFileTarget(href)
  return (
    <a
      href={href}
      data-file-path={target ?? undefined}
      onContextMenu={(e) => {
        // El menú se arma aquí, con la sesión, el turno y la base del enlace;
        // el global (DesktopContextMenu) respeta `defaultPrevented`.
        if (target === null || !actions || !platform().isDesktop()) return
        e.preventDefault()
        const lang = useUIStore.getState().lang
        const selection = window.getSelection()?.toString() ?? ''
        const items: ContextMenuItem[] = []
        if (selection) items.push({ kind: 'action', text: translate(lang, 'edit.copy'), run: () => void copyText(selection) })
        items.push({ kind: 'action', text: translate(lang, 'app.openFile'), run: () => actions.open(target, turnId) })
        if (!target.startsWith('artifact:')) {
          items.push({ kind: 'action', text: translate(lang, 'files.revealInFolder'), run: () => actions.reveal(target, turnId) })
        }
        items.push({ kind: 'action', text: translate(lang, 'app.copyAddress'), run: () => void copyText(target) })
        void platform().contextMenu.show(items, { x: e.clientX, y: e.clientY }).catch((error) => toast.error(String(error)))
      }}
      onClick={(e) => {
        if (target !== null && actions) {
          e.preventDefault()
          actions.open(target, turnId)
        } else if (/^(https?:|mailto:)/i.test(href)) {
          e.preventDefault()
          void platform().opener.openUrl(href).catch((error) =>
            toast.error(commandMessage(error)),
          )
        }
      }}
    >
      {children}
    </a>
  )
}

/**
 * Un enlace a un audio o un video en un mensaje lleva su reproductor debajo.
 * No se resuelve ni carga nada hasta que se pulsa «Reproducir»: un historial
 * largo con muchos medios no descarga ninguno por estar a la vista.
 */
export function InlineMedia({ href }: { href: string }) {
  const actions = useContext(FileContext)
  const turnId = useContext(FileTurnContext)
  const { t } = useI18n()
  const target = localFileTarget(href)
  const candidate = target ? mediaCandidate(target) : null
  const [state, setState] = useState<{ media?: WorkspaceMedia; error?: string; loading?: boolean }>({})
  if (!target || !candidate || !actions) return null
  const name = decodeURIComponent(target.split(/[\\/]/).pop() || target)
  if (state.media) {
    return (
      <span className="my-1.5 block" data-inline-media={candidate}>
        <MediaPlayer media={state.media} autoPlay onOpenExternal={() => actions.openExternal(target, turnId)} />
      </span>
    )
  }
  const Icon = candidate === 'audio' ? Music : Film
  const label = t(candidate === 'audio' ? 'files.playAudio' : 'files.playVideo', { name })
  // Pegado al enlace y en línea: no parte la frase en la que va.
  return (
    <span className="inline-flex items-center align-middle" data-inline-media={candidate}>
      <button
        type="button"
        disabled={state.loading}
        aria-label={label}
        title={label}
        onClick={() => {
          setState({ loading: true })
          actions.media(target, turnId)
            .then((media) => setState({ media }))
            .catch((error) => setState({ error: commandMessage(error) }))
        }}
        className="ml-1 inline-flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-60"
      >
        <Icon size={12} aria-hidden="true" />
        <Play size={10} aria-hidden="true" />
      </button>
      {state.error && <span role="alert" className="ml-1.5 text-xs text-red-400">{state.error}</span>}
    </span>
  )
}

/**
 * An image artifact inside a message. It keeps its aspect ratio within the
 * message width and opens in the file viewer; if it cannot be previewed it
 * stays a link to the artifact.
 */
export function ArtifactImage({ uri, alt = '' }: { uri: string; alt?: string }) {
  const open = useContext(FileContext)?.open
  const turnId = useContext(FileTurnContext)
  const { t } = useI18n()
  const { url, failed, width, height } = useArtifactImage(uri)
  if (failed) return <FileLink href={uri}>{alt || uri.split('/').at(-1)}</FileLink>
  if (!url) return <span className="artifact-image-pending" role="status">{t('files.imageLoading')}</span>
  // Con el tamaño conocido, el alto queda reservado antes de decodificar.
  const image = (
    <img
      src={url}
      alt={alt}
      className="artifact-image"
      width={width}
      height={height}
      onLoad={(event) => rememberArtifactImageSize(uri, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
    />
  )
  return open ? (
    <button type="button" className="artifact-image-open" title={t('files.openImage')} onClick={() => open(uri, turnId)}>
      {image}
    </button>
  ) : image
}

export type FileTab = {
  key: string
  sessionId: string
  turnId?: string
  target: string
  file?: FilePreview
  /** Data URL of an image artifact; `file` then only names it. */
  image?: string
  /**
   * Archivo local que no se lee como texto: imagen, video o audio con su URL
   * de la app, o cualquier otro (PDF, binario, texto enorme) sin vista interna.
   */
  media?: WorkspaceMedia
  /** Artefacto de texto mostrado solo en parte. */
  truncated?: boolean
  /** Office o PDF: lo muestra el visor documental con el render del Engine. */
  document?: DocumentSource
  error?: string
  watchId?: string
  revision?: number
  state?: 'changed' | 'deleted' | 'recreated'
  stale?: boolean
  syncError?: string
}

export interface FileWorkspaceController {
  sessionId: string
  tabs: FileTab[]
  selected: FileTab | undefined
  select: (key: string) => void
  close: (key: string) => void
  refresh: (key: string) => void
  open: OpenFile
  media: FileActions['media']
  reveal: OpenFile
  openExternal: OpenFile
  source: boolean
  setSource: (next: boolean | ((current: boolean) => boolean)) => void
}

const FileWorkspaceContext = createContext<FileWorkspaceController | null>(null)

export function useFileWorkspace(): FileWorkspaceController | null {
  return useContext(FileWorkspaceContext)
}

/**
 * Controlador de previews de archivo de una sesión.
 *
 * Mantiene las pestañas (indexadas por sesión, turno y destino) y el contexto
 * `openFile` que consumen los enlaces del transcript. La presentación es
 * `FileViewer`, montada en la superficie **Archivos** del dock de la sesión
 * (`SessionWorkspace`, compartido por Normal y Boards); `onOpen` revela esa
 * superficie. Las lecturas siguen pasando por el Engine.
 */
export function FileWorkspaceProvider({
  sessionId,
  children,
  onOpen,
  engineGeneration,
}: {
  sessionId: string
  children: ReactNode
  /** Se llama al abrir un archivo; el layout decide cómo mostrar el visor. */
  onOpen?: () => void
  /**
   * Generación del Engine (`EngineData.engineGeneration`). Los watches viven en
   * el proceso del Engine: cuando cambia, las pestañas se vuelven a inscribir.
   */
  engineGeneration?: number
}) {
  const [tabs, setTabs] = useState<FileTab[]>([])
  const [active, setActive] = useState('')
  const [source, setSource] = useState(false)
  const tabsRef = useRef<FileTab[]>([])
  // Identity survives refreshes, but never closing/reopening the same path.
  const owners = useRef(new Map<string, { sequence: number }>())
  const onOpenRef = useRef(onOpen)
  useEffect(() => {
    onOpenRef.current = onOpen
  })
  const currentTabs = useMemo(() => tabs.filter((tab) => tab.sessionId === sessionId), [tabs, sessionId])
  const selected = currentTabs.find((tab) => tab.key === active) ?? currentTabs.at(-1)

  const updateTabs = useCallback((update: (current: FileTab[]) => FileTab[]) => {
    const next = update(tabsRef.current)
    tabsRef.current = next
    setTabs(next)
  }, [])

  const readCurrent = useCallback(async (key: string, state?: FileTab['state'], revision?: number) => {
    const tab = tabsRef.current.find((candidate) => candidate.key === key)
    const owner = owners.current.get(key)
    if (!tab || !owner || tab.target.startsWith('artifact://')) return
    if (tab.document) {
      // Un documento no se relee como texto: se vuelve a abrir (un archivo
      // cambiado se importa como revisión nueva y se renderiza de nuevo).
      updateTabs((current) => current.map((candidate) => candidate.key === key ? { ...candidate, revision: (candidate.revision ?? 0) + 1 } : candidate))
      return
    }
    if (tab.media) {
      // Sin watch: refrescar pide otra URL, que vuelve a leer el archivo.
      const sequence = ++owner.sequence
      try {
        const media = await platform().files.media({ session_id: tab.sessionId, path: tab.target, turn_id: tab.turnId })
        if (owners.current.get(key) !== owner || owner.sequence !== sequence) return
        updateTabs((current) => current.map((candidate) => candidate.key === key ? { ...candidate, media, error: undefined, syncError: undefined, stale: false } : candidate))
      } catch (error) {
        if (owners.current.get(key) !== owner || owner.sequence !== sequence) return
        updateTabs((current) => current.map((candidate) => candidate.key === key ? { ...candidate, stale: true, syncError: commandMessage(error) } : candidate))
      }
      return
    }
    if (revision !== undefined) {
      if ((tab.revision ?? 0) >= revision) return
      updateTabs((current) => current.map((candidate) => candidate.key === key
        ? { ...candidate, state, revision }
        : candidate))
    }
    const sequence = ++owner.sequence
    const isCurrent = () => owners.current.get(key) === owner && owner.sequence === sequence
    if (state === 'deleted') {
      updateTabs((current) => current.map((candidate) => candidate.key === key
        ? { ...candidate, state, revision, stale: true, syncError: undefined }
        : candidate))
      return
    }
    try {
      const file = await desktopApi.readFile(tab.sessionId, tab.target, tab.turnId)
      if (!isCurrent()) return
      updateTabs((current) => current.map((candidate) => candidate.key === key
        ? revision !== undefined && candidate.revision !== revision
          ? candidate
          : { ...candidate, file, error: undefined, syncError: undefined, stale: false, state, revision: revision ?? candidate.revision }
        : candidate))
    } catch (error) {
      if (!isCurrent()) return
      updateTabs((current) => current.map((candidate) => candidate.key === key
        ? revision !== undefined && candidate.revision !== revision
          ? candidate
          : { ...candidate, stale: Boolean(candidate.file), syncError: commandMessage(error), state, revision: revision ?? candidate.revision }
        : candidate))
    }
  }, [updateTabs])

  const open = useCallback(async (target: string, turnId?: string) => {
    const key = JSON.stringify([sessionId, turnId, target])
    onOpenRef.current?.()
    setActive(key)
    const existing = tabsRef.current.find((tab) => tab.key === key)
    if (existing) {
      if (existing.file) void readCurrent(key)
      return
    }
    const owner = { sequence: 0 }
    owners.current.set(key, owner)
    const isCurrent = () => owners.current.get(key) === owner
    updateTabs((current) => [...current, { key, sessionId, turnId, target }])
    try {
      let file: FilePreview
      let watchId: string | undefined
      let image: string | undefined
      let media: WorkspaceMedia | undefined
      let truncated = false
      let document: DocumentSource | undefined
      const kind = documentKind(target)
      if (kind && (await platform().engine.status()).capabilities?.document_preview_v1) {
        // Un PPTX, DOCX, XLSX o PDF no se lee como texto: se ve su render.
        if (!isCurrent()) return
        document = target.startsWith('artifact://') || target.startsWith('rev_')
          ? { sessionId, ref: target, turnId }
          : { sessionId, path: target, turnId }
        file = { path: target, name: target.split(/[\\/]/).at(-1) || target, content: '', language: kind, size: 0 } as FilePreview
      } else if (isArtifactImage(target)) {
        image = await artifactImageUrl(target)
        file = { path: target, name: target.split('/').at(-1) || 'Artifact', content: '', language: '', size: 0 } as FilePreview
      } else if (target.startsWith('artifact://') && (await platform().engine.status()).capabilities?.artifact_resolve_v1
        && (media = await platform().files.media({ session_id: sessionId, path: target, turn_id: turnId })).kind !== 'text') {
        // Un audio o video guardado como artefacto se reproduce; leerlo como
        // texto mostraba bytes ilegibles.
        if (!isCurrent()) return
        file = { path: target, name: media.name, content: '', language: '', size: media.size } as FilePreview
      } else if (target.startsWith('artifact://')) {
        media = undefined
        const result = await engineApi.artifactRead(target, 512 * 1024)
        // Como en la lista de artefactos: el principio, con su aviso.
        truncated = result.truncated === true
        file = {
          path: target,
          name: target.split('/').at(-1) || 'Artifact',
          content: result.text,
          language: target.split('.').at(-1) || '',
          size: result.text.length,
        }
      } else {
        const status = await platform().engine.status()
        if (!isCurrent()) return
        if (status.capabilities?.workspace_file_resolve_v1) {
          // Qué es antes de leerlo: un video o un PNG grande no pasan por la
          // vista de texto (512 KiB, UTF-8).
          const described = await platform().files.media({ session_id: sessionId, path: target, turn_id: turnId })
          if (!isCurrent()) return
          if (described.kind !== 'text' || described.size > TEXT_PREVIEW_LIMIT) media = described
        }
        if (media) {
          file = { path: media.path, name: media.name, content: '', language: '', size: media.size } as FilePreview
        } else {
          try {
            if (!status.capabilities?.workspace_file_watch_v1) {
              throw Object.assign(new Error('legacy engine'), { code: 'UNKNOWN_METHOD' })
            }
            const watched = await desktopApi.watchFile(sessionId, target, turnId)
            file = watched.preview
            watchId = watched.watch_id
          } catch (error) {
            if (!isCommandError(error) || !['UNKNOWN_METHOD', 'UNKNOWN_COMMAND'].includes(error.code)) throw error
            file = await desktopApi.readFile(sessionId, target, turnId)
          }
        }
      }
      if (!isCurrent()) {
        if (watchId && typeof desktopApi.unwatchFile === 'function') void desktopApi.unwatchFile(sessionId, watchId).catch(() => {})
        return
      }
      updateTabs((current) =>
        current.map((tab) =>
          tab.key === key ? { ...tab, file, image, media, truncated, document, watchId, error: undefined } : tab,
        ),
      )
      // Covers changes emitted between watch registration and its response.
      if (watchId) void readCurrent(key)
    } catch (error) {
      if (!isCurrent()) return
      updateTabs((current) =>
        current.map((tab) =>
          tab.key === key ? { ...tab, error: commandMessage(error) } : tab,
        ),
      )
    }
  }, [readCurrent, sessionId, updateTabs])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void platform().events.onEngineEvent((message) => {
      if (message.event !== 'workspace.file.changed') return
      const payload = message.payload
      if (payload.session_id !== sessionId || typeof payload.watch_id !== 'string') return
      const tab = tabsRef.current.find((candidate) => candidate.watchId === payload.watch_id)
      if (!tab) return
      if (!Number.isSafeInteger(payload.revision) || (payload.revision as number) <= 0) return
      const state = payload.state
      if (state !== 'changed' && state !== 'deleted' && state !== 'recreated') return
      void readCurrent(tab.key, state, typeof payload.revision === 'number' ? payload.revision : undefined)
    }).then((stop) => { if (disposed) stop(); else unsubscribe = stop })
    return () => { disposed = true; unsubscribe?.() }
  }, [readCurrent, sessionId])

  /**
   * El registro de watches vive en el proceso del Engine y se pierde al
   * reiniciarlo: sin esto, las pestañas abiertas dejaban de sincronizarse sin
   * decirlo. Con cada Engine nuevo se vuelven a inscribir. Las revisiones
   * empiezan de nuevo, así que la monotonía se reinicia con el watch nuevo; si
   * el Engine nuevo no ofrece watches se recae en la lectura manual, y lo que
   * falle queda rotulado como desactualizado con su error.
   */
  const rewatch = useCallback(async (key: string) => {
    const tab = tabsRef.current.find((candidate) => candidate.key === key)
    const owner = owners.current.get(key)
    if (!tab || !owner) return
    const sequence = ++owner.sequence
    const isCurrent = () => owners.current.get(key) === owner && owner.sequence === sequence
    try {
      const watched = await desktopApi.watchFile(tab.sessionId, tab.target, tab.turnId)
      if (!isCurrent()) {
        void desktopApi.unwatchFile(tab.sessionId, watched.watch_id).catch(() => {})
        return
      }
      updateTabs((current) => current.map((candidate) => candidate.key === key
        ? { ...candidate, file: watched.preview, watchId: watched.watch_id, revision: 0, state: undefined, stale: false, syncError: undefined, error: undefined }
        : candidate))
    } catch (error) {
      if (!isCurrent()) return
      const legacy = isCommandError(error) && ['UNKNOWN_METHOD', 'UNKNOWN_COMMAND'].includes(error.code)
      updateTabs((current) => current.map((candidate) => candidate.key === key
        ? { ...candidate, watchId: undefined, revision: 0, ...(legacy ? {} : { stale: Boolean(candidate.file), syncError: commandMessage(error) }) }
        : candidate))
      if (legacy) void readCurrent(key)
    }
  }, [readCurrent, updateTabs])

  const seenGeneration = useRef(engineGeneration)
  useEffect(() => {
    const previous = seenGeneration.current
    seenGeneration.current = engineGeneration
    if (previous === undefined || engineGeneration === undefined || previous === engineGeneration) return
    const watched = tabsRef.current.filter((tab) => tab.sessionId === sessionId && tab.watchId)
    for (const tab of watched) void rewatch(tab.key)
  }, [engineGeneration, rewatch, sessionId])

  useEffect(() => () => {
    const owned = tabsRef.current.filter((tab) => tab.sessionId === sessionId)
    for (const tab of owned) owners.current.delete(tab.key)
    updateTabs((current) => current.filter((tab) => tab.sessionId !== sessionId))
    for (const tab of owned) {
      if (tab.watchId && typeof desktopApi.unwatchFile === 'function') void desktopApi.unwatchFile(tab.sessionId, tab.watchId).catch(() => {})
    }
  }, [sessionId, updateTabs])

  const close = useCallback((key: string) => {
    const closing = tabsRef.current.find((tab) => tab.key === key)
    owners.current.delete(key)
    updateTabs((current) => current.filter((tab) => tab.key !== key))
    if (closing?.watchId && typeof desktopApi.unwatchFile === 'function') void desktopApi.unwatchFile(closing.sessionId, closing.watchId).catch(() => {})
  }, [updateTabs])

  const controller = useMemo<FileWorkspaceController>(() => ({
    sessionId,
    tabs: currentTabs,
    selected,
    select: setActive,
    close,
    refresh: (key) => void readCurrent(key),
    open: (path, turnId) => void open(path, turnId),
    media: (path, turnId) => platform().files.media({ session_id: sessionId, path, turn_id: turnId }),
    reveal: (path, turnId) => void platform().files.revealInFolder({ session_id: sessionId, path, turn_id: turnId })
      .catch((error) => toast.error(commandMessage(error))),
    openExternal: (path, turnId) => void platform().files.openExternal({ session_id: sessionId, path, turn_id: turnId })
      .catch((error) => toast.error(commandMessage(error))),
    source,
    setSource,
  }), [sessionId, currentTabs, selected, close, open, readCurrent, source])

  return (
    <FileWorkspaceContext.Provider value={controller}>
      <FileContext.Provider value={controller}>{children}</FileContext.Provider>
    </FileWorkspaceContext.Provider>
  )
}

/** Presentación del visor: pestañas, ruta, acciones y contenido. */
export function FileViewer({ onClose, className = '' }: { onClose?: () => void; className?: string }) {
  const { t } = useI18n()
  const controller = useFileWorkspace()
  if (!controller) return null
  const { tabs: currentTabs, selected, select, close, refresh, open, reveal, openExternal, source, setSource } = controller
  const local = selected && !selected.target.startsWith('artifact:')
  // Base de los enlaces relativos de un documento abierto: su carpeta.
  const nested = (path: string) => !selected?.file || /^(?:[a-z]:[\\/]|\/|artifact:)/i.test(path)
    ? path
    : `${selected.file.path.replace(/[\\/][^\\/]*$/, '')}/${path}`
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg-app)] text-sm ${className}`}>
      <div className="flex items-center border-b border-[var(--border)]">
        <div
          role="tablist"
          aria-label={t('files.openTabs')}
          className="flex flex-1 overflow-x-auto"
        >
          {currentTabs.map((tab) => (
            <div
              key={tab.key}
              className={`flex shrink-0 items-center border-r border-[var(--border)] ${selected?.key === tab.key ? 'bg-[var(--bg-hover)]' : ''}`}
            >
              <button
                role="tab"
                aria-selected={selected?.key === tab.key}
                onClick={() => select(tab.key)}
                className="flex items-center gap-2 px-3 py-3"
              >
                <FileText size={14} />
                {tab.file?.name ?? tab.target.split(/[\\/]/).at(-1)}
              </button>
              <button
                aria-label={t('files.closeTab', { name: tab.file?.name ?? tab.target })}
                onClick={() => close(tab.key)}
                className="pr-2"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        {onClose && (
          <button aria-label={t('files.closeViewer')} onClick={onClose} className="p-3">
            <X size={16} />
          </button>
        )}
      </div>
      {selected ? (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--border)] p-2">
            <span
              title={selected.file?.path ?? selected.target}
              className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]"
            >
              {selected.file?.path ?? selected.target}
            </span>
            <button
              aria-label={t('files.copyPath')}
              onClick={() => void copyText(selected.file?.path ?? selected.target)}
            >
              <Copy size={14} />
            </button>
            <button aria-label={t('files.refresh')} onClick={() => refresh(selected.key)}>
              <RefreshCw size={14} />
            </button>
            {local && !(selected.file && ['html', 'htm'].includes(selected.file.language)) && (
              <button
                aria-label={t('files.openExternally')}
                title={t('files.openExternally')}
                onClick={() => openExternal(selected.file?.path ?? selected.target, selected.turnId)}
              >
                <ExternalLink size={14} />
              </button>
            )}
            {local && (
              <button
                aria-label={t('files.revealInFolder')}
                title={t('files.revealInFolder')}
                onClick={() => reveal(selected.file?.path ?? selected.target, selected.turnId)}
              >
                <FolderOpen size={14} />
              </button>
            )}
          </div>
          {selected.truncated && (
            <div role="status" className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
              {t('files.partialPreview')}
            </div>
          )}
          {(selected.file?.changed_since_turn || selected.stale || selected.syncError) && (
            <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {selected.syncError ?? (selected.state === 'deleted'
                ? t('files.deleted')
                : selected.file?.changed_since_turn ? t('files.changedSinceTurn') : t('files.stale'))}
            </div>
          )}
          {selected.file?.language === 'md' && (
            <button
              className="self-start px-3 py-2 text-xs"
              onClick={() => setSource((v) => !v)}
            >
              {source ? t('files.preview') : t('files.viewSource')}
            </button>
          )}
          <div
            role="tabpanel"
            className={`min-h-0 flex-1 overflow-auto ${selected.document || (selected.file && ['html', 'htm'].includes(selected.file.language) && !selected.target.startsWith('artifact:')) ? '' : 'p-4'}`}
          >
            {selected.error ? (
              <p role="alert">{selected.error}</p>
            ) : selected.document ? (
              <DocumentView
                key={`${selected.key}:${selected.revision ?? 0}`}
                source={selected.document}
                name={selected.file?.name ?? selected.target}
                headerActions={false}
                onOpenExternally={() => openExternal(selected.target, selected.turnId)}
                onReveal={selected.target.startsWith('artifact:') || selected.target.startsWith('rev_') ? undefined : () => reveal(selected.target, selected.turnId)}
              />
            ) : selected.media ? (
              <MediaView media={selected.media} onOpenExternally={() => openExternal(selected.target.startsWith('artifact:') ? selected.target : selected.media!.path, selected.turnId)} onReveal={selected.target.startsWith('artifact:') ? undefined : () => reveal(selected.media!.path, selected.turnId)} />
            ) : selected.image ? (
              <img src={selected.image} alt={selected.file?.name ?? ''} className="artifact-image mx-auto" />
            ) : selected.file &&
              ['html', 'htm'].includes(selected.file.language) &&
              selected.file.provenance !== 'turn_changeset' &&
              !selected.target.startsWith('artifact:') ? (
              <HtmlPreview
                key={selected.key}
                sessionId={selected.sessionId}
                turnId={selected.turnId}
                file={selected.file}
              />
            ) : selected.file ? (
              <FileTurnContext.Provider value={selected.turnId}>
                <FileContext.Provider
                  value={{
                    open: (path) => open(nested(path), selected.turnId),
                    media: (path) => controller.media(nested(path), selected.turnId),
                    reveal: (path) => reveal(nested(path), selected.turnId),
                    openExternal: (path) => openExternal(nested(path), selected.turnId),
                  }}
                >
                  {selected.file.language === 'md' && !source ? (
                    <Markdown>{selected.file.content}</Markdown>
                  ) : (
                    <CodeBlock
                      code={selected.file.content}
                      language={selected.file.language}
                    />
                  )}
                </FileContext.Provider>
              </FileTurnContext.Provider>
            ) : (
              <p role="status">{t('files.loading')}</p>
            )}
          </div>
        </>
      ) : (
        <p className="p-4 text-[var(--text-muted)]">
          {t('files.emptyHint')}
        </p>
      )}
    </div>
  )
}

/** Tamaño legible: «32,9 MB». */
function formatBytes(size: number, lang: string): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toLocaleString(lang, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`
}

/**
 * Imagen, video o audio del workspace, servidos por la app a partir de la ruta
 * que aprobó el Engine. El resto (PDF, binarios, textos enormes) no se lee: se
 * dice qué es y se ofrece abrirlo fuera o en su carpeta.
 */
function MediaView({ media, onOpenExternally, onReveal }: { media: WorkspaceMedia; onOpenExternally: () => void; onReveal?: () => void }) {
  const { t, lang } = useI18n()
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [media.url])
  if (media.url && !failed) {
    if (media.kind === 'image') return <img src={media.url} alt={media.name} className="artifact-image mx-auto" onError={() => setFailed(true)} />
    if (media.kind === 'video') {
      return <video key={media.url} src={media.url} controls preload="metadata" className="mx-auto max-h-full max-w-full" aria-label={media.name} onError={() => setFailed(true)} />
    }
    if (media.kind === 'audio') return <audio key={media.url} src={media.url} controls preload="metadata" className="w-full" aria-label={media.name} onError={() => setFailed(true)} />
  }
  const reason = failed
    ? t('files.mediaUnsupported')
    : media.kind === 'text' ? t('files.textTooLarge') : t('files.noInternalViewer')
  return (
    <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
      <FileText size={28} className="text-[var(--text-subtle)]" />
      <p className="text-sm text-[var(--text)]">{media.name}</p>
      <p className="text-xs text-[var(--text-muted)]">{formatBytes(media.size, lang)} · {media.mime}</p>
      <p className="text-xs text-[var(--text-muted)]">{reason}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onOpenExternally} className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
          <ExternalLink size={13} />{t('files.openExternally')}
        </button>
        {onReveal && (
          <button type="button" onClick={onReveal} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            <FolderOpen size={13} />{t('files.revealInFolder')}
          </button>
        )}
      </div>
    </div>
  )
}
