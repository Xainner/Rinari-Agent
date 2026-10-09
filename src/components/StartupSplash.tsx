import { Check, Copy, RotateCcw } from 'lucide-react'
import { useI18n, type I18nKey } from '../i18n'
import { useWindowBounds } from '../hooks/useWindowBounds'
import { copyText } from '../lib/clipboard'
import { art } from '../features/rinari/art'

type Step = { key: I18nKey; state: 'done' | 'active' | 'pending' }

/**
 * Pasos del arranque a partir del estado real del Engine. No hay barra de
 * porcentaje: el arranque no informa progreso y no se inventa.
 */
export function startupSteps(state: string | null | undefined): Step[] {
  const connecting = state === 'handshaking'
  return [
    { key: 'startup.step.app', state: 'done' },
    { key: 'startup.step.core', state: connecting ? 'done' : 'active' },
    { key: 'startup.step.connect', state: connecting ? 'active' : 'pending' },
  ]
}

export default function StartupSplash({
  failed,
  detail,
  state,
  onRetry,
}: {
  failed: boolean
  detail?: string | null
  state?: string | null
  onRetry: () => void
}) {
  useWindowBounds()
  const { t } = useI18n()
  const technical = [state ? `state: ${state}` : null, detail ? `detail: ${detail}` : null].filter(Boolean).join('\n') || '—'
  return (
    <div className="startup">
      <div className="startup-sky" aria-hidden="true" />
      <main className="startup-stage">
        <div className="startup-halo" data-failed={failed || undefined} aria-hidden="true">
          <img src={art.chibi(failed ? 'oops' : 'wave')} alt="" draggable={false} />
        </div>
        {failed ? (
          <>
            <h1 className="startup-title">{t('startup.failedTitle')}</h1>
            <p className="startup-copy text-[var(--danger)]">{detail || t('startup.failed')}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={onRetry} className="btn btn-primary">
                <RotateCcw size={14} aria-hidden="true" />
                {t('startup.retry')}
              </button>
              <button type="button" onClick={() => void copyText(technical)} className="btn btn-ghost">
                <Copy size={14} aria-hidden="true" />
                {t('startup.copyDetails')}
              </button>
            </div>
            <details className="mt-4 w-full max-w-sm text-left text-xs text-[var(--text-muted)]">
              <summary className="cursor-pointer hover:text-[var(--text)]">{t('startup.details')}</summary>
              <pre className="mt-2 overflow-auto rounded-lg border border-[var(--line-2)] bg-[var(--bg-elevated)] p-3 font-mono whitespace-pre-wrap">{technical}</pre>
            </details>
          </>
        ) : (
          <>
            <h1 className="startup-title">{t('startup.loading')}</h1>
            <p className="startup-copy">{t('startup.loadingHint')}</p>
            <ol className="startup-steps" role="status" aria-live="polite">
              {startupSteps(state).map((step, index) => (
                <li key={step.key} data-state={step.state} style={{ animationDelay: `${index * 120}ms` }}>
                  <span className="startup-step-mark" aria-hidden="true">{step.state === 'done' ? <Check size={11} strokeWidth={3} /> : null}</span>
                  <span>{t(step.key)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  )
}
