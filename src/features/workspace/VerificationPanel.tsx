import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi } from '../../services/engine'
import { useI18n } from '../../i18n'

type RecordRow = Record<string, unknown>

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Color of a record's result. The Engine records `passed | failed | error |
 * skipped`; comparing with `'pass'` painted every success red.
 */
export function resultTone(result: string): string {
  if (result === 'passed') return 'text-emerald-400'
  if (result === 'failed' || result === 'error') return 'text-red-400'
  return 'text-[var(--text-muted)]'
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Verificación: última evidencia + plan sugerido por el engine. */
export default function VerificationPanel({
  path,
  changedFiles,
}: {
  path: string
  changedFiles: string[]
}) {
  const { t } = useI18n()
  const [records, setRecords] = useState<RecordRow[]>([])
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null)
  const [planning, setPlanning] = useState(false)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.verificationLatest(path)
      setRecords(result.records)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [path])

  useEffect(() => {
    setPlan(null)
    void reload()
  }, [reload])

  async function buildPlan() {
    setPlanning(true)
    try {
      const result = await engineApi.verificationPlan(path, changedFiles)
      setPlan(result.plan)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setPlanning(false)
    }
  }

  function commandGroup(label: string, commands: string[]) {
    if (commands.length === 0) return null
    return (
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-[var(--text-subtle)] uppercase">
          {label}
        </p>
        <ul className="mt-0.5 space-y-0.5">
          {commands.map((cmd) => (
            <li key={cmd} className="truncate font-mono text-[12px] text-[var(--text)]">
              {cmd}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            {t('workspace.verificationLatest')}
          </h3>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-[var(--border)] px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          >
            {t('workspace.refresh')}
          </button>
        </div>
        {records.length === 0 && (
          <p className="text-sm text-[var(--text-subtle)]">{t('workspace.verificationEmpty')}</p>
        )}
        {records.map((row, i) => (
          <div
            key={str(row['id']) || i}
            className="mb-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--accent-2)]">
                {str(row['kind'])}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text)]">
                {str(row['command'])}
              </span>
              <span
                className={`shrink-0 text-xs font-semibold ${resultTone(str(row['result']))}`}
              >
                {str(row['result'])}
              </span>
            </div>
            {str(row['summary']) !== '' && (
              <p className="mt-0.5 truncate text-xs text-[var(--text-subtle)]">
                {str(row['summary'])}
              </p>
            )}
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            {t('workspace.verificationPlan')}
          </h3>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void buildPlan()}
            disabled={planning}
            className="btn btn-primary btn-sm"
          >
            {planning ? t('workspace.planning') : t('workspace.buildPlan')}
          </button>
        </div>
        {plan && (
          <div className="space-y-2 rounded-xl border border-[var(--border)] px-3 py-2.5">
            {commandGroup(t('workspace.planTests'), list(plan['test_commands']))}
            {commandGroup(t('workspace.planLint'), list(plan['lint_commands']))}
            {commandGroup(t('workspace.planTypecheck'), list(plan['typecheck_commands']))}
            {commandGroup(t('workspace.planBuild'), list(plan['build_commands']))}
            {str(plan['risk']) !== '' && (
              <p className="text-xs text-[var(--text-subtle)]">
                {t('workspace.planRisk')}: {str(plan['risk'])}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
