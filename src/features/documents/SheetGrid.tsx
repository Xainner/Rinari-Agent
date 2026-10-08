import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, LoaderCircle, Sigma } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage } from '../../services/engine'
import { documentsApi } from './documentsApi'

const PAGE_ROWS = 200
const MAX_COLUMNS = 52

interface GridCell { cell: string; value: unknown; formula?: boolean; cached?: unknown; format?: string }
interface GridRow { row: number; cells: GridCell[] }
interface RangeResult { sheet: string; sheets?: string[]; dimension?: string | null; rows: GridRow[]; next_cursor?: number | null }

function letters(index: number): string {
  let out = ''
  let n = index + 1
  while (n > 0) {
    const rest = (n - 1) % 26
    out = String.fromCharCode(65 + rest) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function columnIndex(address: string): number {
  const match = /^([A-Z]+)/.exec(address)
  if (!match) return 0
  return match[1].split('').reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1
}

/** Columnas a mostrar según la dimensión declarada, con un tope razonable. */
function columnsOf(dimension: string | null | undefined, rows: GridRow[]): number {
  const fromCells = rows.reduce((max, row) => row.cells.reduce((m, cell) => Math.max(m, columnIndex(cell.cell) + 1), max), 0)
  const end = dimension?.split(':')[1] ?? dimension ?? ''
  const declared = end ? columnIndex(end) + 1 : 0
  return Math.min(MAX_COLUMNS, Math.max(fromCells, declared, 6))
}

function display(value: unknown, format?: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && format?.includes('%')) {
    const decimals = /\.(0+)%/.exec(format)?.[1].length ?? 0
    return `${(value * 100).toFixed(decimals)}%`
  }
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 6 })
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

/**
 * Una hoja leída por el Engine, como cuadrícula: valores o fórmulas, y la
 * caché de cada fórmula aparte. Una fórmula sin resultado calculado se ve
 * como pendiente, nunca como un número.
 */
export function SheetGrid({ sessionId, revisionId }: { sessionId: string; revisionId: string }) {
  const { t } = useI18n()
  const [sheet, setSheet] = useState<string>()
  const [sheets, setSheets] = useState<string[]>([])
  const [rows, setRows] = useState<GridRow[]>([])
  const [dimension, setDimension] = useState<string | null>()
  const [loadedTo, setLoadedTo] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [showFormulas, setShowFormulas] = useState(false)
  const [selected, setSelected] = useState<GridCell | null>(null)

  const columns = useMemo(() => columnsOf(dimension, rows), [dimension, rows])
  const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`

  const load = useCallback(async (name: string | undefined, from: number, append: boolean) => {
    setLoading(true)
    setError(undefined)
    try {
      const last = letters(MAX_COLUMNS - 1)
      const range = `A${from}:${last}${from + PAGE_ROWS - 1}`
      const result = await documentsApi.range(sessionId, revisionId, name ? `${quoted(name)}!${range}` : range) as unknown as RangeResult
      setSheet(result.sheet)
      if (result.sheets) setSheets(result.sheets)
      setDimension(result.dimension)
      setRows((previous) => (append ? [...previous, ...result.rows] : result.rows))
      const declaredRows = Number(/\d+$/.exec(result.dimension ?? '')?.[0] ?? 0)
      const reached = result.next_cursor ? result.next_cursor - 1 : from + PAGE_ROWS - 1
      setLoadedTo(reached)
      setHasMore(Boolean(result.next_cursor) || declaredRows > reached)
    } catch (err) {
      setError(commandMessage(err))
    } finally {
      setLoading(false)
    }
  }, [revisionId, sessionId])

  useEffect(() => { void load(undefined, 1, false) }, [load])

  const byRow = useMemo(() => {
    const map = new Map<number, Map<number, GridCell>>()
    for (const row of rows) {
      const cells = new Map<number, GridCell>()
      for (const cell of row.cells) cells.set(columnIndex(cell.cell), cell)
      map.set(row.row, cells)
    }
    return map
  }, [rows])
  const rowNumbers = useMemo(() => {
    const max = rows.reduce((m, row) => Math.max(m, row.row), 0)
    return Array.from({ length: Math.max(max, Math.min(loadedTo, 30)) }, (_, i) => i + 1)
  }, [loadedTo, rows])
  const pending = rows.some((row) => row.cells.some((cell) => cell.formula && (cell.cached === null || cell.cached === undefined)))

  if (error) return <p role="alert" className="p-6 text-center text-sm text-red-400">{error}</p>
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="sheet-grid">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 text-[11px]">
        <span className="font-mono text-[var(--text-subtle)]">{selected?.cell ?? ''}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[var(--text)]" title={selected ? display(selected.value) : undefined}>
          {selected ? display(selected.value) : ''}
          {selected?.formula && (
            <span className="ml-2 text-[var(--text-muted)]">
              = {selected.cached === null || selected.cached === undefined ? t('documents.sheet.pending') : display(selected.cached)}
            </span>
          )}
        </span>
        <button type="button" aria-pressed={showFormulas} onClick={() => setShowFormulas((value) => !value)}
          className={cn('inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5', showFormulas ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)]')}>
          <Sigma size={12} aria-hidden="true" />{t('documents.sheet.formulas')}
        </button>
      </div>
      {pending && (
        <p className="flex items-center gap-1.5 border-b border-[var(--border)] bg-amber-400/5 px-3 py-1 text-[11px] text-amber-300">
          <AlertTriangle size={11} aria-hidden="true" />{t('documents.sheet.pendingNotice')}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse font-mono text-[11px]">
          <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)]">
            <tr>
              <th className="sticky left-0 z-20 w-10 border border-[var(--border)] bg-[var(--bg-subtle)]" />
              {Array.from({ length: columns }, (_, col) => (
                <th key={col} scope="col" className="min-w-[88px] border border-[var(--border)] px-1 font-normal text-[var(--text-subtle)]">{letters(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowNumbers.map((number) => {
              const cells = byRow.get(number)
              return (
                <tr key={number}>
                  <th scope="row" className="sticky left-0 border border-[var(--border)] bg-[var(--bg-subtle)] px-1 text-right font-normal text-[var(--text-subtle)]">{number}</th>
                  {Array.from({ length: columns }, (_, col) => {
                    const cell = cells?.get(col)
                    const isPending = cell?.formula && (cell.cached === null || cell.cached === undefined)
                    const text = !cell ? '' : cell.formula && !showFormulas ? (isPending ? '…' : display(cell.cached, cell.format)) : cell.formula ? display(cell.value) : display(cell.value, cell.format)
                    const numeric = typeof (cell?.formula && !showFormulas ? cell?.cached : cell?.value) === 'number'
                    return (
                      <td key={col}
                        onClick={() => setSelected(cell ?? null)}
                        title={isPending ? t('documents.sheet.pending') : undefined}
                        data-cell={cell?.cell}
                        className={cn(
                          'max-w-[240px] cursor-default truncate border border-[var(--border)] px-1.5 py-0.5',
                          numeric ? 'text-right' : 'text-left',
                          cell?.formula ? 'text-[var(--accent-2)]' : 'text-[var(--text)]',
                          isPending && !showFormulas && 'italic text-amber-300/80',
                          selected?.cell === cell?.cell && cell && 'outline outline-1 outline-[var(--accent-2)]',
                        )}>
                        {text}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        {loading && <p className="p-2 text-center text-xs text-[var(--text-subtle)]"><LoaderCircle size={12} className="inline animate-spin" /></p>}
        {!loading && hasMore && (
          <button type="button" onClick={() => void load(sheet, loadedTo + 1, true)}
            className="m-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            {t('documents.sheet.moreRows')}
          </button>
        )}
      </div>
      {sheets.length > 1 && (
        <div role="tablist" aria-label={t('documents.sheet.sheets')} className="flex gap-1 overflow-x-auto border-t border-[var(--border)] px-2 py-1">
          {sheets.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={name === sheet}
              onClick={() => { setSelected(null); void load(name, 1, false) }}
              className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11px]', name === sheet ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
