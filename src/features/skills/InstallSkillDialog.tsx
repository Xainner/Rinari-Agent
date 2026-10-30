import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { CircleAlert, FileArchive, FolderOpen, LoaderCircle, PackageCheck, RotateCcw, Search, ShieldAlert, Square, TriangleAlert } from 'lucide-react'
import { commandMessage, engineApi, type SkillCandidate, type SkillDetail, type SkillReview } from '../../services/engine'
import { platform } from '../../platform'
import { useI18n } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { cn } from '../../lib/utils'
import { duration, ease, instant, useCalmMotion } from '../../lib/motion'
import ReviewFindings from './ReviewFindings'
import { runSkillJob, type SkillJobOutcome } from './skillJobs'
import { confirmedHash, importKindKey, needsConfirmation } from './skillsModel'

type Tab = 'source' | 'import'
const TABS: readonly Tab[] = ['source', 'import']

/** Cómo va cada skill elegida: revisándose, instalándose, lista o qué le falta. */
type RowState =
  | { state: 'reviewing' }
  | { state: 'installing' }
  | { state: 'installed' }
  | { state: 'confirm'; review: SkillReview }
  | { state: 'large'; message: string }
  | { state: 'error'; message: string }

type Inspected = { source: string; candidates: SkillCandidate[]; partial?: boolean }

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
  const calm = useCalmMotion()
  const [tab, setTab] = useState<Tab>('source')
  const [source, setSource] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [inspected, setInspected] = useState<Inspected | null>(null)
  const [imports, setImports] = useState<SkillCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef(false)
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setSource('')
      setInspected(null)
      setImports(null)
      setSelected(new Set())
      setRows({})
      setProgress(null)
      setStopping(false)
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
    setStopping(false)
    setError(null)
    let installed = 0
    for (const [index, candidate] of chosen.entries()) {
      if (stopRef.current) break
      setProgress({ done: index, total: chosen.length })
      if (await process(candidate)) installed += 1
    }
    setProgress(null)
    setStopping(false)
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

  function switchTab(next: Tab) {
    setTab(next)
    setError(null)
    setSelected(new Set())
  }

  const ready = list.filter(selectable)
  const allSelected = ready.length > 0 && ready.every((candidate) => selected.has(keyOf(candidate)))
  const count = list.filter((candidate) => selected.has(keyOf(candidate)) && selectable(candidate)).length
  // «Seleccionar todas» a medias se dibuja con una raya, no vacía ni marcada.
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = count > 0 && !allSelected
  }, [count, allSelected])

  function rowDetail(candidate: SkillCandidate, row: RowState | undefined) {
    if (!row) return null
    if (row.state === 'confirm') {
      return (
        <div className="skill-row-detail">
          <ReviewFindings review={row.review} compact />
          <button type="button" disabled={busy} onClick={() => void single(candidate, { confirm: row.review })} className="btn btn-danger btn-xs">
            <ShieldAlert size={12} aria-hidden="true" /> {t('skills.installAnyway')}
          </button>
        </div>
      )
    }
    if (row.state === 'large' || row.state === 'error') {
      return (
        <div className="skill-row-detail skill-row-problem">
          <p role="alert">{row.message}</p>
          {row.state === 'large'
            ? <button type="button" disabled={busy} onClick={() => void single({ ...candidate, review: null }, { allowLarge: true })} className="btn btn-secondary btn-xs">
                <PackageCheck size={12} aria-hidden="true" /> {t('skills.installLarge')}
              </button>
            : <button type="button" disabled={busy} onClick={() => void single(candidate, {})} className="btn btn-ghost btn-xs">
                <RotateCcw size={12} aria-hidden="true" /> {t('skills.retry')}
              </button>}
        </div>
      )
    }
    return null
  }

  function candidateRow(candidate: SkillCandidate, index: number) {
    const key = keyOf(candidate)
    const kinds = candidate.kinds ?? (candidate.kind ? [candidate.kind] : [])
    const enabled = selectable(candidate)
    const row = rows[key]
    const checked = enabled && selected.has(key)
    return (
      <li
        key={key}
        className="skill-row"
        data-testid="skill-candidate"
        data-state={row?.state}
        data-selected={checked || undefined}
        style={{ '--i': Math.min(index, 8) } as CSSProperties}
      >
        <input
          type="checkbox"
          aria-label={t('skills.select', { name: candidate.name })}
          className="r-checkbox skill-row-check"
          checked={checked}
          disabled={!enabled || busy}
          onChange={() => toggle(candidate)}
        />
        <div className="skill-row-body">
          <p className="skill-row-head">
            <span className="skill-row-name">{candidate.name}</span>
            {kinds.map((kind) => {
              const label = importKindKey(kind)
              return <span key={kind} className="skill-tag">{label ? t(label) : kind}</span>
            })}
            {candidate.format === 'standard' && <span className="skill-tag">{t('skills.format.standard')}</span>}
          </p>
          <p className={cn('skill-row-desc', candidate.error && 'is-error')}>{candidate.error ? candidate.error.message : candidate.description}</p>
          {candidate.installed && (
            <p className="skill-row-desc">{t('skills.alreadyInstalled', { origin: t(`skills.origin.${candidate.installed.origin}`) })}</p>
          )}
          {candidate.review && !row && <ReviewFindings review={candidate.review} compact />}
          {rowDetail(candidate, row)}
        </div>
        {row && <RowStatus row={row} />}
      </li>
    )
  }

  const verb = tab === 'import' ? 'skills.importSelected' : 'skills.installSelected'
  const fraction = progress ? progress.done / progress.total : 0

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="install-skill-dialog max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('skills.install')}</DialogTitle>
          <DialogDescription>{t('skills.installDesc')}</DialogDescription>
        </DialogHeader>
        <div
          role="tablist"
          className="seg-tabs w-fit"
          onKeyDown={(event) => {
            // Flechas, Inicio y Fin recorren las pestañas (patrón WAI-ARIA tabs).
            const index = TABS.indexOf(tab)
            const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
              : event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1
            if (next < 0 || busy) return
            event.preventDefault()
            switchTab(TABS[next])
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
          }}
        >
          {TABS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              tabIndex={tab === option ? 0 : -1}
              disabled={busy}
              onClick={() => switchTab(option)}
              className="seg-tab"
            >
              {tab === option && <motion.span layoutId="install-skill-tab" className="seg-tab-pill" transition={calm ? instant : { duration: duration.base, ease: ease.out }} aria-hidden="true" />}
              <span className="relative">{t(`skills.tab.${option}`)}</span>
            </button>
          ))}
        </div>

        {tab === 'source' && (
          <div className="install-skill-source">
            <div className="flex gap-2">
              <input
                aria-label={t('skills.sourceLabel')}
                placeholder={t('skills.sourcePlaceholder')}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void inspect() }}
                className="field-input font-mono"
                spellCheck={false}
              />
              <button type="button" disabled={inspecting || busy || !source.trim()} onClick={() => void inspect()} className="btn btn-secondary shrink-0">
                {inspecting ? <LoaderCircle size={14} className="r-spin" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />}
                {inspecting ? t('skills.reviewing') : t('skills.review')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || inspecting} onClick={() => void pick(true)} className="btn btn-ghost btn-sm">
                <FolderOpen size={13} aria-hidden="true" /> {t('skills.pickFolder')}
              </button>
              <button type="button" disabled={busy || inspecting} onClick={() => void pick(false)} className="btn btn-ghost btn-sm">
                <FileArchive size={13} aria-hidden="true" /> {t('skills.pickZip')}
              </button>
            </div>
            {inspected?.candidates.length === 0 && <p className="install-skill-note">{t('skills.noneFound')}</p>}
            {inspected?.partial && <p className="install-skill-note">{t('skills.partialList')}</p>}
          </div>
        )}
        {tab === 'import' && imports === null && !error && (
          <p className="install-skill-note"><LoaderCircle size={13} className="r-spin" aria-hidden="true" /> {t('skills.loading')}</p>
        )}
        {tab === 'import' && imports?.length === 0 && <p className="install-skill-note">{t('skills.nothingToImport')}</p>}

        {list.length > 0 && (
          <div className="install-skill-list">
            <div className="install-skill-bar" data-busy={busy || undefined}>
              <label className="install-skill-all">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="r-checkbox"
                  checked={allSelected}
                  disabled={ready.length === 0 || busy}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(ready.map(keyOf)))}
                />
                {t('skills.selectAll')}
              </label>
              <span className="install-skill-progress-label" aria-live="polite">
                {progress ? t('skills.progress', { done: progress.done + 1, total: progress.total }) : null}
              </span>
              {busy && progress && progress.total > 1 && (
                <button
                  type="button"
                  disabled={stopping}
                  onClick={() => { stopRef.current = true; setStopping(true) }}
                  className="btn btn-quiet btn-xs"
                >
                  <Square size={10} aria-hidden="true" /> {stopping ? t('skills.stopping') : t('skills.stop')}
                </button>
              )}
              <button type="button" disabled={count === 0 || busy} onClick={() => void installSelected()} className="btn btn-primary btn-sm">
                {t(verb, { n: count })}
              </button>
              {/* La barra no ocupa sitio: va sobre la línea inferior y no mueve la lista. */}
              {progress && progress.total > 1 && (
                <span className="install-skill-progress" aria-hidden="true">
                  <span className="install-skill-progress-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
                </span>
              )}
            </div>
            <ul className="install-skill-rows">
              {list.map(candidateRow)}
            </ul>
          </div>
        )}
        {error && (
          <div className="install-skill-error">
            <CircleAlert size={14} aria-hidden="true" />
            <p role="alert">{error}</p>
            <button type="button" onClick={() => { setError(null); if (tab === 'import') setImports(null); else void inspect() }} className="btn btn-ghost btn-xs">
              <RotateCcw size={12} aria-hidden="true" /> {t('skills.retry')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const ROW_TONES: Record<RowState['state'], string | undefined> = {
  reviewing: undefined,
  installing: 'accent',
  installed: 'success',
  confirm: 'warning',
  large: 'warning',
  error: 'danger',
}

/**
 * Chip de estado de una fila. El check de «Instalada» se dibuja solo si esta
 * fila se vio instalándose; al volver a montarse aparece quieto (§5).
 */
function RowStatus({ row }: { row: RowState }) {
  const { t } = useI18n()
  const sawInstalling = useRef(row.state === 'installing')
  useEffect(() => { if (row.state === 'installing') sawInstalling.current = true }, [row.state])
  const celebrate = row.state === 'installed' && sawInstalling.current
  const label = row.state === 'reviewing' ? t('skills.reviewing')
    : row.state === 'installing' ? t('skills.installing')
      : row.state === 'installed' ? t('skills.rowInstalled')
        : t(`skills.status.${row.state}`)
  return (
    <span className={cn('r-chip skill-status', celebrate && 'is-fresh')} data-state={row.state} data-tone={ROW_TONES[row.state]}>
      {row.state === 'reviewing' || row.state === 'installing'
        ? <LoaderCircle size={12} className="r-spin" aria-hidden="true" />
        : row.state === 'installed'
          ? <svg className={cn(celebrate && 'r-check r-check-pop')} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
          : row.state === 'error'
            ? <CircleAlert size={12} aria-hidden="true" />
            : <TriangleAlert size={12} aria-hidden="true" />}
      {label}
    </span>
  )
}
