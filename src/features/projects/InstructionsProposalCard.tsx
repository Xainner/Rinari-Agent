import { useMemo, useState } from 'react'
import { Check, FileText, LoaderCircle, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { unifiedDiff } from '../../lib/lineDiff'
import { commandMessage, engineApi } from '../../services/engine'
import DiffView from '../workspace/DiffView'
import Markdown from '../../components/Markdown'
import type { InstructionsTimelineItem } from '../activity/types'
import { SegTabPill } from '../../components/ui/SegTabPill'

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

  const where = shortPath(item.path)
  return (
    <section className="proposal-card" data-testid="instructions-proposal" data-status={status} aria-label={t(item.previous !== null ? 'init.card.update' : 'init.card.title')}>
      <header className="proposal-card-head">
        <span className="proposal-card-icon" aria-hidden="true"><FileText size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="proposal-card-title">{t(item.previous !== null ? 'init.card.update' : 'init.card.title')}</p>
          <p className="proposal-card-path" title={item.path}>{where}</p>
        </div>
        {status === 'pending' && !editing && item.previous !== null && (
          <div className="seg-tabs proposal-card-tabs" role="tablist" aria-label={fileName}>
            {(['changes', 'preview'] as const).map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={view === tab} className="seg-tab" onClick={() => setView(tab)}>
                {view === tab && <SegTabPill />}
                <span className="relative">{t(tab === 'changes' ? 'init.card.changes' : 'init.card.preview')}</span>
              </button>
            ))}
          </div>
        )}
        {status !== 'pending' && (
          <span className="r-chip" data-tone={status === 'saved' ? 'success' : undefined}>
            {status === 'saved' ? <Check size={11} aria-hidden="true" /> : <X size={11} aria-hidden="true" />}
            {t(status === 'saved' ? 'init.card.statusSaved' : 'init.card.statusDiscarded')}
          </span>
        )}
      </header>

      {(item.summary || item.reuses.length > 0) && (
        <div className="proposal-card-notes">
          {item.summary && <p className="proposal-card-summary">{item.summary}</p>}
          {item.reuses.length > 0 && <p className="proposal-card-reuses">{t('init.card.reuses', { files: item.reuses.join(', ') })}</p>}
        </div>
      )}

      {status === 'pending' && !editing && (
        <div className="proposal-card-doc" data-view={view === 'changes' && diff ? 'diff' : 'preview'} data-testid="instructions-proposal-body">
          {view === 'changes' && diff ? <DiffView diff={diff} /> : <Markdown>{item.content}</Markdown>}
        </div>
      )}

      {status === 'pending' && editing && (
        <textarea
          className="field-input proposal-card-editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={fileName}
          spellCheck={false}
          autoFocus
          data-testid="instructions-proposal-editor"
        />
      )}

      {status === 'pending' ? (
        <div className="proposal-card-actions">
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
        <p className="proposal-card-outcome" role="status" data-testid="instructions-proposal-outcome" title={status === 'saved' ? item.path : undefined}>
          {status === 'saved' ? t('init.card.saved', { path: where }) : t('init.card.discarded')}
        </p>
      )}
    </section>
  )
}

/** La carpeta y el archivo: la ruta entera queda en el `title`. */
function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? path : parts.slice(-2).join(path.includes('\\') ? '\\' : '/')
}
