import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type SkillCandidate, type SkillDetail } from '../../services/engine'
import { platform } from '../../platform'
import { useI18n } from '../../i18n'
import { inputClass } from '../../components/settings/parts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { cn } from '../../lib/utils'
import ReviewFindings from './ReviewFindings'
import { runSkillJob } from './skillJobs'
import { confirmedHash, importKindKey } from './skillsModel'

type Tab = 'source' | 'import'

const buttonClass =
  'rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40'

/**
 * Instalar una skill. Primero se revisa lo que llegaría (el Engine descarga y
 * revisa sin copiar nada); instalar confirma ese contenido exacto con su hash.
 */
export default function InstallSkillDialog({
  open,
  onClose,
  onInstalled,
}: {
  open: boolean
  onClose: () => void
  onInstalled: () => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('source')
  const [source, setSource] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [inspected, setInspected] = useState<{ source: string; candidates: SkillCandidate[] } | null>(null)
  const [imports, setImports] = useState<SkillCandidate[] | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSource('')
      setInspected(null)
      setImports(null)
      setError(null)
      setTab('source')
    }
  }, [open])

  useEffect(() => {
    if (!open || tab !== 'import' || imports !== null) return
    engineApi.skillImportScan()
      .then(({ candidates }) => setImports(candidates))
      .catch((err) => setError(commandMessage(err)))
  }, [open, tab, imports])

  async function pick(directory: boolean) {
    const picked = await platform().dialog.openFiles({ directory, multiple: false, title: t('skills.pick') })
    if (picked?.[0]) {
      setSource(picked[0])
      await inspect(picked[0])
    }
  }

  async function inspect(target = source) {
    if (!target.trim()) return
    setInspecting(true)
    setError(null)
    setInspected(null)
    const outcome = await runSkillJob<{ source: string; candidates: SkillCandidate[] }>({
      action: 'inspect',
      source: target.trim(),
    }).catch((err: unknown) => ({ ok: false as const, error: { code: 'COMMAND', message: commandMessage(err), details: {} as Record<string, unknown> } }))
    setInspecting(false)
    if (outcome.ok) setInspected(outcome.result)
    else setError(outcome.error.message)
  }

  async function install(candidate: SkillCandidate, from: string, name?: string) {
    setInstalling(candidate.path)
    setError(null)
    const outcome = await runSkillJob<{ skill: SkillDetail }>({
      action: 'install',
      source: from,
      name,
      expectedHash: confirmedHash(candidate.review),
    }).catch((err: unknown) => ({ ok: false as const, error: { code: 'COMMAND', message: commandMessage(err), details: {} as Record<string, unknown> } }))
    setInstalling(null)
    if (outcome.ok) {
      toast.success(t('skills.installed', { name: outcome.result.skill.name }))
      onInstalled()
      if (tab === 'import') setImports(null)
      else onClose()
      return
    }
    // El contenido cambió entre revisar e instalar: se pide revisar otra vez.
    setError(outcome.error.code === 'REVIEW_REQUIRED' ? t('skills.changedSinceReview') : outcome.error.message)
  }

  function candidateRow(candidate: SkillCandidate, from: string, name?: string) {
    const danger = candidate.review.verdict === 'danger'
    return (
      <li key={`${candidate.kind ?? ''}:${candidate.path}`} className="space-y-2 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-[var(--text)]">
              {candidate.name}
              {candidate.kind && <span className="rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-subtle)]">{(() => { const key = importKindKey(candidate.kind); return key ? t(key) : candidate.kind })()}</span>}
              {candidate.format === 'standard' && <span className="rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-subtle)]">{t('skills.format.standard')}</span>}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{candidate.error ? candidate.error.message : candidate.description}</p>
            {candidate.installed && (
              <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{t('skills.alreadyInstalled', { origin: t(`skills.origin.${candidate.installed.origin}`) })}</p>
            )}
          </div>
          <button
            type="button"
            disabled={installing !== null || candidate.error !== null || candidate.installed !== null}
            onClick={() => void install(candidate, from, name)}
            className={cn(
              'shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-40',
              danger ? 'border border-red-500/60 text-red-400 hover:bg-red-500/10' : 'bg-[var(--accent)] text-white hover:brightness-110',
            )}
          >
            {installing === candidate.path
              ? t('skills.installing')
              : danger ? t('skills.installAnyway') : t(tab === 'import' ? 'skills.import' : 'skills.install')}
          </button>
        </div>
        <ReviewFindings review={candidate.review} compact />
      </li>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('skills.install')}</DialogTitle>
          <DialogDescription>{t('skills.installDesc')}</DialogDescription>
        </DialogHeader>
        <div role="tablist" className="flex gap-1">
          {(['source', 'import'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              onClick={() => { setTab(option); setError(null) }}
              className={cn(buttonClass, tab === option && 'border-[var(--accent)] bg-[var(--bg-active)] font-semibold')}
            >
              {t(`skills.tab.${option}`)}
            </button>
          ))}
        </div>

        {tab === 'source' ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                aria-label={t('skills.sourceLabel')}
                placeholder="https://github.com/…  ·  C:\…\skill  ·  skills.zip"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void inspect() }}
                className={`${inputClass} font-mono`}
                spellCheck={false}
              />
              <button type="button" disabled={inspecting || !source.trim()} onClick={() => void inspect()} className={buttonClass}>
                {inspecting ? t('skills.reviewing') : t('skills.review')}
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void pick(true)} className={buttonClass}>{t('skills.pickFolder')}</button>
              <button type="button" onClick={() => void pick(false)} className={buttonClass}>{t('skills.pickZip')}</button>
            </div>
            {inspected && (
              inspected.candidates.length === 0
                ? <p className="text-sm text-[var(--text-subtle)]">{t('skills.noneFound')}</p>
                : <ul className="divide-y divide-[var(--border)]">
                    {inspected.candidates.map((candidate) =>
                      candidateRow(candidate, source.trim(), inspected.candidates.length > 1 ? candidate.name : undefined))}
                  </ul>
            )}
          </div>
        ) : (
          <div>
            {imports === null && !error && <p className="text-sm text-[var(--text-subtle)]">{t('skills.loading')}</p>}
            {imports?.length === 0 && <p className="text-sm text-[var(--text-subtle)]">{t('skills.nothingToImport')}</p>}
            {imports && imports.length > 0 && (
              <ul className="divide-y divide-[var(--border)]">
                {imports.map((candidate) => candidateRow(candidate, candidate.path))}
              </ul>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
