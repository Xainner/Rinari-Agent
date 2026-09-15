import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { copyText } from '../../lib/clipboard'
import type { ProcessOutput } from '../../types/protocol.generated'

/** Normaliza controles para presentación de texto: sin ANSI/OSC ejecutable. */
export function normalizeLogText(text: string): string {
  const ESC = ''
  return (
    text
      // OSC hipervínculos y secuencias (terminados en BEL o ST).
      .replace(new RegExp(`${ESC}\\][^\\x07]*(?:\\x07|${ESC}\\\\)`, 'g'), '')
      // Secuencias CSI/ANSI de estilo y cursor.
      .replace(new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g'), '')
      // Retornos de carro de barras de progreso: nueva línea, sin reescritura.
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Otros controles salvo tabulación y salto de línea.
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  )
}

/** FNV-1a de 32 bits: barato para detectar cambios de igual longitud. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function highlightMatches(text: string, query: string): ReactNode {  if (query === '') return text
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const parts: ReactNode[] = []
  let index = 0
  let key = 0
  for (;;) {
    const found = lower.indexOf(needle, index)
    if (found === -1) break
    if (found > index) parts.push(text.slice(index, found))
    parts.push(<mark key={key++}>{text.slice(found, found + query.length)}</mark>)
    index = found + query.length
  }
  parts.push(text.slice(index))
  return parts
}

/**
 * Snapshot de salida: reemplaza, no concatena. La búsqueda es literal y
 * local; pausar congela el texto pero no el proceso; copiar captura el
 * snapshot del clic con nota de parcialidad.
 */
export default function ProcessLogView({
  output,
  paused,
  onPausedChange,
}: {
  output: ProcessOutput | null
  paused: boolean
  onPausedChange: (paused: boolean) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [following, setFollowing] = useState(true)
  const [copyNote, setCopyNote] = useState<'ok' | 'error' | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const frozenRef = useRef<ProcessOutput | null>(null)

  if (paused && frozenRef.current === null && output !== null) {
    frozenRef.current = output
  }
  if (!paused && frozenRef.current !== null) {
    frozenRef.current = null
  }
  const shown = paused ? (frozenRef.current ?? output) : output

  const stdout = useMemo(() => normalizeLogText(shown?.stdout ?? ''), [shown?.stdout])
  const stderr = useMemo(() => normalizeLogText(shown?.stderr ?? ''), [shown?.stderr])
  // La longitud sola pierde updates del mismo tamaño (contadores, spinners).
  const signature = `${hashText(stdout)}:${hashText(stderr)}:${shown?.truncated === true}`

  const searching = query !== ''
  const matchCount = useMemo(() => {
    if (!searching) return 0
    const needle = query.toLowerCase()
    let count = 0
    let index = 0
    const haystack = `${stdout}\n${stderr}`.toLowerCase()
    for (;;) {
      const found = haystack.indexOf(needle, index)
      if (found === -1) return count
      count += 1
      index = found + query.length
      if (count > 9999) return count
    }
  }, [stdout, stderr, query, searching])

  // Al buscar se detiene el seguimiento para no desplazar coincidencias.
  useEffect(() => {
    if (searching) setFollowing(false)
  }, [searching])

  const [changedWhileAway, setChangedWhileAway] = useState(false)
  const lastSignatureRef = useRef(signature)
  useEffect(() => {
    if (lastSignatureRef.current !== signature) {
      lastSignatureRef.current = signature
      if (!following) {
        setChangedWhileAway(true)
      } else {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      }
    }
  }, [signature, following])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    setFollowing(atEnd)
    if (atEnd) setChangedWhileAway(false)
  }

  function goToEnd() {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    setFollowing(true)
    setChangedWhileAway(false)
  }

  async function copyVisible() {
    // Capturar el contenido al hacer clic, antes de cualquier await.
    const snapshot = shown
    if (!snapshot) return
    const parts = [`stdout:\n${normalizeLogText(snapshot.stdout)}`]
    if (snapshot.stderr) parts.push(`stderr:\n${normalizeLogText(snapshot.stderr)}`)
    let text = parts.join('\n\n')
    if (snapshot.truncated) text += `\n\n[${t('processes.outputPartial')}]`
    const ok = await copyText(text)
    setCopyNote(ok ? 'ok' : 'error')
    window.setTimeout(() => setCopyNote(null), 2500)
  }

  return (
    <div className="processes-log">
      <div className="processes-log-bar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('processes.logSearch')}
          aria-label={t('processes.logSearch')}
          className="processes-search"
        />
        {searching && (
          <span role="status" className="processes-note">
            {matchCount === 0 ? t('processes.logNoMatches') : t('processes.logMatches', { n: matchCount })}
          </span>
        )}
        <button type="button" onClick={() => onPausedChange(!paused)} aria-pressed={paused} className="processes-action">
          {paused ? t('processes.logResume') : t('processes.logPause')}
        </button>
        <button type="button" onClick={() => void copyVisible()} className="processes-action">
          {t('processes.logCopy')}
        </button>
        {copyNote === 'ok' && (
          <span role="status" className="processes-note">
            {t('processes.logCopied')}
          </span>
        )}
        {copyNote === 'error' && (
          <span role="alert" className="processes-error">
            {t('processes.logCopyFailed')}
          </span>
        )}
      </div>
      {paused && (
        <p role="status" className="processes-note">
          {t('processes.logPausedNote')}
        </p>
      )}
      <div ref={scrollRef} onScroll={handleScroll} className="processes-log-scroll" tabIndex={0}>
        {shown == null ? (
          <p className="processes-empty">{t('processes.loading')}</p>
        ) : stdout === '' && stderr === '' ? (
          <p className="processes-empty">{t('processes.logEmpty')}</p>
        ) : (
          <>
            <p className="processes-stderr-label">{t('processes.logStdout')}</p>
            <pre className="processes-pre">{searching ? highlightMatches(stdout, query) : stdout}</pre>
            {stderr !== '' && (
              <>
                <p className="processes-stderr-label">{t('processes.logStderr')}</p>
                <pre className="processes-pre processes-stderr">{searching ? highlightMatches(stderr, query) : stderr}</pre>
              </>
            )}
            {shown.truncated && <p className="processes-note">{t('processes.outputPartial')}</p>}
          </>
        )}
      </div>
      {changedWhileAway && !following && (
        <button type="button" onClick={goToEnd} className="processes-link">
          {t('processes.logFollow')}
        </button>
      )}
    </div>
  )
}
