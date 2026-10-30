import { useEffect, useState, type RefObject } from 'react'
import { desktopApi } from '../../services/desktop'
import { engineApi } from '../../services/engine'
import { platform } from '../../platform'
import { ACTIVE_JOB, documentsApi, type DocumentJob } from '../documents/documentsApi'

/**
 * Whether the element is on screen or close to it: a long history with many
 * deliveries does not read or render any until it scrolls near. Without
 * IntersectionObserver (tests, an old host) it counts as visible.
 */
export function useNearView(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const element = ref.current
    if (near || !element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect() }
    }, { rootMargin: '240px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [near, ref])
  return near
}

type Loaded<T> = { value?: T; failed: boolean }

/** The same read once per session, path and turn while the app is open. */
function remembered<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let pending = cache.get(key)
  if (!pending) {
    pending = load()
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
    if (cache.size > 64) cache.delete(cache.keys().next().value as string)
  }
  return pending
}

function useLoaded<T>(key: string | null, load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ failed: false })
  useEffect(() => {
    if (!key) return
    let alive = true
    setState({ failed: false })
    load().then((value) => { if (alive) setState({ value, failed: false }) }, () => { if (alive) setState({ failed: true }) })
    return () => { alive = false }
    // `load` follows `key`: same key, same read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

const heads = new Map<string, Promise<string>>()

/** The first lines of a text file the Engine can read (CSV, Markdown, code). */
export function useTextHead(sessionId: string | null, path: string | undefined, turnId: string | undefined, enabled: boolean): Loaded<string> {
  // Un archivo guardado se lee del almacén por su URI, sin pasar por una
  // conversación (en la oficina de un equipo no hay ninguna).
  const stored = Boolean(path?.startsWith('artifact://'))
  const key = enabled && path && (stored || sessionId) ? (stored ? path : `${sessionId}|${turnId ?? ''}|${path}`) : null
  const read = stored
    ? () => engineApi.artifactRead(path!, 16 * 1024).then((result) => result.text.slice(0, 4000))
    : () => desktopApi.readFile(sessionId!, path!, turnId).then((file) => file.content.slice(0, 4000))
  return useLoaded(key, () => remembered(heads, key!, read))
}

/** The first rows of a CSV or TSV, quotes included; at most `rows` × `cols`. */
export function parseDelimited(text: string, delimiter: ',' | '\t', rows = 5, cols = 6): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length && out.length < rows; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1 } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === delimiter) { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (row.some((value) => value.trim())) out.push(row.slice(0, cols))
      row = []
    } else cell += char
  }
  if (out.length < rows && (cell || row.length)) { row.push(cell); if (row.some((value) => value.trim())) out.push(row.slice(0, cols)) }
  return out
}

export interface FirstPage { uri: string | null; pages: number | null }

const firstPages = new Map<string, Promise<FirstPage>>()

/** Waits for a render job by its event, with a poll in case one is lost. */
function finished(sessionId: string, job: DocumentJob): Promise<DocumentJob> {
  if (!ACTIVE_JOB.has(job.status)) return Promise.resolve(job)
  return new Promise((resolve) => {
    let stop: (() => void) | undefined
    let done = false
    const finish = (next: DocumentJob) => {
      if (done || ACTIVE_JOB.has(next.status)) return
      done = true
      window.clearInterval(timer)
      stop?.()
      resolve(next)
    }
    void platform().events.onEngineEvent((message) => {
      if (message.event !== 'document.job.updated') return
      const next = message.payload as unknown as DocumentJob
      if (next.session_id === sessionId && next.job_id === job.job_id) finish(next)
    }).then((unsubscribe) => { if (done) unsubscribe(); else stop = unsubscribe })
    const timer = window.setInterval(() => {
      void documentsApi.job(sessionId, job.job_id).then(finish).catch(() => undefined)
    }, 2500)
  })
}

/**
 * The first page of a PDF or an Office file, rendered by the Engine the same
 * way «Archivos» shows it (the render stays cached for that view). Office
 * without LibreOffice has no render: the card keeps its icon.
 */
export function useFirstPage(sessionId: string | null, path: string | undefined, turnId: string | undefined, enabled: boolean): Loaded<FirstPage> {
  const key = enabled && sessionId && path ? `${sessionId}|${turnId ?? ''}|${path}` : null
  return useLoaded(key, () => remembered(firstPages, key!, async () => {
    const ref = (await documentsApi.importFile(sessionId!, path!, turnId)).revision.id
    const inspection = await documentsApi.inspect(sessionId!, ref)
    const revisionId = inspection.revision.id
    const { preview } = await documentsApi.preview(sessionId!, revisionId)
    if (preview && preview.pages.length > 0) return { uri: preview.pages[0].uri, pages: preview.pages.length }
    const job = await finished(sessionId!, await documentsApi.render(sessionId!, revisionId))
    const pages = job.result?.pages ?? []
    if (!pages.length) throw new Error(job.error?.message ?? 'no preview')
    return { uri: pages[0].uri, pages: job.result?.page_count ?? pages.length }
  }))
}

/** Only for tests: forgets what was read. */
export function resetPresentedPreviewsForTests() {
  heads.clear()
  firstPages.clear()
}
