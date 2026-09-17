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
import { Copy, ExternalLink, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { desktopApi, type FilePreview } from '../../services/desktop'
import { commandMessage, engineApi } from '../../services/engine'
import { copyText } from '../../lib/clipboard'
import Markdown, { CodeBlock } from '../../components/Markdown'
import HtmlPreview from './HtmlPreview'

import { platform } from '../../platform'

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
}

export interface FileWorkspaceController {
  sessionId: string
  tabs: FileTab[]
  selected: FileTab | undefined
  select: (key: string) => void
  close: (key: string) => void
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
  const onOpenRef = useRef(onOpen)
  useEffect(() => {
    onOpenRef.current = onOpen
  })
  const currentTabs = useMemo(() => tabs.filter((tab) => tab.sessionId === sessionId), [tabs, sessionId])
  const selected = currentTabs.find((tab) => tab.key === active) ?? currentTabs.at(-1)

  const open = useCallback(async (target: string, turnId?: string) => {
    const key = JSON.stringify([sessionId, turnId, target])
    onOpenRef.current?.()
    setActive(key)
    setTabs((current) =>
      current.some((t) => t.key === key)
        ? current
        : [...current, { key, sessionId, turnId, target }],
    )
    try {
      let file: FilePreview
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
      } else file = await desktopApi.readFile(sessionId, target, turnId)
      setTabs((current) =>
        current.map((tab) =>
          tab.key === key ? { ...tab, file, error: undefined } : tab,
        ),
      )
    } catch (error) {
      setTabs((current) =>
        current.map((tab) =>
          tab.key === key ? { ...tab, error: commandMessage(error) } : tab,
        ),
      )
    }
  }, [sessionId])

  const controller = useMemo<FileWorkspaceController>(() => ({
    sessionId,
    tabs: currentTabs,
    selected,
    select: setActive,
    close: (key) => setTabs((current) => current.filter((t) => t.key !== key)),
    open: (path, turnId) => void open(path, turnId),
    source,
    setSource,
  }), [sessionId, currentTabs, selected, open, source])

  return (
    <FileWorkspaceContext.Provider value={controller}>
      <FileContext.Provider value={controller.open}>{children}</FileContext.Provider>
    </FileWorkspaceContext.Provider>
  )
}

/** Presentación del visor: pestañas, ruta, acciones y contenido. */
export function FileViewer({ onClose, className = '' }: { onClose?: () => void; className?: string }) {
  const controller = useFileWorkspace()
  if (!controller) return null
  const { tabs: currentTabs, selected, select, close, open, source, setSource } = controller
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
