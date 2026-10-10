import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, LoaderCircle, MinusCircle, RefreshCw, XCircle } from 'lucide-react'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage } from '../../services/engine'
import { documentsApi, type DocumentCheck, type DocumentReport, type DocumentRevision, type SemanticChange } from './documentsApi'

const DIMENSIONS = ['structure', 'layout', 'content', 'preservation', 'formulas', 'visual'] as const

const STATUS_ICON = {
  passed: CheckCircle2,
  failed: XCircle,
  partial: MinusCircle,
  not_run: CircleDashed,
  not_applicable: CircleSlash,
} as const

const STATUS_TONE: Record<DocumentCheck['status'], string> = {
  passed: 'text-[var(--success)]',
  failed: 'text-[var(--danger)]',
  partial: 'text-[var(--warning)]',
  not_run: 'text-[var(--text-subtle)]',
  not_applicable: 'text-[var(--text-subtle)]',
}

const REASONS: Record<string, I18nKey> = {
  RENDER_UNAVAILABLE: 'documents.reason.renderUnavailable',
  NOT_RENDERED: 'documents.reason.notRendered',
  NOT_REVIEWED: 'documents.reason.notReviewed',
  NO_CRITERIA: 'documents.reason.noCriteria',
  UNSUPPORTED_FEATURE: 'documents.reason.unsupported',
  UNREADABLE: 'documents.reason.unreadable',
}

function StatusChip({ status }: { status: DocumentCheck['status'] }) {
  const { t } = useI18n()
  const Icon = STATUS_ICON[status] ?? CircleDashed
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px]', STATUS_TONE[status])}>
      <Icon size={13} aria-hidden="true" />{t(`documents.status.${status}` as I18nKey)}
    </span>
  )
}

/** Un hallazgo del Engine o de la revisión visual, con su ubicación si la tiene. */
function Finding({ finding }: { finding: Record<string, unknown> }) {
  const { t } = useI18n()
  const where = finding.slide ?? finding.page
  const text = String(finding.message ?? finding.detail ?? finding.code ?? '')
  const severity = String(finding.severity ?? '')
  return (
    <li className="flex gap-2 text-[11px] text-[var(--text-muted)]">
      <AlertTriangle size={11} aria-hidden="true" className={cn('mt-0.5 shrink-0', severity === 'error' || severity === 'critical' ? 'text-[var(--danger)]' : 'text-[var(--warning)]')} />
      <span className="min-w-0 break-words">
        {where !== undefined && where !== null && <span className="mr-1 font-mono text-[var(--text-subtle)]">{t('documents.findingAt', { where: String(where) })}</span>}
        {finding.code && finding.message ? <span className="mr-1 font-mono text-[10px] text-[var(--text-subtle)]">{String(finding.code)}</span> : null}
        {text}
        {typeof finding.fix === 'string' && finding.fix && <span className="block text-[var(--text-subtle)]">→ {finding.fix}</span>}
      </span>
    </li>
  )
}

function changeLabel(change: SemanticChange, t: ReturnType<typeof useI18n>['t']): string {
  const n = String(change.index ?? change.block ?? change.page ?? '')
  switch (change.change) {
    case 'block_added': return t('documents.change.blockAdded', { n })
    case 'block_removed': return t('documents.change.blockRemoved', { n })
    case 'page_added': return t('documents.change.pageAdded', { n })
    case 'page_removed': return t('documents.change.pageRemoved', { n })
    case 'page_count': return t('documents.change.pageCount', { before: String(change.before ?? ''), after: String(change.after ?? '') })
    case 'slide_added': return t('documents.change.slideAdded', { n })
    case 'slide_removed': return t('documents.change.slideRemoved')
    case 'slides_reordered': return t('documents.change.reordered')
    case 'notes_changed': return t('documents.change.notes', { n })
    default: return change.block !== undefined ? t('documents.change.blockContent', { n }) : t('documents.change.content', { n })
  }
}

/**
 * Verificación de una revisión: cada dimensión con su estado y evidencia, como
 * la reporta el Engine. Nada aquí convierte «sin ejecutar» en «correcto».
 */
export function DocumentChecks({ sessionId, revisionId }: { sessionId: string; revisionId: string }) {
  const { t } = useI18n()
  const [report, setReport] = useState<DocumentReport | null>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (validate = false) => {
    setBusy(true)
    setError(undefined)
    try {
      setReport((await documentsApi.report(sessionId, revisionId, validate)).report)
    } catch (err) {
      setError(commandMessage(err))
    } finally {
      setBusy(false)
    }
  }, [revisionId, sessionId])
  useEffect(() => { void load() }, [load])

  if (report === undefined && !error) return <p role="status" className="p-6 text-center text-xs text-[var(--text-muted)]"><LoaderCircle size={14} className="inline animate-spin" /></p>
  if (error) return <p role="alert" className="p-6 text-center text-sm text-[var(--danger)]">{error}</p>
  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">{t('documents.noReport')}</p>
        <button type="button" disabled={busy} onClick={() => void load(true)}
          className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}{t('documents.validate')}
        </button>
      </div>
    )
  }
  const names = [...DIMENSIONS.filter((name) => report.checks[name]), ...Object.keys(report.checks).filter((name) => !(DIMENSIONS as readonly string[]).includes(name))]
  const visual = report.checks.visual?.evidence as { reviewed_pages?: number[]; page_count?: number } | undefined
  return (
    <div className="h-full space-y-3 overflow-auto p-4" data-testid="document-checks">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text)]">{t('documents.overall')}</span>
        <StatusChip status={report.status} />
        {report.deliverable_state && (
          <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{t(`documents.state.${report.deliverable_state}` as I18nKey)}</span>
        )}
        <button type="button" disabled={busy} onClick={() => void load(true)} title={t('documents.validate')} aria-label={t('documents.validate')}
          className="ml-auto rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-60">
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>
      <ul className="space-y-2">
        {names.map((name) => {
          const check = report.checks[name]
          const reason = check.reason ? (REASONS[check.reason] ? t(REASONS[check.reason]) : check.reason) : null
          return (
            <li key={name} className="rounded-xl border border-[var(--border)] p-3" data-check={name} data-status={check.status}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text)]">{t(`documents.check.${name}` as I18nKey)}</span>
                <span className="ml-auto"><StatusChip status={check.status} /></span>
              </div>
              {reason && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{reason}</p>}
              {name === 'visual' && visual?.page_count ? (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('documents.reviewedPages', { reviewed: visual.reviewed_pages?.length ?? 0, total: visual.page_count })}</p>
              ) : null}
              {check.findings && check.findings.length > 0 && (
                <ul className="mt-2 space-y-1">{check.findings.slice(0, 30).map((finding, index) => <Finding key={index} finding={finding} />)}</ul>
              )}
            </li>
          )
        })}
      </ul>
      {report.semantic_diff && report.semantic_diff.length > 0 && (
        <section className="rounded-xl border border-[var(--border)] p-3">
          <h3 className="mb-1.5 text-xs font-semibold text-[var(--text)]">{t('documents.changes')}</h3>
          <ul className="space-y-1.5">
            {report.semantic_diff.slice(0, 40).map((change, index) => (
              <li key={index} className="text-[11px] text-[var(--text-muted)]">
                <span className="text-[var(--text)]">{changeLabel(change, t)}</span>
                {change.change === 'content_changed' && (
                  <span className="block break-words">
                    <span className="text-red-300/80 line-through">{change.before}</span>{' → '}<span className="text-[var(--success)]">{change.after}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const OPERATION: Record<string, I18nKey> = {
  import: 'documents.operation.import',
  create: 'documents.operation.create',
  edit: 'documents.operation.edit',
}

/** Las revisiones del documento: el original y lo que Rinari creó o editó. */
export function DocumentRevisions({ sessionId, documentId, currentId, onSelect }: {
  sessionId: string
  documentId: string
  currentId: string
  onSelect: (revision: DocumentRevision) => void
}) {
  const { t } = useI18n()
  const [revisions, setRevisions] = useState<DocumentRevision[]>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let alive = true
    documentsApi.revisions(sessionId, documentId)
      .then((result) => { if (alive) setRevisions([...result.revisions].reverse()) })
      .catch((err) => { if (alive) setError(commandMessage(err)) })
    return () => { alive = false }
  }, [documentId, sessionId])
  if (error) return <p role="alert" className="p-6 text-center text-sm text-[var(--danger)]">{error}</p>
  if (!revisions) return <p role="status" className="p-6 text-center text-xs text-[var(--text-muted)]"><LoaderCircle size={14} className="inline animate-spin" /></p>
  return (
    <ol className="h-full space-y-2 overflow-auto p-4" aria-label={t('documents.revisions')}>
      {revisions.map((revision) => {
        const current = revision.id === currentId
        return (
          <li key={revision.id}>
            <button type="button" onClick={() => onSelect(revision)} aria-current={current ? 'true' : undefined}
              className={cn('w-full rounded-xl border p-3 text-left transition-colors', current ? 'border-[var(--accent-2)]/60 bg-[var(--accent-2)]/10' : 'border-[var(--border)] hover:bg-[var(--bg-hover)]')}>
              <span className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--text)]">{OPERATION[revision.operation] ? t(OPERATION[revision.operation]) : revision.operation}</span>
                <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{t(`documents.state.${revision.state}` as I18nKey)}</span>
                {revision.report && <span className="ml-auto"><StatusChip status={revision.report.status} /></span>}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-[var(--text-subtle)]">
                <span className="truncate">{revision.name}</span>
                <span className="font-mono">{revision.sha256.slice(0, 8)}</span>
                <span>{new Date(revision.created_at).toLocaleString()}</span>
                {current && <span className="text-[var(--accent-2)]">{t('documents.current')}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
