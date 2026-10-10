import { useEffect, useId, useMemo, useState } from 'react'
import { LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/button'
import { useConfirm } from '../../components/ui/useConfirm'
import { inputClass, Section } from '../../components/settings/parts'
import { SearchField } from '../../components/ui/SearchField'
import { memoryApi } from '../../services/memory'
import { MemoryCandidateCard } from './MemoryCandidateCard'
import { MemoryPortability } from './MemoryPortability'
import {
  effectiveCandidateStatus,
  forgetMemory,
  refreshMemory,
  setLearnedFacts,
  updateMemory,
  useMemoryState,
} from './memoryStore'
import { kindLabel, memoryErrorMessage } from './memoryCopy'
import { MEMORY_KINDS, type LearnedFactsMode, type MemoryRecord } from './types'

const MODES: Array<{ value: LearnedFactsMode; title: 'memory.learning.ask' | 'memory.learning.auto'; hint: 'memory.learning.askHint' | 'memory.learning.autoHint' }> = [
  { value: 'ask', title: 'memory.learning.ask', hint: 'memory.learning.askHint' },
  { value: 'auto', title: 'memory.learning.auto', hint: 'memory.learning.autoHint' },
]

/**
 * Ajustes → Memoria: qué hace Rinari con lo que aprende sola, las propuestas
 * que esperan tu decisión y todo lo que recuerda, para buscarlo, corregirlo u
 * olvidarlo, y exportarlo o importarlo en un archivo. Nada se decide aquí:
 * cada acción va al Engine y se relee.
 */
export default function MemorySettings() {
  const { t } = useI18n()
  const memory = useMemoryState()
  const pending = memory.candidates.filter((candidate) => effectiveCandidateStatus(memory, candidate.id, 'pending').status === 'pending')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('memory.title')}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t('memory.intro')}</p>
      </div>

      {pending.length > 0 && (
        <Section title={t('memory.pending.title')} desc={t('memory.pending.desc')} anchor="memory-pending">
          <div className="space-y-2">
            {pending.map((candidate) => (
              <MemoryCandidateCard key={candidate.id} variant="settings" status="pending" candidate={candidate} />
            ))}
          </div>
        </Section>
      )}

      <LearningMode />
      <RecordsSection />
      <MemoryPortability />
    </div>
  )
}

function LearningMode() {
  const { t } = useI18n()
  const memory = useMemoryState()
  const [busy, setBusy] = useState(false)
  const current = memory.settings?.learned_facts
  const unavailable = memory.status === 'ready' && !memory.settings

  async function choose(mode: LearnedFactsMode) {
    if (mode === current) return
    setBusy(true)
    try {
      await setLearnedFacts(mode)
      toast.success(t('memory.learning.saved'))
    } catch (e) {
      toast.error(memoryErrorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t('memory.learning.title')} desc={t('memory.learning.desc')}>
      <div role="radiogroup" aria-label={t('memory.learning.title')} className="grid gap-2 sm:grid-cols-2">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={current === mode.value}
            disabled={busy || !memory.settings}
            onClick={() => void choose(mode.value)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
              current === mode.value
                ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--border)] hover:bg-[var(--bg-hover)]',
            )}
          >
            <span className="block text-sm font-medium text-[var(--text)]">{t(mode.title)}</span>
            <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">{t(mode.hint)}</span>
          </button>
        ))}
      </div>
      {unavailable && <p className="text-xs text-[var(--text-subtle)]">{t('memory.learning.unavailable')}</p>}
    </Section>
  )
}

function RecordsSection() {
  const { t } = useI18n()
  const memory = useMemoryState()
  const { ask, dialog } = useConfirm()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<string>('all')
  const [results, setResults] = useState<MemoryRecord[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  // La búsqueda la hace el Engine; se repite cuando la memoria cambia.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) { setResults(null); setSearchError(''); setSearching(false); return }
    let live = true
    setSearching(true)
    const timer = setTimeout(() => {
      memoryApi.search(trimmed)
        .then((value) => { if (live) { setResults(value.records ?? []); setSearchError('') } })
        .catch((e) => { if (live) setSearchError(memoryErrorMessage(e, t)) })
        .finally(() => { if (live) setSearching(false) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query, memory.records, t])

  const source = results ?? memory.records
  // Las cuatro categorías del contrato, más cualquier otra que el Engine use.
  const kinds = useMemo(() => {
    const extra = memory.records.map((record) => record.kind).filter((value) => value && !(MEMORY_KINDS as readonly string[]).includes(value))
    return [...MEMORY_KINDS, ...new Set(extra)]
  }, [memory.records])
  const visible = kind === 'all' ? source : source.filter((record) => record.kind === kind)

  async function forget(record: MemoryRecord) {
    const confirmed = await ask({
      title: t('memory.forget.title'),
      body: t('memory.forget.body', { text: record.text }),
      confirmLabel: t('memory.forget'),
      cancelLabel: t('memory.cancel'),
    })
    if (!confirmed) return
    try {
      await forgetMemory(record.id, record.revision)
      toast.success(t('memory.forgotten'))
    } catch (e) {
      toast.error(memoryErrorMessage(e, t))
    }
  }

  return (
    <Section title={t('memory.records.title')}>
      {dialog}
      <SearchField
        id={searchId}
        label={t('memory.search')}
        placeholder={t('memory.search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div role="radiogroup" aria-label={t('memory.filter')} className="flex flex-wrap gap-1.5">
        {['all', ...kinds].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => setKind(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              kind === value
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
            )}
          >
            {value === 'all' ? t('memory.filter.all') : kindLabel(value, t)}
          </button>
        ))}
      </div>

      {memory.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-[var(--danger)]">
          {t('memory.loadError', { error: memory.error })}
          <Button size="sm" variant="secondary" onClick={() => void refreshMemory()}>{t('memory.retry')}</Button>
        </div>
      )}
      {searchError && <p role="alert" className="text-sm text-[var(--danger)]">{searchError}</p>}
      {(memory.status === 'idle' || memory.status === 'loading' || searching) && (
        <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />{t('memory.loading')}
        </p>
      )}
      {memory.status === 'ready' && !searching && visible.length === 0 && (
        <p className="text-sm text-[var(--text-subtle)]">
          {query.trim() ? t('memory.empty.search') : kind !== 'all' && memory.records.length > 0 ? t('memory.empty.kind') : t('memory.empty')}
        </p>
      )}
      {visible.length > 0 && (
        <ul className="divide-y divide-[var(--border)]" aria-label={t('memory.records.title')}>
          {visible.map((record) => <RecordRow key={record.id} record={record} onForget={() => void forget(record)} />)}
        </ul>
      )}
    </Section>
  )
}

function RecordRow({ record, onForget }: { record: MemoryRecord; onForget: () => void }) {
  const { t, lang } = useI18n()
  const [editing, setEditing] = useState(false)
  const [topic, setTopic] = useState(record.topic)
  const [text, setText] = useState(record.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function open() {
    setTopic(record.topic)
    setText(record.text)
    setError('')
    setEditing(true)
  }

  async function save() {
    if (!text.trim()) { setError(t('memory.error.empty')); return }
    const fields = {
      ...(text.trim() !== record.text ? { text: text.trim() } : {}),
      ...(topic.trim() && topic.trim() !== record.topic ? { topic: topic.trim() } : {}),
    }
    if (Object.keys(fields).length === 0) { setEditing(false); return }
    setBusy(true)
    setError('')
    try {
      await updateMemory(record, fields)
      toast.success(t('memory.saved'))
      setEditing(false)
    } catch (e) {
      // Conflicto: la versión nueva ya se está releyendo; se cierra para que la veas.
      toast.error(memoryErrorMessage(e, t))
      if (!(e && typeof e === 'object' && (e as { code?: string }).code === 'CONFLICT')) setError(memoryErrorMessage(e, t))
      else setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const updated = record.updated_at ? new Date(record.updated_at) : null
  const kind = kindLabel(record.kind, t)
  return (
    <li data-testid="memory-record" className="py-3 first:pt-0 last:pb-0">
      {editing ? (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t('memory.topic')}</span>
            <input className={inputClass} value={topic} maxLength={128} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t('memory.text')}</span>
            <textarea className={`${inputClass} min-h-20 resize-y`} value={text} maxLength={4096} aria-invalid={Boolean(error)} onChange={(e) => setText(e.target.value)} autoFocus />
          </label>
          {error && <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}{t('memory.save')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>{t('memory.cancel')}</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[var(--text)]">{record.topic}</span>
              {kind && <span className="rounded-full bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{kind}</span>}
            </div>
            <p className="mt-0.5 text-sm whitespace-pre-wrap text-[var(--text-muted)] [overflow-wrap:anywhere]">{record.text}</p>
            {updated && !Number.isNaN(updated.getTime()) && (
              <p className="mt-0.5 text-[11px] text-[var(--text-subtle)]">{t('memory.updated', { date: updated.toLocaleDateString(lang) })}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="icon-sm" variant="ghost" aria-label={t('memory.editLabel', { topic: record.topic })} title={t('memory.edit')} onClick={open}>
              <Pencil aria-hidden="true" />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={t('memory.forgetLabel', { topic: record.topic })} title={t('memory.forget')} onClick={onForget}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
