import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { useI18n } from '../i18n'
import Logo from './Logo'
import { useWindowBounds } from '../hooks/useWindowBounds'

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
  return (
    <div className="flex h-dvh flex-col overflow-hidden">

      <main className="relative flex min-h-0 flex-1 w-full items-center justify-center overflow-hidden bg-[var(--bg-app)]">
        <motion.div
          aria-hidden="true"
          className="absolute size-[420px] rounded-full bg-[var(--accent)]/15 blur-3xl"
          animate={{ scale: [0.9, 1.08, 0.9], opacity: [0.45, 0.8, 0.45] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative flex flex-col items-center text-center">
          <motion.div
            animate={failed ? undefined : { y: [0, -7, 0], rotate: [0, -1.5, 0, 1.5, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Logo size={104} radius="rounded-3xl" />
          </motion.div>
          <h1 className="font-display mt-5 text-2xl font-bold tracking-tight text-[var(--text)]">
            Rinari Agent
          </h1>
          {failed ? (
            <>
              <p className="mt-2 max-w-sm text-sm text-red-300">{detail || t('startup.failed')}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:border-[var(--accent)]/50"
              >
                <RotateCcw size={14} aria-hidden="true" />
                {t('startup.retry')}
              </button>
              <details className="mt-4 w-full max-w-sm text-left text-xs text-[var(--text-muted)]">
                <summary className="cursor-pointer hover:text-[var(--text)]">
                  {t('startup.details')}
                </summary>
                <pre className="mt-2 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono whitespace-pre-wrap">
                  {[state ? `state: ${state}` : null, detail ? `detail: ${detail}` : null]
                    .filter(Boolean)
                    .join('\n') || '—'}
                </pre>
              </details>
            </>
          ) : (
            <div role="status" aria-live="polite" className="mt-2 flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <span>{t('startup.loading')}</span>
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="size-1 rounded-full bg-[var(--accent-2)]"
                    animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: dot * 0.13 }}
                  />
                ))}
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
