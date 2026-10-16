import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { useI18n } from '../../i18n'
import type { WorkspaceMedia } from '../../platform'
import { cachedPeaks, decorativePeaks, loadPeaks, resamplePeaks } from './audioPeaks'

const RATES = [1, 1.5, 2] as const
const SEEK_STEP = 5
/** Ancho de una barra más su hueco. */
const BAR_PITCH = 5

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–:––'
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/**
 * El reproductor de audio de Rinari (ronda 1434, F): el `<audio>` sin los
 * controles de Chromium y encima el diseño de la app. Reproducir y pausar,
 * la onda real (barras decorativas mientras se calcula, o si no se puede) que
 * sirve de barra de progreso y se pulsa o arrastra para saltar, el tiempo,
 * silenciar y la velocidad. Con teclado: la onda es un deslizador (← →
 * cinco segundos, Inicio, Fin). Mide lo mismo parado que sonando.
 */
export function AudioPlayer({ media, autoPlay = false, onPlay, onError }: {
  media: WorkspaceMedia
  autoPlay?: boolean
  onPlay?: (element: HTMLMediaElement) => void
  onError?: () => void
}) {
  const { t } = useI18n()
  const audio = useRef<HTMLAudioElement>(null)
  const wave = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(Number.NaN)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState<(typeof RATES)[number]>(1)
  const [bars, setBars] = useState(48)
  const key = `${media.path}:${media.size}`
  const [peaks, setPeaks] = useState<Float32Array | null>(() => cachedPeaks(key))

  // Cuántas barras caben.
  useLayoutEffect(() => {
    const element = wave.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth
      if (width > 0) setBars(Math.max(16, Math.min(120, Math.floor(width / BAR_PITCH))))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // La onda real, una vez por archivo; mientras tanto (o si falla), las decorativas.
  useEffect(() => {
    if (!media.url || peaks) return
    let alive = true
    void loadPeaks(media.url, key, media.size).then((next) => { if (alive && next) setPeaks(next) })
    return () => { alive = false }
  }, [key, media.size, media.url, peaks])

  useEffect(() => {
    const element = audio.current
    if (!autoPlay || !element) return
    // Sin permiso para sonar solo: queda en pausa, con ▶ a mano.
    void Promise.resolve(element.play()).catch(() => {})
  }, [autoPlay])

  const heights = peaks ? resamplePeaks(peaks, bars) : decorativePeaks(key, bars)
  const progress = Number.isFinite(duration) && duration > 0 ? Math.min(1, current / duration) : 0
  const playedBars = Math.round(progress * bars)

  const seekTo = (seconds: number) => {
    const element = audio.current
    if (!element || !Number.isFinite(duration)) return
    const next = Math.max(0, Math.min(duration, seconds))
    element.currentTime = next
    setCurrent(next)
  }
  const seekAt = (clientX: number) => {
    const rect = wave.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    seekTo(((clientX - rect.left) / rect.width) * duration)
  }
  const dragging = useRef(false)
  const toggle = () => {
    const element = audio.current
    if (!element) return
    if (element.paused) void Promise.resolve(element.play()).catch(() => {})
    else element.pause()
  }

  return (
    <div className="audio-player" data-playing={playing || undefined} data-wave={peaks ? 'real' : 'decorative'}>
      <audio
        ref={audio}
        src={media.url ?? undefined}
        preload="metadata"
        aria-label={media.name}
        onPlay={(event: SyntheticEvent<HTMLAudioElement>) => { setPlaying(true); onPlay?.(event.currentTarget) }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => { if (!dragging.current) setCurrent(event.currentTarget.currentTime) }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        onRateChange={(event) => setRate((RATES as readonly number[]).includes(event.currentTarget.playbackRate) ? (event.currentTarget.playbackRate as (typeof RATES)[number]) : 1)}
        onError={() => onError?.()}
      />
      <button type="button" className="audio-play" aria-label={playing ? t('audio.pause') : t('audio.play')} title={playing ? t('audio.pause') : t('audio.play')} onClick={toggle}>
        {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </button>
      <div
        ref={wave}
        className="audio-wave"
        role="slider"
        tabIndex={0}
        aria-label={t('audio.seek')}
        aria-valuemin={0}
        aria-valuemax={Number.isFinite(duration) ? Math.round(duration) : 0}
        aria-valuenow={Math.round(current)}
        aria-valuetext={t('audio.position', { current: clock(current), total: clock(duration) })}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          dragging.current = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
          seekAt(event.clientX)
        }}
        onPointerMove={(event) => { if (dragging.current) seekAt(event.clientX) }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); seekTo(current - SEEK_STEP) }
          else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); seekTo(current + SEEK_STEP) }
          else if (event.key === 'Home') { event.preventDefault(); seekTo(0) }
          else if (event.key === 'End') { event.preventDefault(); seekTo(duration) }
          else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle() }
        }}
      >
        {heights.map((height, index) => <i key={index} data-played={index < playedBars || undefined} style={{ '--h': `${Math.round(height * 100)}%` } as CSSProperties} />)}
      </div>
      <span className="audio-time" aria-hidden="true">{clock(current)}<span> / {clock(duration)}</span></span>
      <button type="button" className="audio-button" aria-label={muted ? t('audio.unmute') : t('audio.mute')} title={muted ? t('audio.unmute') : t('audio.mute')} aria-pressed={muted} onClick={() => { if (audio.current) audio.current.muted = !audio.current.muted }}>
        {muted ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
      </button>
      <button type="button" className="audio-button audio-rate" aria-label={t('audio.speed', { rate: String(rate) })} title={t('audio.speed', { rate: String(rate) })} onClick={() => { if (audio.current) audio.current.playbackRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length] }}>
        {rate}×
      </button>
    </div>
  )
}
