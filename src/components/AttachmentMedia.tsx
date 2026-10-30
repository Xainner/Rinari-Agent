import { useEffect, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import type { AttachmentRef } from '../types'
import { useI18n } from '../i18n'
import { commandMessage } from '../services/engine'
import { platform, type WorkspaceMedia } from '../platform'
import { MediaPlayer } from '../features/files/MediaPlayer'

/** An audio or a video attached by the owner (#57): it plays where it is. */
export function isPlayableAttachment(attachment: Pick<AttachmentRef, 'kind'>): boolean {
  return attachment.kind === 'audio' || attachment.kind === 'video'
}

/**
 * The player of an attached audio or video. It plays the copy Rinari keeps
 * (`artifact://…`), which is what travelled with the message, so it works the
 * same in the composer and in the history. Nothing loads until it is opened.
 */
export function AttachmentPlayer({ sessionId, attachment, onClose }: { sessionId: string; attachment: AttachmentRef; onClose: () => void }) {
  const { t } = useI18n()
  const [state, setState] = useState<{ media?: WorkspaceMedia; error?: string }>({})
  const source = attachment.uri
  useEffect(() => {
    if (!source) return
    let alive = true
    setState({})
    platform().files.media({ session_id: sessionId, path: source })
      .then((media) => { if (alive) setState({ media }) })
      .catch((error) => { if (alive) setState({ error: commandMessage(error) }) })
    return () => { alive = false }
  }, [sessionId, source])
  return (
    <div className="attach-player" data-kind={attachment.kind} data-testid="attachment-player">
      <div className="attach-player-head">
        <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
        <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('attach.closePlayer', { name: attachment.name })} onClick={onClose}>
          <X size={12} aria-hidden="true" />
        </button>
      </div>
      {state.media
        ? <MediaPlayer media={state.media} autoPlay />
        : state.error
          ? <p role="alert" className="attach-player-error">{state.error}</p>
          : <p role="status" className="attach-player-loading"><LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> {t('attach.playerLoading')}</p>}
    </div>
  )
}
