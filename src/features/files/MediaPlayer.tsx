import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../i18n'
import type { WorkspaceMedia } from '../../platform'

/** Audio y video que el chat puede intentar reproducir (el Engine confirma el tipo por sus bytes). */
const AUDIO = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'weba'])
const VIDEO = new Set(['mp4', 'm4v', 'webm', 'mov', 'mkv', 'ogv', 'avi'])

export function mediaCandidate(target: string): 'audio' | 'video' | null {
  const extension = target.split(/[?#]/)[0].split('.').at(-1)?.toLowerCase() ?? ''
  if (AUDIO.has(extension)) return 'audio'
  if (VIDEO.has(extension)) return 'video'
  return null
}

/** Uno a la vez: empezar otro pausa el anterior (chat, panel y visor). */
let playing: HTMLMediaElement | null = null
function takeTurn(element: HTMLMediaElement) {
  if (playing && playing !== element && !playing.paused) playing.pause()
  playing = element
}

/**
 * Reproductor de un medio aprobado por el Engine y servido por el host por
 * tramos (`app://rinari/__media/…`). Sin autoplay salvo que se pida
 * (`autoPlay` tras un clic). Si Chromium no puede decodificarlo lo dice y
 * ofrece abrirlo con la aplicación del sistema.
 */
export function MediaPlayer({ media, autoPlay = false, onOpenExternal }: { media: WorkspaceMedia; autoPlay?: boolean; onOpenExternal?: () => void }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const playable = media.url && (media.kind === 'audio' || media.kind === 'video') && !failed
  if (!playable) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-muted)]" role="status">
        {failed ? t('files.mediaUnsupported') : t('files.noInternalViewer')}
        {onOpenExternal && (
          <button type="button" onClick={onOpenExternal} className="inline-flex items-center gap-1 font-semibold text-[var(--text)] underline-offset-2 hover:underline">
            <ExternalLink size={12} aria-hidden="true" />{t('files.openExternally')}
          </button>
        )}
      </span>
    )
  }
  const common = {
    src: media.url!,
    controls: true,
    autoPlay,
    preload: 'metadata' as const,
    'aria-label': media.name,
    onPlay: (event: React.SyntheticEvent<HTMLMediaElement>) => takeTurn(event.currentTarget),
    onError: () => setFailed(true),
  }
  return media.kind === 'audio'
    ? <audio {...common} className="media-player-audio block w-full max-w-md" />
    : <video {...common} className="media-player-video block max-h-80 w-full max-w-xl rounded-lg bg-black" />
}
