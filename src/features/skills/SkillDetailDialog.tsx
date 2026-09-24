import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type SkillDetail,
  type SkillPage,
  type SkillReview,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import Markdown from '../../components/Markdown'
import { Switch } from '../../components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import ReviewFindings from './ReviewFindings'
import { runSkillJob } from './skillJobs'

type Pending = { kind: 'remove' } | { kind: 'force' } | { kind: 'review'; review: SkillReview; force: boolean }

const buttonClass =
  'rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40'

/** Ficha de una skill: qué es, de dónde vino, qué encontró la revisión y sus archivos. */
export default function SkillDetailDialog({
  name,
  onClose,
  onChanged,
}: {
  name: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [page, setPage] = useState<SkillPage | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    setDetail(null)
    setEditing(false)
    setPage(null)
    setEditError(null)
    if (!name) return
    let cancelled = false
    engineApi.skillGet(name)
      .then(({ skill }) => { if (!cancelled) setDetail(skill) })
      .catch((err) => { if (!cancelled) toast.error(commandMessage(err)) })
    return () => { cancelled = true }
  }, [name])

  if (!name) return null

  async function toggle() {
    if (!detail) return
    setBusy('toggle')
    try {
      const { skill } = await engineApi.skillSetEnabled(detail.name, !detail.enabled)
      setDetail(skill)
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function openReference(path: string, offset = 0) {
    if (!detail) return
    try {
      const next = await engineApi.skillRead(detail.name, path, offset)
      setPage(offset > 0 && page?.path === path ? { ...next, text: `${page.text}\n${next.text}` } : next)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function save() {
    if (!detail) return
    setBusy('save')
    setEditError(null)
    try {
      const { skill } = await engineApi.skillWrite(detail.name, draft)
      setDetail(skill)
      setEditing(false)
      toast.success(t('skills.saved'))
      onChanged()
    } catch (err) {
      setEditError(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function update(force = false, expectedHash?: string) {
    if (!detail) return
    setBusy('update')
    const outcome = await runSkillJob<{ skill: SkillDetail }>({
      action: 'update',
      name: detail.name,
      force,
      expectedHash,
    }).catch((err: unknown) => ({ ok: false as const, error: { code: 'COMMAND', message: commandMessage(err), details: {} as Record<string, unknown> } }))
    setBusy(null)
    if (outcome.ok) {
      setDetail(outcome.result.skill)
      toast.success(t('skills.updated', { name: detail.name }))
      onChanged()
      return
    }
    if (outcome.error.code === 'LOCALLY_MODIFIED') setPending({ kind: 'force' })
    else if (outcome.error.code === 'REVIEW_REQUIRED') {
      setPending({ kind: 'review', review: outcome.error.details.review as SkillReview, force })
    } else toast.error(outcome.error.message)
  }

  async function remove() {
    if (!detail) return
    try {
      await engineApi.skillRemove(detail.name)
      toast.success(t('skills.removed', { name: detail.name }))
      onChanged()
      onClose()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const provenance = detail?.provenance
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{detail?.description ?? ''}</DialogDescription>
        </DialogHeader>
        {!detail ? (
          <p className="text-sm text-[var(--text-subtle)]">{t('skills.loading')}</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-subtle)]">
              <span className="rounded-md border border-[var(--border)] px-1.5">{t(`skills.origin.${detail.origin}`)}</span>
              {detail.version && <span>v{detail.version}</span>}
              {detail.risk && <span>{t('skills.risk', { risk: detail.risk })}</span>}
              {detail.format === 'standard' && <span>{t('skills.format.standardLong')}</span>}
              {detail.shadows && <span>{t('skills.shadows', { origin: t(`skills.origin.${detail.shadows}`) })}</span>}
              <label className="ml-auto flex items-center gap-2">
                <span>{t(detail.enabled ? 'skills.enabled' : 'skills.disabled')}</span>
                <Switch checked={detail.enabled} disabled={busy !== null || detail.status === 'pending'} onCheckedChange={() => void toggle()} aria-label={t('skills.toggle')} />
              </label>
            </div>

            {detail.error && (
              <p className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-400">
                {detail.error.code}: {detail.error.message}
              </p>
            )}
            {detail.issues.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-400">
                {detail.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}
              </ul>
            )}
            {detail.modified && <p className="text-xs text-amber-400">{t('skills.attention.modified')}</p>}

            <ReviewFindings review={detail.review} />

            {provenance?.source && (
              <p className="text-xs text-[var(--text-subtle)]">
                {t('skills.provenance', { source: provenance.source })}
                {provenance.installed_at ? ` · ${new Date(provenance.installed_at).toLocaleString()}` : ''}
              </p>
            )}
            {(detail.required_tools?.length ?? 0) + (detail.allowed_tools?.length ?? 0) > 0 && (
              <p className="text-xs text-[var(--text-subtle)]">
                {t('skills.tools')}: <span className="font-mono">{[...(detail.required_tools ?? []), ...(detail.allowed_tools ?? [])].join(', ')}</span>
              </p>
            )}

            {detail.references.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-[var(--text-muted)]">{t('skills.files')}</p>
                <div className="flex flex-wrap gap-1">
                  {detail.references.map((path) => (
                    <button key={path} type="button" onClick={() => void openReference(path)} className={`${buttonClass} font-mono`}>
                      {path}
                    </button>
                  ))}
                </div>
                {page && (
                  <div className="mt-2">
                    <pre className="max-h-64 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 font-mono text-[11px] whitespace-pre-wrap text-[var(--text-muted)]">{page.text}</pre>
                    {page.next_offset !== null && (
                      <button type="button" onClick={() => void openReference(page.path, page.next_offset ?? 0)} className={`${buttonClass} mt-1`}>
                        {t('skills.moreLines')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {editing ? (
              <div className="space-y-2">
                <textarea
                  aria-label={t('skills.editor')}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  spellCheck={false}
                  className="h-72 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 font-mono text-xs text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
                />
                {editError && <p className="text-xs text-red-400">{editError}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void save()} className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">
                    {t('skills.save')}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className={buttonClass}>{t('providers.cancel')}</button>
                </div>
              </div>
            ) : (
              <div className="max-h-80 overflow-auto rounded-xl border border-[var(--border)] p-3">
                <Markdown>{detail.body}</Markdown>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {detail.editable && !editing && (
                <button type="button" onClick={() => { setDraft(detail.skill_md); setEditing(true) }} className={buttonClass}>
                  {t('skills.edit')}
                </button>
              )}
              {detail.editable && provenance?.source && (
                <button type="button" disabled={busy !== null} onClick={() => void update()} className={buttonClass}>
                  {busy === 'update' ? t('skills.updating') : t('skills.update')}
                </button>
              )}
              {detail.editable && (
                <button type="button" onClick={() => setPending({ kind: 'remove' })} className={`${buttonClass} text-red-400`}>
                  {t('skills.remove')}
                </button>
              )}
            </div>
          </div>
        )}

        <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pending?.kind === 'remove' ? t('skills.remove') : t('skills.update')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pending?.kind === 'remove' && t('skills.confirmRemove', { name })}
                {pending?.kind === 'force' && t('skills.confirmForce', { name })}
                {pending?.kind === 'review' && t('skills.confirmReview')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {pending?.kind === 'review' && <ReviewFindings review={pending.review} />}
            <AlertDialogFooter>
              <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const current = pending
                  setPending(null)
                  if (current?.kind === 'remove') void remove()
                  if (current?.kind === 'force') void update(true)
                  if (current?.kind === 'review') void update(current.force, current.review.content_hash)
                }}
              >
                {pending?.kind === 'remove' ? t('skills.remove') : t('skills.continue')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
