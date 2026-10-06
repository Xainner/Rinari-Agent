/**
 * El único sitio que reproduce tonos de aviso.
 *
 * Los emisores piden una categoría; aquí se aplican las preferencias, se
 * agrupa una ráfaga (varios paneles que terminan a la vez suenan una vez, con
 * la categoría más importante) y se reproduce el tono local del paquete
 * elegido. Un fallo de audio no toca el turno ni encadena avisos.
 */
import { useSoundPrefs, type SoundCategory, type SoundPack } from '../stores/soundPrefs'

/** Más importante primero: en una ráfaga suena la de mayor prioridad. */
const PRIORITY: readonly SoundCategory[] = ['attention', 'error', 'reminder', 'success']
/** Ráfaga: lo que llega dentro de esta ventana se agrupa. */
export const SOUND_BURST_MS = 250

let pending: Set<SoundCategory> | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let player: (url: string, volume: number) => void = defaultPlayer

function defaultPlayer(url: string, volume: number): void {
  try {
    const audio = new Audio(url)
    audio.volume = volume
    void audio.play().catch(() => {})
  } catch {
    // Sin audio disponible: el aviso visual sigue.
  }
}

export function soundUrl(pack: SoundPack, category: SoundCategory): string {
  const base = typeof document !== 'undefined' ? document.baseURI : 'app://rinari/'
  return new URL(`sounds/${pack}/${category}.mp3`, base).toString()
}

/** ¿Los tonos de Rinari sustituyen al sonido de la notificación del sistema? */
export function ownSoundsEnabled(): boolean {
  return useSoundPrefs.getState().enabled
}

function flush(): void {
  timer = null
  const requested = pending
  pending = null
  if (!requested) return
  const prefs = useSoundPrefs.getState()
  const category = PRIORITY.find((item) => requested.has(item))
  if (!category || !prefs.enabled || !prefs.categories[category]) return
  player(soundUrl(prefs.pack, category), prefs.volume)
}

/** Pide un tono; las preferencias deciden si suena. */
export function requestSound(category: SoundCategory): void {
  const prefs = useSoundPrefs.getState()
  if (!prefs.enabled || !prefs.categories[category]) return
  pending ??= new Set()
  pending.add(category)
  if (timer === null) timer = setTimeout(flush, SOUND_BURST_MS)
}

/** «Probar»: suena ya, con el paquete y el volumen indicados, sin crear avisos. */
export function previewSound(category: SoundCategory, pack = useSoundPrefs.getState().pack): void {
  player(soundUrl(pack, category), useSoundPrefs.getState().volume)
}

export function setSoundPlayerForTests(next: ((url: string, volume: number) => void) | null): void {
  player = next ?? defaultPlayer
  pending = null
  if (timer !== null) clearTimeout(timer)
  timer = null
}
