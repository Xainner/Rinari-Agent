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
import { Copy, ExternalLink, FileText, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { desktopApi, type FilePreview } from '../../services/desktop'
import { commandMessage, engineApi, isCommandError } from '../../services/engine'
import { copyText } from '../../lib/clipboard'
import Markdown, { CodeBlock } from '../../components/Markdown'
import HtmlPreview from './HtmlPreview'

import { platform } from '../../platform'
import { useI18n } from '../../i18n'

type OpenFile = (path: string, turnId?: string) => void
const FileContext = createContext<OpenFile | null>(null)
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
  const open = useContext(FileContext)
  const turnId = useContext(FileTurnContext)
  const target = localFileTarget(href)
  return (
    <a
      href={href}
      data-file-path={target ?? undefined}
      onClick={(e) => {
        if (target !== null && open) {
          e.preventDefault()
          open(target, turnId)
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

export type FileTab = {
  key: string
  sessionId: string
  turnId?: string
  target: string
  file?: FilePreview
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
}: {
  sessionId: string
  children: ReactNode
  /** Se llama al abrir un archivo; el layout decide cómo mostrar el visor. */
  onOpen?: () => void
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
      if (target.startsWith('artifact://')) {
        const result = await engineApi.artifactRead(target, 512 * 1024)
        if (result.truncated) throw new Error('La vista previa supera 512 KiB.')
        file = {
          path: target,
          name: target.split('/').at(-1) || 'Artifact',
          content: result.text,
          language: target.split('.').at(-1) || '',
          size: result.text.length,
        }
      } else {
        try {
          const status = await platform().engine.status()
          if (!isCurrent()) return
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
      if (!isCurrent()) {
        if (watchId && typeof desktopApi.unwatchFile === 'function') void desktopApi.unwatchFile(watchId).catch(() => {})
        return
      }
      updateTabs((current) =>
        current.map((tab) =>
          tab.key === key ? { ...tab, file, watchId, error: undefined } : tab,
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

  useEffect(() => () => {
    const owned = tabsRef.current.filter((tab) => tab.sessionId === sessionId)
    for (const tab of owned) owners.current.delete(tab.key)
    updateTabs((current) => current.filter((tab) => tab.sessionId !== sessionId))
    for (const watchId of owned.map((tab) => tab.watchId).filter((id): id is string => Boolean(id))) {
      if (typeof desktopApi.unwatchFile === 'function') void desktopApi.unwatchFile(watchId).catch(() => {})
    }
  }, [sessionId, updateTabs])

  const close = useCallback((key: string) => {
    const watchId = tabsRef.current.find((tab) => tab.key === key)?.watchId
    owners.current.delete(key)
    updateTabs((current) => current.filter((tab) => tab.key !== key))
    if (watchId && typeof desktopApi.unwatchFile === 'function') void desktopApi.unwatchFile(watchId).catch(() => {})
  }, [updateTabs])

  const controller = useMemo<FileWorkspaceController>(() => ({
    sessionId,
    tabs: currentTabs,
    selected,
    select: setActive,
    close,
    refresh: (key) => void readCurrent(key),
    open: (path, turnId) => void open(path, turnId),
    source,
    setSource,
  }), [sessionId, currentTabs, selected, close, open, readCurrent, source])

  return (
    <FileWorkspaceContext.Provider value={controller}>
      <FileContext.Provider value={controller.open}>{children}</FileContext.Provider>
    </FileWorkspaceContext.Provider>
  )
}

/** Presentación del visor: pestañas, ruta, acciones y contenido. */
export function FileViewer({ onClose, className = '' }: { onClose?: () => void; className?: string }) {
  const { t } = useI18n()
  const controller = useFileWorkspace()
  if (!controller) return null
  const { tabs: currentTabs, selected, select, close, refresh, open, source, setSource } = controller
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg-app)] text-sm ${className}`}>
      <div className="flex items-center border-b border-[var(--border)]">
        <div
          role="tablist"
          aria-label="Archivos abiertos"
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
                aria-label={`Cerrar ${tab.file?.name ?? tab.target}`}
                onClick={() => close(tab.key)}
                className="pr-2"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        {onClose && (
          <button aria-label="Cerrar visor" onClick={onClose} className="p-3">
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
              aria-label="Copiar ruta"
              onClick={() => void copyText(selected.file?.path ?? selected.target)}
            >
              <Copy size={14} />
            </button>
            <button aria-label={t('files.refresh')} onClick={() => refresh(selected.key)}>
              <RefreshCw size={14} />
            </button>
            {selected.file &&
              !selected.target.startsWith('artifact:') &&
              !['html', 'htm'].includes(selected.file.language) && (
                <button
                  aria-label="Abrir externamente"
                  onClick={() =>
                    void desktopApi
                      .openFile(selected.sessionId, selected.file!.path, selected.turnId)
                      .catch((error) => toast.error(commandMessage(error)))
                  }
                >
                  <ExternalLink size={14} />
                </button>
              )}
          </div>
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
              {source ? 'Vista previa' : 'Ver fuente'}
            </button>
          )}
          <div
            role="tabpanel"
            className={`min-h-0 flex-1 overflow-auto ${selected.file && ['html', 'htm'].includes(selected.file.language) && !selected.target.startsWith('artifact:') ? '' : 'p-4'}`}
          >
            {selected.error ? (
              <p role="alert">{selected.error}</p>
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
                  value={(path) => {
                    const nested =
                      !/^(?:[a-z]:[\\/]|\/|artifact:)/i.test(path)
                        ? `${selected.file!.path.replace(/[\\/][^\\/]*$/, '')}/${path}`
                        : path
                    open(nested, selected.turnId)
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
              <p role="status">Cargando archivo…</p>
            )}
          </div>
        </>
      ) : (
        <p className="p-4 text-[var(--text-muted)]">
          Abre un archivo desde la conversación.
        </p>
      )}
    </div>
  )
}
