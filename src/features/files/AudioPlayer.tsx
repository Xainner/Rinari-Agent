import { Pause, Play, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { useI18n } from '../../i18n'
import type { WorkspaceMedia } from '../../platform'
import { cachedPeaks, decorativePeaks, loadPeaks, resamplePeaks } from './audioPeaks'

const RATES = [1, 1.5, 2] as const
const SEEK_STEP = 5
const VOLUME_STEP = 0.05
const VOLUME_KEY = 'rinari.audio.volume'

/** El volumen se recuerda entre audios (y entre sesiones de la app, si el almacenamiento deja). */
let rememberedVolume: number | null = null
function storedVolume(): number {
  if (rememberedVolume !== null) return rememberedVolume
  let value = 1
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY)
    if (raw !== null && Number.isFinite(Number(raw))) value = Math.max(0, Math.min(1, Number(raw)))
  } catch {
    // Sin almacenamiento: al máximo.
  }
  rememberedVolume = value
  return value
}
function storeVolume(value: number) {
  rememberedVolume = value
  try { window.localStorage.setItem(VOLUME_KEY, String(value)) } catch { /* sin almacenamiento: solo en memoria */ }
}

/** «3:11» o «1:02:03» escrito en un texto (la descripción de un archivo entregado), en segundos. */
export function durationFromText(text: string | undefined | null): number | null {
  const match = text?.match(/(?:^|[^\d:])(\d{1,2}):([0-5]\d)(?::([0-5]\d))?(?![\d:])/)
  if (!match) return null
  const [, a, b, c] = match
  return c === undefined ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c)
}
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
 *
 * La duración sale de los metadatos (se piden solos, sin descargar el audio);
 * hasta entonces, la que diga `durationHint`. El volumen tiene su deslizador
 * junto al altavoz (al pasar o con foco; rueda y flechas) y se recuerda.
 * `lazyWave`: la onda real se calcula al primer ▶, no al montarse (una
 * tarjeta a la vista no descarga el audio entero).
 */
export function AudioPlayer({ media, autoPlay = false, lazyWave = false, durationHint = null, onPlay, onError }: {
  media: WorkspaceMedia
  autoPlay?: boolean
  lazyWave?: boolean
  durationHint?: number | null
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
  const [volume, setVolume] = useState(storedVolume)
  const [started, setStarted] = useState(!lazyWave)
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
    if (!media.url || peaks || !started) return
    let alive = true
    void loadPeaks(media.url, key, media.size).then((next) => { if (alive && next) setPeaks(next) })
    return () => { alive = false }
  }, [key, media.size, media.url, peaks, started])

  useEffect(() => {
    if (audio.current) audio.current.volume = storedVolume()
  }, [])

  useEffect(() => {
    const element = audio.current
    if (!autoPlay || !element) return
    // Sin permiso para sonar solo: queda en pausa, con ▶ a mano.
    void Promise.resolve(element.play()).catch(() => {})
  }, [autoPlay])

  const heights = peaks ? resamplePeaks(peaks, bars) : decorativePeaks(key, bars)
  const total = Number.isFinite(duration) && duration > 0 ? duration : durationHint ?? Number.NaN
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
  const changeVolume = (next: number) => {
    const element = audio.current
    const value = Math.round(Math.max(0, Math.min(1, next)) / VOLUME_STEP) * VOLUME_STEP
    if (element) {
      element.volume = value
      if (value > 0 && element.muted) element.muted = false
    }
    setVolume(value)
    storeVolume(value)
  }
  // La rueda sobre el volumen lo cambia y no desplaza la conversación (escucha no pasiva).
  const volumeBox = useRef<HTMLDivElement>(null)
  const volumeNow = useRef(volume)
  volumeNow.current = volume
  const changeVolumeRef = useRef(changeVolume)
  changeVolumeRef.current = changeVolume
  useEffect(() => {
    const element = volumeBox.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      changeVolumeRef.current(volumeNow.current + (event.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])
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
        onPlay={(event: SyntheticEvent<HTMLAudioElement>) => { setPlaying(true); setStarted(true); onPlay?.(event.currentTarget) }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => { if (!dragging.current) setCurrent(event.currentTarget.currentTime) }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onVolumeChange={(event) => { setMuted(event.currentTarget.muted); setVolume(event.currentTarget.volume) }}
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
        aria-valuemax={Number.isFinite(total) ? Math.round(total) : 0}
        aria-valuenow={Math.round(current)}
        aria-valuetext={t('audio.position', { current: clock(current), total: clock(total) })}
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
      <span className="audio-time" aria-hidden="true">{clock(current)}<span> / {clock(total)}</span></span>
      <div ref={volumeBox} className="audio-volume">
        <button type="button" className="audio-button" aria-label={muted ? t('audio.unmute') : t('audio.mute')} title={muted ? t('audio.unmute') : t('audio.mute')} aria-pressed={muted} onClick={() => { if (audio.current) audio.current.muted = !audio.current.muted }}>
          {muted || volume === 0 ? <VolumeX size={14} aria-hidden="true" /> : volume < 0.5 ? <Volume1 size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
        </button>
        <input
          type="range"
          className="audio-volume-range"
          min={0}
          max={1}
          step={VOLUME_STEP}
          value={muted ? 0 : volume}
          aria-label={t('audio.volume')}
          aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} %`}
          style={{ '--fill': `${Math.round((muted ? 0 : volume) * 100)}%` } as CSSProperties}
          onChange={(event) => changeVolume(Number(event.currentTarget.value))}
        />
      </div>
      <button type="button" className="audio-button audio-rate" aria-label={t('audio.speed', { rate: String(rate) })} title={t('audio.speed', { rate: String(rate) })} onClick={() => { if (audio.current) audio.current.playbackRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length] }}>
        {rate}×
      </button>
    </div>
  )
}
