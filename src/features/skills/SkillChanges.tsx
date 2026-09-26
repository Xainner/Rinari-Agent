import { useMemo } from 'react'
import { useI18n } from '../../i18n'
import { lineDiff, type DiffLine } from './skillsModel'

// Líneas sin cambios que se muestran alrededor de cada cambio.
const CONTEXT = 3

type Row = DiffLine | { kind: 'skipped'; count: number }

function withContext(lines: DiffLine[]): Row[] {
  const near = lines.map(() => false)
  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    for (let k = Math.max(0, index - CONTEXT); k <= Math.min(lines.length - 1, index + CONTEXT); k += 1) near[k] = true
  })
  const rows: Row[] = []
  let skipped = 0
  lines.forEach((line, index) => {
    if (near[index]) {
      if (skipped) rows.push({ kind: 'skipped', count: skipped })
      skipped = 0
      rows.push(line)
    } else skipped += 1
  })
  if (skipped) rows.push({ kind: 'skipped', count: skipped })
  return rows
}

const preClass =
  'max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-2 font-mono text-[11px] whitespace-pre-wrap text-[var(--text-muted)]'

/**
 * Qué cambió entre dos versiones de una SKILL.md: diff por líneas con contexto.
 * Si el texto es demasiado grande para compararlo, muestra ambas versiones.
 */
export default function SkillChanges({ before, after }: { before: string; after: string }) {
  const { t } = useI18n()
  const rows = useMemo(() => {
    const lines = lineDiff(before, after)
    return lines ? withContext(lines) : null
  }, [before, after])

  if (!rows) {
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <figure>
          <figcaption className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('skills.changes.before')}</figcaption>
          <pre className={preClass}>{before}</pre>
        </figure>
        <figure>
          <figcaption className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">{t('skills.changes.after')}</figcaption>
          <pre className={preClass}>{after}</pre>
        </figure>
      </div>
    )
  }
  if (!rows.some((row) => row.kind === 'added' || row.kind === 'removed')) {
    return <p className="text-xs text-[var(--text-subtle)]">{t('skills.changes.none')}</p>
  }
  return (
    <pre aria-label={t('skills.changes.diff')} className={preClass}>
      {rows.map((row, index) => {
        if (row.kind === 'skipped') {
          return (
            <div key={index} className="py-0.5 text-center text-[10px] text-[var(--text-subtle)] select-none">
              {t('skills.changes.skipped', { count: row.count })}
            </div>
          )
        }
        const tone = row.kind === 'added'
          ? 'bg-emerald-500/10 text-emerald-400'
          : row.kind === 'removed'
            ? 'bg-red-500/10 text-red-400'
            : ''
        const mark = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' '
        return (
          <div key={index} data-diff={row.kind} className={`flex ${tone}`}>
            <span aria-hidden className="w-4 shrink-0 select-none opacity-60">{mark}</span>
            <span className="min-w-0 flex-1">{row.text || ' '}</span>
          </div>
        )
      })}
    </pre>
  )
}
