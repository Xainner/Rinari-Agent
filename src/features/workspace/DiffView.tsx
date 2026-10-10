import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'

export interface DiffRow {
  kind: 'hunk' | 'context' | 'add' | 'del' | 'meta'
  text: string
  oldLine?: number
  newLine?: number
  /** Tramo cambiado dentro de la línea, [inicio, fin) en `text`. */
  change?: [number, number]
}

/**
 * Lee un diff unificado de git. Las cabeceras (`diff --git`, `index`, `---`,
 * `+++`) se omiten; los hunks numeran cada línea en el original y en el nuevo.
 */
export function parseUnifiedDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldLine = 0
  let newLine = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('new file mode') || line.startsWith('deleted file mode') || line.startsWith('similarity ') || line.startsWith('rename ')) continue
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      rows.push({ kind: 'hunk', text: line })
      continue
    }
    if (line.startsWith('\\')) { rows.push({ kind: 'meta', text: line.slice(1).trim() }); continue }
    if (line.startsWith('+')) rows.push({ kind: 'add', text: line.slice(1), newLine: newLine++ })
    else if (line.startsWith('-')) rows.push({ kind: 'del', text: line.slice(1), oldLine: oldLine++ })
    else if (rows.length > 0 || line) rows.push({ kind: 'context', text: line.startsWith(' ') ? line.slice(1) : line, oldLine: oldLine++, newLine: newLine++ })
  }
  // Una línea quitada seguida de una añadida: se marca el tramo que cambió.
  for (let i = 0; i < rows.length - 1; i++) {
    let dels = 0
    while (rows[i + dels]?.kind === 'del') dels++
    let adds = 0
    while (rows[i + dels + adds]?.kind === 'add') adds++
    if (dels > 0 && dels === adds) {
      for (let k = 0; k < dels; k++) markChange(rows[i + k], rows[i + dels + k])
      i += dels + adds - 1
    }
  }
  while (rows.length && rows[rows.length - 1].kind === 'context' && !rows[rows.length - 1].text) rows.pop()
  return rows
}

function markChange(before: DiffRow, after: DiffRow) {
  const a = before.text
  const b = after.text
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  // Si cambió casi todo, el resaltado no ayuda.
  if (endA - start > a.length * 0.85 && endB - start > b.length * 0.85) return
  if (endA > start) before.change = [start, endA]
  if (endB > start) after.change = [start, endB]
}

export function diffStats(rows: DiffRow[]): { added: number; removed: number } {
  return rows.reduce((acc, row) => ({ added: acc.added + (row.kind === 'add' ? 1 : 0), removed: acc.removed + (row.kind === 'del' ? 1 : 0) }), { added: 0, removed: 0 })
}

function Text({ row }: { row: DiffRow }) {
  if (!row.change) return <>{row.text || ' '}</>
  const [from, to] = row.change
  return <>{row.text.slice(0, from)}<mark className={row.kind === 'add' ? 'diff-word-add' : 'diff-word-del'}>{row.text.slice(from, to)}</mark>{row.text.slice(to)}</>
}

/** Diff legible: números de línea, verde lo añadido, rojo lo quitado, y el tramo exacto que cambió. */
export default function DiffView({ diff, truncated = false }: { diff: string; truncated?: boolean }) {
  const { t } = useI18n()
  const rows = useMemo(() => parseUnifiedDiff(diff), [diff])
  const [split, setSplit] = useState(false)
  const stats = diffStats(rows)
  if (rows.length === 0) return <p className="px-3 py-2 text-xs text-[var(--text-subtle)]">{t('workspace.diffEmpty')}</p>
  return (
    <div className="diff-view">
      <div className="diff-toolbar">
        <span className="diff-added">+{stats.added}</span>
        <span className="diff-removed">−{stats.removed}</span>
        <span className="flex-1" />
        <div className="diff-mode" role="group" aria-label={t('workspace.diffMode')}>
          <button type="button" aria-pressed={!split} onClick={() => setSplit(false)}>{t('workspace.diffUnified')}</button>
          <button type="button" aria-pressed={split} onClick={() => setSplit(true)}>{t('workspace.diffSplit')}</button>
        </div>
      </div>
      <div className="diff-body">
        {split ? <SplitRows rows={rows} /> : rows.map((row, index) => row.kind === 'hunk' || row.kind === 'meta'
          ? <div key={index} className={cn('diff-hunk', row.kind === 'meta' && 'is-meta')}>{row.text}</div>
          : <div key={index} className={cn('diff-row', `is-${row.kind}`)}>
              <span className="diff-num">{row.oldLine ?? ''}</span>
              <span className="diff-num">{row.newLine ?? ''}</span>
              <span className="diff-sign" aria-hidden="true">{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ''}</span>
              <code><Text row={row} /></code>
            </div>)}
      </div>
      {truncated && <p className="diff-truncated">{t('workspace.truncated')}</p>}
    </div>
  )
}

/** Lado a lado: lo quitado a la izquierda y lo añadido a la derecha, alineados por bloque. */
function SplitRows({ rows }: { rows: DiffRow[] }) {
  const pairs: Array<[DiffRow | null, DiffRow | null] | DiffRow> = []
  for (let i = 0; i < rows.length;) {
    const row = rows[i]
    if (row.kind === 'hunk' || row.kind === 'meta') { pairs.push(row); i++; continue }
    if (row.kind === 'context') { pairs.push([row, row]); i++; continue }
    const dels: DiffRow[] = []
    const adds: DiffRow[] = []
    while (rows[i]?.kind === 'del') dels.push(rows[i++])
    while (rows[i]?.kind === 'add') adds.push(rows[i++])
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) pairs.push([dels[k] ?? null, adds[k] ?? null])
  }
  return <>{pairs.map((pair, index) => !Array.isArray(pair)
    ? <div key={index} className={cn('diff-hunk', pair.kind === 'meta' && 'is-meta')}>{pair.text}</div>
    : <div key={index} className="diff-split">
        <Side row={pair[0]} line={pair[0]?.oldLine} />
        <Side row={pair[1]} line={pair[1]?.newLine} />
      </div>)}</>
}

function Side({ row, line }: { row: DiffRow | null; line?: number }) {
  if (!row) return <div className="diff-row is-empty"><span className="diff-num" /><code /></div>
  return <div className={cn('diff-row', `is-${row.kind}`)}><span className="diff-num">{line ?? ''}</span><code><Text row={row} /></code></div>
}
