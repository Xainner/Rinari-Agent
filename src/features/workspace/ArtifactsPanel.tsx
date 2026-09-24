import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type ArtifactSummary } from '../../services/engine'
import { useI18n } from '../../i18n'
import { artifactImageUrl, isArtifactImage } from '../files/artifactImage'

/** Galería de artefactos de la sesión: lista por URI + preview acotado. */
export default function ArtifactsPanel({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.artifactList(sessionId)
      setArtifacts(result.artifacts)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [sessionId])

  useEffect(() => {
    setSelected(null)
    setText(null)
    void reload()
  }, [reload])

  async function open(artifact: ArtifactSummary) {
    const uri = artifact.uri
    if (selected === uri) {
      setSelected(null)
      setText(null)
      setImage(null)
      return
    }
    try {
      // An image is shown as one; reading its bytes as text would print noise.
      if (isArtifactImage(uri, artifact.content_type)) {
        const url = await artifactImageUrl(uri)
        setSelected(uri)
        setImage(url)
        setText(null)
        setTruncated(false)
        return
      }
      const result = await engineApi.artifactRead(uri)
      setSelected(uri)
      setImage(null)
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
          {selected === artifact.uri && image !== null && (
            <div className="border-t border-[var(--border)] px-3 py-2">
              <img src={image} alt={artifact.name} className="artifact-image" />
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
