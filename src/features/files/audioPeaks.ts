/**
 * La forma de onda real de un audio (ronda 1434, F). Se decodifica con
 * WebAudio sin bloquear (Chromium decodifica fuera del hilo; los picos se
 * reducen por tramos cediendo el hilo), una vez por archivo y de uno en uno,
 * y se guarda en memoria. Un archivo muy grande, un formato que no decodifica
 * o un host sin WebAudio no tienen onda: quedan las barras decorativas.
 */

/** Resolución guardada; cada reproductor la remuestrea a sus barras. */
export const PEAK_BUCKETS = 200
/** Más que esto no se descarga entero para dibujar la onda. */
export const MAX_PEAK_BYTES = 60 * 1024 * 1024
/** Muestras leídas como mucho por tramo y canal: acota el trabajo en audios largos. */
const SAMPLES_PER_BUCKET = 2048
/** Cada cuánto se cede el hilo mientras se reducen los picos. */
const SLICE_MS = 8

const cache = new Map<string, Float32Array>()
const pending = new Map<string, Promise<Float32Array | null>>()
let queue: Promise<unknown> = Promise.resolve()

export function cachedPeaks(key: string): Float32Array | null {
  return cache.get(key) ?? null
}

/** Pide los picos de `url` (guardados bajo `key`). Nunca rechaza: sin onda, `null`. */
export function loadPeaks(url: string, key: string, size?: number): Promise<Float32Array | null> {
  const known = cache.get(key)
  if (known) return Promise.resolve(known)
  const running = pending.get(key)
  if (running) return running
  if (typeof size === 'number' && size > MAX_PEAK_BYTES) return Promise.resolve(null)
  const job = queue
    .then(() => decodePeaks(url))
    .then((peaks) => {
      if (peaks) cache.set(key, peaks)
      return peaks
    })
    .catch(() => null)
    .finally(() => pending.delete(key))
  queue = job
  pending.set(key, job)
  return job
}

async function decodePeaks(url: string): Promise<Float32Array | null> {
  const Context = typeof window !== 'undefined' ? window.OfflineAudioContext : undefined
  if (!Context || typeof fetch !== 'function') return null
  const response = await fetch(url)
  if (!response.ok) return null
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_PEAK_BYTES) return null
  const data = await response.arrayBuffer()
  if (data.byteLength === 0 || data.byteLength > MAX_PEAK_BYTES) return null
  // Un contexto sin salida de sonido: solo para decodificar.
  const buffer = await new Context(1, 1, 44_100).decodeAudioData(data)
  return reducePeaks(buffer)
}

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Pico absoluto por tramo, normalizado a 0–1 (con un mínimo para que el silencio se vea). */
export async function reducePeaks(buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'getChannelData'>, buckets = PEAK_BUCKETS): Promise<Float32Array> {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
  const span = Math.max(1, Math.floor(buffer.length / buckets))
  const peaks = new Float32Array(buckets)
  let sliceStart = performance.now()
  let loudest = 0
  for (let bucket = 0; bucket < buckets; bucket++) {
    const from = bucket * span
    const to = Math.min(buffer.length, from + span)
    const step = Math.max(1, Math.floor((to - from) / SAMPLES_PER_BUCKET))
    let peak = 0
    for (const data of channels) {
      for (let index = from; index < to; index += step) {
        const value = Math.abs(data[index])
        if (value > peak) peak = value
      }
    }
    peaks[bucket] = peak
    if (peak > loudest) loudest = peak
    if (performance.now() - sliceStart > SLICE_MS) {
      await yieldToMain()
      sliceStart = performance.now()
    }
  }
  for (let bucket = 0; bucket < buckets; bucket++) peaks[bucket] = Math.max(0.06, loudest > 0 ? peaks[bucket] / loudest : 0)
  return peaks
}

/** Remuestrea los picos a `bars` barras (el máximo de cada grupo). */
export function resamplePeaks(peaks: Float32Array, bars: number): number[] {
  return Array.from({ length: bars }, (_, bar) => {
    const from = Math.floor((bar * peaks.length) / bars)
    const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / bars))
    let peak = 0
    for (let index = from; index < to; index++) if (peaks[index] > peak) peak = peaks[index]
    return peak
  })
}

/** Barras decorativas, siempre las mismas para el mismo archivo, mientras no hay onda (o si no puede haberla). */
export function decorativePeaks(key: string, bars: number): number[] {
  let seed = 0
  for (let index = 0; index < key.length; index++) seed = (seed * 31 + key.charCodeAt(index)) | 0
  return Array.from({ length: bars }, (_, bar) => {
    seed = (seed * 1103515245 + 12345) | 0
    const noise = ((seed >>> 8) % 1000) / 1000
    return 0.28 + 0.5 * Math.abs(Math.sin(bar * 0.55)) * 0.6 + noise * 0.3
  })
}

/** Solo tests. */
export function resetAudioPeaksForTests(): void {
  cache.clear()
  pending.clear()
  queue = Promise.resolve()
}
