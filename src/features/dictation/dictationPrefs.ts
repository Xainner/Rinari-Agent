import { create } from 'zustand'

/**
 * Preferencias de dictado propias del escritorio. El modelo, el idioma y el
 * vocabulario los guarda el Engine (`speech.settings`); esto es solo cómo se
 * comporta el composer al terminar de dictar.
 */
export interface DictationPrefs {
  /** Enviar el mensaje en cuanto termina la transcripción. Apagado: se revisa y se pulsa Enter. */
  sendOnFinish: boolean
}

const KEY = 'rinari.dictation.v1'
export const DEFAULT_DICTATION_PREFS: DictationPrefs = { sendOnFinish: false }

function load(): DictationPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<DictationPrefs> | null
    return { sendOnFinish: raw?.sendOnFinish === true }
  } catch {
    return { ...DEFAULT_DICTATION_PREFS }
  }
}

interface DictationPrefsState extends DictationPrefs {
  setSendOnFinish: (value: boolean) => void
}

export const useDictationPrefs = create<DictationPrefsState>((set) => ({
  ...load(),
  setSendOnFinish: (value) => {
    set({ sendOnFinish: value })
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ sendOnFinish: value }))
    } catch {
      // A blocked storage keeps the choice for this session only.
    }
  },
}))
