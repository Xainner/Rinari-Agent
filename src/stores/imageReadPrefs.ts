import { create } from 'zustand'

/** Cómo va una imagen al modelo: sus píxeles, el texto reconocido (OCR) o los dos. */
export type ImageReadMode = 'image' | 'text' | 'both'

const KEY = 'rinari.images.defaultMode'
const MODES: readonly ImageReadMode[] = ['image', 'text', 'both']

function load(): ImageReadMode {
  try {
    const value = window.localStorage.getItem(KEY)
    return MODES.includes(value as ImageReadMode) ? (value as ImageReadMode) : 'image'
  } catch {
    return 'image'
  }
}

/**
 * «Cómo enviar imágenes por defecto» (Ajustes → Visión, plan 0.4.0 #77). Casi
 * siempre es «Imagen»; si el modelo no ve, el composer manda el texto solo.
 */
export const useImageReadPrefs = create<{ mode: ImageReadMode; setMode: (mode: ImageReadMode) => void }>((set) => ({
  mode: typeof window === 'undefined' ? 'image' : load(),
  setMode: (mode) => {
    try {
      window.localStorage.setItem(KEY, mode)
    } catch {
      // Sin almacenamiento: dura lo que la ventana.
    }
    set({ mode })
  },
}))

/** Los campos del adjunto para un modo. */
export function readModeFields(mode: ImageReadMode): { ocr?: boolean; keepImage?: boolean } {
  return { ocr: mode !== 'image', keepImage: mode === 'both' ? true : undefined }
}

export function readModeOf(file: { ocr?: boolean; keepImage?: boolean }): ImageReadMode {
  return !file.ocr ? 'image' : file.keepImage ? 'both' : 'text'
}
