import { useMemo, useState } from 'react'
import { Check, FileText, LoaderCircle, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { unifiedDiff } from '../../lib/lineDiff'
import { commandMessage, engineApi } from '../../services/engine'
import DiffView from '../workspace/DiffView'
import Markdown from '../../components/Markdown'
import type { InstructionsTimelineItem } from '../activity/types'

type Status = InstructionsTimelineItem['status']

/**
 * La propuesta de RINARI.md de `/init` (#81), fuera de la actividad plegada.
 *
 * Nada se escribe sin «Guardar». Con un RINARI.md que ya existía se ven los
 * cambios; «Editar» deja retocar el texto antes de guardarlo.
 */
export function InstructionsProposalCard({ item, sessionId }: { item: InstructionsTimelineItem; sessionId: string }) {
  const { t } = useI18n()
  const [local, setLocal] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.content)
  const [view, setView] = useState<'preview' | 'changes'>(item.previous !== null ? 'changes' : 'preview')
  const status = local ?? item.status
  const diff = useMemo(() => (item.previous !== null ? unifiedDiff(item.previous, item.content) : ''), [item.previous, item.content])
  const fileName = item.path.split(/[\\/]/).pop() || 'RINARI.md'

  async function resolve(decision: 'save' | 'discard', content?: string) {
    setBusy(true)
    try {
      const result = await engineApi.projectInstructionsResolve(sessionId, item.proposalId, decision, content)
      setLocal(result.status)
      setEditing(false)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="r-card rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3" data-testid="instructions-proposal" data-status={status}>
      <header className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[var(--accent-2)]" aria-hidden="true">
          <FileText size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--text)]">{t(item.previous !== null ? 'init.card.update' : 'init.card.title')}</p>
          <p className="truncate font-mono text-[11px] text-[var(--text-subtle)]" title={item.path}>{fileName}</p>
          {item.summary && <p className="mt-1 text-xs text-[var(--text-muted)]">{item.summary}</p>}
          {item.reuses.length > 0 && <p className="mt-1 text-[11px] text-[var(--text-subtle)]">{t('init.card.reuses', { files: item.reuses.join(', ') })}</p>}
        </div>
      </header>

      {status === 'pending' && !editing && item.previous !== null && (
        <div className="mt-2.5 inline-flex rounded-full border border-[var(--border)] p-0.5 text-[11px]" role="tablist">
          {(['changes', 'preview'] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={view === tab} onClick={() => setView(tab)} className={cn('rounded-full px-2.5 py-0.5 transition-colors', view === tab ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
              {t(tab === 'changes' ? 'init.card.changes' : 'init.card.preview')}
            </button>
          ))}
        </div>
      )}

      {status === 'pending' && !editing && (
        <div className="mt-2.5 max-h-80 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-[13px]" data-testid="instructions-proposal-body">
          {view === 'changes' && diff ? <DiffView diff={diff} /> : <Markdown>{item.content}</Markdown>}
        </div>
      )}

      {status === 'pending' && editing && (
        <textarea
          className="field-input mt-2.5 min-h-64 w-full resize-y font-mono text-[12px]"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={fileName}
          data-testid="instructions-proposal-editor"
        />
      )}

      {status === 'pending' ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={() => void resolve('save', draft)} data-testid="instructions-proposal-save-edited">
                {busy ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />} {t('init.card.saveEdited')}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setEditing(false); setDraft(item.content) }}>{t('init.card.cancelEdit')}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void resolve('save')} data-testid="instructions-proposal-save">
                {busy ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />} {t('init.card.save')}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditing(true)} data-testid="instructions-proposal-edit">
                <Pencil size={13} aria-hidden="true" /> {t('init.card.edit')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void resolve('discard')} data-testid="instructions-proposal-discard">
                <X size={13} aria-hidden="true" /> {t('init.card.discard')}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]" data-testid="instructions-proposal-outcome">
          {status === 'saved' ? t('init.card.saved', { path: item.path }) : t('init.card.discarded')}
        </p>
      )}
    </section>
  )
}
