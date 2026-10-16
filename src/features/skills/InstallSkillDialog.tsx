import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type SkillCandidate, type SkillDetail, type SkillReview } from '../../services/engine'
import { platform } from '../../platform'
import { useI18n } from '../../i18n'
import { inputClass } from '../../components/settings/parts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { cn } from '../../lib/utils'
import ReviewFindings from './ReviewFindings'
import { runSkillJob, type SkillJobOutcome } from './skillJobs'
import { confirmedHash, importKindKey, needsConfirmation } from './skillsModel'

type Tab = 'source' | 'import'

/** Cómo va cada skill elegida: revisándose, instalándose, lista o qué le falta. */
type RowState =
  | { state: 'reviewing' }
  | { state: 'installing' }
  | { state: 'installed' }
  | { state: 'confirm'; review: SkillReview }
  | { state: 'large'; message: string }
  | { state: 'error'; message: string }

type Inspected = { source: string; candidates: SkillCandidate[]; partial?: boolean }

const buttonClass =
  'rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40'
const primaryClass = 'rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40'

const failed = (err: unknown) => ({ ok: false as const, error: { code: 'COMMAND', message: commandMessage(err), details: {} as Record<string, unknown> } })

/**
 * Instalar o importar skills. Se eligen una o varias; cada una se revisa (el
 * Engine descarga y revisa sin copiar nada) y se instala confirmando ese
 * contenido exacto con su hash. El diálogo no se cierra al terminar: cada fila
 * dice cómo quedó, y las que piden algo (confirmar sus avisos, «Instalar igual»
 * si pasa de los topes, «Reintentar») lo ofrecen ahí mismo (plan 0.4.0 #53).
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
  const [inspected, setInspected] = useState<Inspected | null>(null)
  const [imports, setImports] = useState<SkillCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setSource('')
      setInspected(null)
      setImports(null)
      setSelected(new Set())
      setRows({})
      setProgress(null)
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

  const list = tab === 'import' ? imports ?? [] : inspected?.candidates ?? []
  const keyOf = (candidate: SkillCandidate) => `${tab}:${candidate.path}`
  const selectable = (candidate: SkillCandidate) =>
    candidate.error === null && candidate.installed === null && rows[keyOf(candidate)]?.state !== 'installed'
  const busy = progress !== null

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
    setSelected(new Set())
    setRows({})
    const outcome = await runSkillJob<Inspected>({ action: 'inspect', source: target.trim() }).catch(failed)
    setInspecting(false)
    if (!outcome.ok) {
      setError(outcome.error.message)
      return
    }
    setInspected(outcome.result)
    // Una sola skill sin nada pendiente: queda elegida.
    const ready = outcome.result.candidates.filter((c) => c.error === null && c.installed === null)
    if (ready.length === 1) setSelected(new Set([`source:${ready[0].path}`]))
  }

  /** Dónde y cómo se pide cada skill al Engine. */
  function origin(candidate: SkillCandidate): { from: string; name?: string } {
    if (tab === 'import') return { from: candidate.paths?.[0] ?? candidate.path }
    const several = (inspected?.candidates.length ?? 0) > 1 || inspected?.partial
    return { from: source.trim(), name: several ? candidate.name : undefined }
  }

  const setRow = (key: string, state: RowState) => setRows((current) => ({ ...current, [key]: state }))

  /**
   * Revisa (si aún no hay revisión completa) e instala una skill. Con avisos
   * de riesgo no se instala sola: queda en «Confirmar» con su revisión.
   */
  async function process(candidate: SkillCandidate, options: { confirm?: SkillReview; allowLarge?: boolean } = {}): Promise<boolean> {
    const key = keyOf(candidate)
    const { from, name } = origin(candidate)
    let review = options.confirm ?? candidate.review
    if (!review) {
      setRow(key, { state: 'reviewing' })
      const inspectedOne: SkillJobOutcome<Inspected> = await runSkillJob<Inspected>({
        action: 'inspect', source: from, name, ...(options.allowLarge ? { allowLarge: true } : {}),
      }).catch(failed)
      if (!inspectedOne.ok) return fail(key, inspectedOne.error.code, inspectedOne.error.message)
      const found = inspectedOne.result.candidates.find((c) => c.name === candidate.name) ?? inspectedOne.result.candidates[0]
      if (!found?.review) return fail(key, 'SKILL_NOT_FOUND', t('skills.noneFound'))
      review = found.review
    }
    if (needsConfirmation(review) && options.confirm === undefined) {
      setRow(key, { state: 'confirm', review })
      return false
    }
    setRow(key, { state: 'installing' })
    const outcome = await runSkillJob<{ skill: SkillDetail }>({
      action: 'install',
      source: from,
      name,
      expectedHash: confirmedHash(review),
      ...(options.allowLarge ? { allowLarge: true } : {}),
    }).catch(failed)
    if (!outcome.ok) {
      // El contenido cambió entre revisar e instalar: se pide revisar otra vez.
      if (outcome.error.code === 'REVIEW_REQUIRED') return fail(key, 'REVIEW_REQUIRED', t('skills.changedSinceReview'))
      return fail(key, outcome.error.code, outcome.error.message)
    }
    setRow(key, { state: 'installed' })
    return true
  }

  function fail(key: string, code: string, message: string): false {
    setRow(key, code === 'SKILL_TOO_LARGE' ? { state: 'large', message } : { state: 'error', message })
    return false
  }

  async function installSelected() {
    const chosen = list.filter((candidate) => selected.has(keyOf(candidate)) && selectable(candidate))
    if (chosen.length === 0) return
    stopRef.current = false
    setError(null)
    let installed = 0
    for (const [index, candidate] of chosen.entries()) {
      if (stopRef.current) break
      setProgress({ done: index, total: chosen.length })
      if (await process(candidate)) installed += 1
    }
    setProgress(null)
    setSelected(new Set())
    if (installed > 0) {
      onInstalled()
      toast.success(t('skills.installedCount', { n: installed }))
    }
  }

  async function single(candidate: SkillCandidate, options: { confirm?: SkillReview; allowLarge?: boolean }) {
    setProgress({ done: 0, total: 1 })
    const ok = await process(candidate, options)
    setProgress(null)
    if (ok) {
      onInstalled()
      toast.success(t('skills.installed', { name: candidate.name }))
    }
  }

  function toggle(candidate: SkillCandidate) {
    const key = keyOf(candidate)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const ready = list.filter(selectable)
  const allSelected = ready.length > 0 && ready.every((candidate) => selected.has(keyOf(candidate)))
  const count = list.filter((candidate) => selected.has(keyOf(candidate)) && selectable(candidate)).length

  function statusLine(candidate: SkillCandidate) {
    const row = rows[keyOf(candidate)]
    if (!row) return null
    if (row.state === 'reviewing') return <p className="text-xs text-[var(--text-subtle)]">{t('skills.reviewing')}</p>
    if (row.state === 'installing') return <p className="text-xs text-[var(--text-subtle)]">{t('skills.installing')}</p>
    if (row.state === 'installed') return <p className="text-xs text-[var(--success)]">{t('skills.rowInstalled')}</p>
    if (row.state === 'confirm') {
      return (
        <div className="space-y-2">
          <ReviewFindings review={row.review} compact />
          <button type="button" disabled={busy} onClick={() => void single(candidate, { confirm: row.review })} className="rounded-lg border border-red-500/60 px-2.5 py-1 text-xs font-semibold text-[var(--danger)] hover:bg-red-500/10 disabled:opacity-40">
            {t('skills.installAnyway')}
          </button>
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-xs text-[var(--danger)]">{row.message}</p>
        {row.state === 'large'
          ? <button type="button" disabled={busy} onClick={() => void single({ ...candidate, review: null }, { allowLarge: true })} className={buttonClass}>{t('skills.installLarge')}</button>
          : <button type="button" disabled={busy} onClick={() => void single(candidate, {})} className={buttonClass}>{t('skills.retry')}</button>}
      </div>
    )
  }

  function candidateRow(candidate: SkillCandidate) {
    const key = keyOf(candidate)
    const kinds = candidate.kinds ?? (candidate.kind ? [candidate.kind] : [])
    const enabled = selectable(candidate)
    return (
      <li key={key} className="space-y-2 py-3" data-testid="skill-candidate">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            aria-label={t('skills.select', { name: candidate.name })}
            className="mt-1 accent-[var(--accent)]"
            checked={enabled && selected.has(key)}
            disabled={!enabled || busy}
            onChange={() => toggle(candidate)}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-[var(--text)]">
              {candidate.name}
              {kinds.map((kind) => {
                const label = importKindKey(kind)
                return <span key={kind} className="rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-subtle)]">{label ? t(label) : kind}</span>
              })}
              {candidate.format === 'standard' && <span className="rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-subtle)]">{t('skills.format.standard')}</span>}
            </p>
            <p className="text-xs text-[var(--text-subtle)]">{candidate.error ? candidate.error.message : candidate.description}</p>
            {candidate.installed && (
              <p className="text-xs text-[var(--text-subtle)]">{t('skills.alreadyInstalled', { origin: t(`skills.origin.${candidate.installed.origin}`) })}</p>
            )}
            {candidate.review && !rows[key] && <ReviewFindings review={candidate.review} compact />}
            {statusLine(candidate)}
          </div>
        </div>
      </li>
    )
  }

  const verb = tab === 'import' ? 'skills.importSelected' : 'skills.installSelected'

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
              disabled={busy}
              onClick={() => { setTab(option); setError(null); setSelected(new Set()) }}
              className={cn(buttonClass, tab === option && 'border-[var(--accent)] bg-[var(--bg-active)] font-semibold')}
            >
              {t(`skills.tab.${option}`)}
            </button>
          ))}
        </div>

        {tab === 'source' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                aria-label={t('skills.sourceLabel')}
                placeholder={t('skills.sourcePlaceholder')}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void inspect() }}
                className={`${inputClass} font-mono`}
                spellCheck={false}
              />
              <button type="button" disabled={inspecting || busy || !source.trim()} onClick={() => void inspect()} className={buttonClass}>
                {inspecting ? t('skills.reviewing') : t('skills.review')}
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void pick(true)} className={buttonClass}>{t('skills.pickFolder')}</button>
              <button type="button" disabled={busy} onClick={() => void pick(false)} className={buttonClass}>{t('skills.pickZip')}</button>
            </div>
            {inspected?.candidates.length === 0 && <p className="text-sm text-[var(--text-subtle)]">{t('skills.noneFound')}</p>}
            {inspected?.partial && <p className="text-xs text-[var(--text-subtle)]">{t('skills.partialList')}</p>}
          </div>
        )}
        {tab === 'import' && imports === null && !error && <p className="text-sm text-[var(--text-subtle)]">{t('skills.loading')}</p>}
        {tab === 'import' && imports?.length === 0 && <p className="text-sm text-[var(--text-subtle)]">{t('skills.nothingToImport')}</p>}

        {list.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[var(--text-subtle)]">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={allSelected}
                  disabled={ready.length === 0 || busy}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(ready.map(keyOf)))}
                />
                {t('skills.selectAll')}
              </label>
              <span className="ml-auto text-xs text-[var(--text-subtle)]" aria-live="polite">
                {progress ? t('skills.progress', { done: progress.done + 1, total: progress.total }) : null}
              </span>
              {busy && progress && progress.total > 1 && (
                <button type="button" onClick={() => { stopRef.current = true }} className={buttonClass}>{t('skills.stop')}</button>
              )}
              <button type="button" disabled={count === 0 || busy} onClick={() => void installSelected()} className={primaryClass}>
                {t(verb, { n: count })}
              </button>
            </div>
            <ul className="max-h-[50vh] divide-y divide-[var(--border)] overflow-y-auto">
              {list.map(candidateRow)}
            </ul>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2">
            <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>
            <button type="button" onClick={() => { setError(null); if (tab === 'import') setImports(null); else void inspect() }} className={buttonClass}>{t('skills.retry')}</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
