import { create } from 'zustand'

/**
 * El navegador de Rinari (plan 0.4.0 #46): con qué buscador se busca un texto
 * escrito en la barra, y los sitios recientes y fijados de cada proyecto que
 * enseña la página de inicio. Todo local: la página de inicio no carga nada
 * de internet por sí sola.
 */

export type SearchEngine = 'duckduckgo' | 'google' | 'bing' | 'brave'

export const SEARCH_ENGINES: Record<SearchEngine, { label: string; url: string }> = {
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=' },
}

export interface BrowserPlace {
  url: string
  title: string
  /** Cuándo se visitó o se fijó, en ms. */
  at: number
}

const KEY = 'rinari.browser.v1'
const MAX_RECENT = 12
const MAX_PINNED = 24
/** Las conversaciones sin proyecto comparten esta clave. */
export const CHAT_KEY = '__chat__'

interface Stored {
  engine: SearchEngine
  recent: Record<string, BrowserPlace[]>
  pinned: Record<string, BrowserPlace[]>
}

function load(): Stored {
  const empty: Stored = { engine: 'duckduckgo', recent: {}, pinned: {} }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<Stored>
    return {
      engine: parsed.engine && parsed.engine in SEARCH_ENGINES ? parsed.engine : 'duckduckgo',
      recent: parsed.recent && typeof parsed.recent === 'object' ? parsed.recent : {},
      pinned: parsed.pinned && typeof parsed.pinned === 'object' ? parsed.pinned : {},
    }
  } catch {
    return empty
  }
}

function save(state: Stored): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ engine: state.engine, recent: state.recent, pinned: state.pinned }))
  } catch {
    // Sin almacenamiento: dura lo que la ventana.
  }
}

/** Solo lo que se puede volver a abrir: páginas web, no `about:` ni archivos internos. */
export function rememberable(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

interface BrowserPrefsState extends Stored {
  setEngine(engine: SearchEngine): void
  recordVisit(projectKey: string, place: { url: string; title?: string }): void
  togglePin(projectKey: string, place: { url: string; title?: string }): void
  isPinned(projectKey: string, url: string): boolean
}

export const useBrowserPrefs = create<BrowserPrefsState>((set, get) => ({
  ...(typeof window === 'undefined' ? { engine: 'duckduckgo', recent: {}, pinned: {} } : load()),
  setEngine: (engine) => {
    set({ engine })
    save(get())
  },
  recordVisit: (projectKey, place) => {
    if (!rememberable(place.url)) return
    const list = get().recent[projectKey] ?? []
    const previous = list.find((item) => item.url === place.url)
    const entry: BrowserPlace = { url: place.url, title: place.title || previous?.title || '', at: Date.now() }
    if (previous && previous.title === entry.title && list[0]?.url === place.url) return
    const next = [entry, ...list.filter((item) => item.url !== place.url)].slice(0, MAX_RECENT)
    set({ recent: { ...get().recent, [projectKey]: next } })
    save(get())
  },
  togglePin: (projectKey, place) => {
    if (!rememberable(place.url)) return
    const list = get().pinned[projectKey] ?? []
    const next = list.some((item) => item.url === place.url)
      ? list.filter((item) => item.url !== place.url)
      : [...list, { url: place.url, title: place.title ?? '', at: Date.now() }].slice(-MAX_PINNED)
    set({ pinned: { ...get().pinned, [projectKey]: next } })
    save(get())
  },
  isPinned: (projectKey, url) => (get().pinned[projectKey] ?? []).some((item) => item.url === url),
}))

/**
 * Lo escrito en la barra: una dirección se abre (con `https://`, o `http://`
 * para localhost), y un texto se busca con el buscador elegido.
 */
export function addressToUrl(text: string, engine: SearchEngine): string {
  const value = text.trim()
  if (!value) return ''
  if (/^(https?:\/\/|about:)/i.test(value)) return value
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(value)) return `http://${value}`
  const looksLikeHost = !/\s/.test(value) && /^[^/?#]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(value)
  if (looksLikeHost) return `https://${value}`
  return `${SEARCH_ENGINES[engine].url}${encodeURIComponent(value)}`
}
