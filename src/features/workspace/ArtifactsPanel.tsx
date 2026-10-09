import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, onEngineEvent, type ArtifactSummary } from '../../services/engine'
import { useI18n } from '../../i18n'
import { artifactImageUrl, isArtifactImage } from '../files/artifactImage'
import { MediaPlayer } from '../files/MediaPlayer'
import { platform, type WorkspaceMedia } from '../../platform'
import { useFileWorkspace } from '../files/FileWorkspace'
import { DocumentView } from '../documents/DocumentView'
import { documentKind } from '../documents/documentsApi'

/** Whether an Engine event may have added artifacts to the session. */
export function producedArtifacts(event: string, payload: Record<string, unknown> | undefined): boolean {
  if (event === 'turn.completed' || event === 'turn.failed' || event === 'turn.stopped') return true
  if (event !== 'tool.completed') return false
  const presentation = payload?.presentation as { artifacts?: unknown } | undefined
  if (Array.isArray(presentation?.artifacts) && presentation.artifacts.length > 0) return true
  return typeof payload?.observation === 'string' && payload.observation.includes('artifact://')
}

/** Si el Engine sabe decir qué es un artefacto sin leerlo (`artifact.resolve`). */
async function canResolveArtifacts(): Promise<boolean> {
  try {
    return (await platform().engine.status()).capabilities?.artifact_resolve_v1 === true
  } catch {
    return false
  }
}

/** Galería de artefactos de la sesión: lista por URI + preview acotado. */
export default function ArtifactsPanel({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [media, setMedia] = useState<WorkspaceMedia | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [document, setDocument] = useState<string | null>(null)
  const files = useFileWorkspace()

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.artifactList(sessionId)
      // Las capturas de un render son derivadas: se ven en el documento, no aquí.
      setArtifacts(result.artifacts.filter((artifact) => artifact.namespace !== 'previews'))
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [sessionId])

  useEffect(() => {
    setSelected(null)
    setText(null)
    void reload()
  }, [reload])

  // A tool that saves an artifact while the panel is open: without this the
  // list only caught up after switching tabs.
  useEffect(() => {
    let alive = true
    let timer: number | undefined
    let stop: (() => void) | undefined
    void onEngineEvent((event) => {
      if (event.payload?.session_id !== sessionId) return
      if (!producedArtifacts(event.event, event.payload)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { if (alive) void reload() }, 300)
    }).then((unsubscribe) => { if (alive) stop = unsubscribe; else unsubscribe() })
    return () => { alive = false; window.clearTimeout(timer); stop?.() }
  }, [reload, sessionId])

  async function open(artifact: ArtifactSummary) {
    const uri = artifact.uri
    if (selected === uri) {
      setSelected(null)
      setText(null)
      setImage(null)
      setMedia(null)
      setDocument(null)
      return
    }
    try {
      // Office y PDF: su render, no sus bytes como texto. En el visor de
      // archivos si existe; si no, aquí mismo.
      if (documentKind(artifact.name) && (await platform().engine.status()).capabilities?.document_preview_v1) {
        if (files) {
          files.open(uri)
          return
        }
        setSelected(uri)
        setImage(null)
        setMedia(null)
        setText(null)
        setDocument(uri)
        return
      }
      setDocument(null)
      // An image is shown as one; reading its bytes as text would print noise.
      if (isArtifactImage(uri, artifact.content_type)) {
        const url = await artifactImageUrl(uri)
        setSelected(uri)
        setImage(url)
        setMedia(null)
        setText(null)
        setTruncated(false)
        return
      }
      // Audio y video se reproducen (el Engine dice qué es por sus bytes);
      // leerlos como texto mostraba caracteres ilegibles.
      if (await canResolveArtifacts()) {
        const described = await platform().files.media({ session_id: sessionId, path: uri })
        if (described.kind === 'audio' || described.kind === 'video') {
          setSelected(uri)
          setImage(null)
          setText(null)
          setMedia(described)
          return
        }
      }
      const result = await engineApi.artifactRead(uri)
      setSelected(uri)
      setImage(null)
      setMedia(null)
      setText(result.text)
      setTruncated(result.truncated)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  if (artifacts.length === 0) {
    return <p className="text-sm text-[var(--text-subtle)]">{t('artifacts.empty')}</p>
  }

  return (
    <div className="space-y-1">
      {artifacts.map((artifact) => (
        <div key={artifact.uri} className="rounded-xl border border-[var(--border)]">
          <button
            type="button"
            onClick={() => void open(artifact)}
            className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text)]">
              {artifact.namespace}/{artifact.name}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--text-subtle)]">
              {artifact.byte_count} B
            </span>
          </button>
          {selected === artifact.uri && document !== null && (
            <div className="h-96 border-t border-[var(--border)]">
              <DocumentView source={{ sessionId, ref: artifact.uri }} name={artifact.name} />
            </div>
          )}
          {selected === artifact.uri && image !== null && (
            <div className="border-t border-[var(--border)] px-3 py-2">
              <img src={image} alt={artifact.name} className="artifact-image" />
            </div>
          )}
          {selected === artifact.uri && media !== null && (
            <div className="border-t border-[var(--border)] px-3 py-2">
              <MediaPlayer
                media={media}
                onOpenExternal={() => void platform().files.openExternal({ session_id: sessionId, path: artifact.uri }).catch((err) => toast.error(commandMessage(err)))}
              />
            </div>
          )}
          {selected === artifact.uri && text !== null && (
            <div className="border-t border-[var(--border)] px-3 py-2">
              <pre className="max-h-64 overflow-auto text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--text-muted)]">
                {text}
              </pre>
              {truncated && (
                <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
                  {t('artifacts.truncated')}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
