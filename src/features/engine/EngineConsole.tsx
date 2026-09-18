import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, onEngineEvent, type EngineEventMsg } from '../../services/engine'
import { Section } from '../../components/settings/parts'
import type { EngineSession } from './useEngineSession'

import { platform } from '../../platform'

interface LogLine {
  key: number
  text: string
  kind: 'delta' | 'info' | 'error'
}

let lineKey = 0

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Vista Motor: estado del proceso, acciones y registro de eventos del protocolo. */
export default function EngineConsole({ session }: { session: EngineSession }) {
  const { t } = useI18n()
  const [lines, setLines] = useState<LogLine[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const state = session.status?.state ?? 'stopped'

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void onEngineEvent((event: EngineEventMsg) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>
      const str = (v: unknown): string => (typeof v === 'string' ? v : '')
      let line: LogLine | null = null
      if (event.event === 'model.content.delta') {
        line = { key: lineKey++, text: truncate(str(payload.delta), 160), kind: 'delta' }
      } else if (event.event === 'turn.failed') {
        line = {
          key: lineKey++,
          text: `turn.failed: ${commandMessage(payload.error)}`,
          kind: 'error',
        }
      } else {
        line = { key: lineKey++, text: event.event, kind: 'info' }
      }
      setLines((prev) => [...prev.slice(-199), line as LogLine])
    }).then((stop) => {
      unlisten = stop
    })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines])

  /** Sonda autoinformante: invoca turn_start con sesión vacía a propósito.
   * El backend actual la rechaza con su guard (mensaje con versión); si
   * responde otra cosa, el binario en ejecución no es el código actual. */
  async function diagnose() {
    const push = (text: string, kind: LogLine['kind']) =>
      setLines((prev) => [...prev.slice(-199), { key: lineKey++, text, kind }])
    push('diag: turn_start(session_id="") …', 'info')
    try {
      const raw = await platform().command('turn_start', { session_id: '', message: 'ping' })
      push(`diag: turn_start OK inesperado: ${JSON.stringify(raw)}`, 'error')
    } catch (err) {
      push(`diag: turn_start → ${commandMessage(err)}`, 'error')
    }
    try {
      const listed = await engineApi.providerList()
      push(`diag: providers=${listed.providers.length}`, 'info')
    } catch (err) {
      push(`diag: providerList → ${commandMessage(err)}`, 'error')
    }
  }

  return (
    <div className="mx-auto h-full max-w-3xl space-y-4 overflow-y-auto px-4 py-6">
      <Section title={t('engine.title')}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-semibold">
            {t(`engine.${state}` as 'engine.ready')}
          </span>
          {session.status?.engine_version && <span>v{session.status.engine_version}</span>}
          {session.status?.protocol_version != null && (
            <span className="text-[var(--text-subtle)]">
              protocolo {session.status.protocol_version}
            </span>
          )}
        </div>
        {session.status?.detail && (
          <p className="text-xs text-[var(--text-subtle)]">{session.status.detail}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {(state === 'stopped' || state === 'failed') && (
            <button
              type="button"
              onClick={() => void session.startEngine()}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-hover)]"
            >
              {t('engine.retry')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void session.restartEngine()}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
          >
            {t('engine.restart')}
          </button>
          <button
            type="button"
            onClick={() => void diagnose()}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
          >
            {t('engine.diag')}
          </button>
        </div>
      </Section>

      <Section title="eventos">
        <div
          ref={logRef}
          className="max-h-96 min-h-32 overflow-y-auto rounded-xl bg-black/30 p-3 font-mono text-xs leading-relaxed"
        >
          {lines.length === 0 && (
            <p className="text-[var(--text-subtle)]">—</p>
          )}
          {lines.map((line) => (
            <p
              key={line.key}
              className={
                line.kind === 'error'
                  ? 'text-red-400'
                  : line.kind === 'info'
                    ? 'text-[var(--text-subtle)]'
                    : 'text-[var(--text)]'
              }
            >
              {line.text}
            </p>
          ))}
        </div>
      </Section>
    </div>
  )
}
