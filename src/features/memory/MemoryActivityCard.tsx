import { useState } from 'react'
import { Brain, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import type { MemoryTimelineItem } from '../activity/types'
import { MemoryCandidateCard } from './MemoryCandidateCard'
import { effectiveCandidateStatus, forgetMemory, useMemoryState } from './memoryStore'
import { memoryErrorMessage } from './memoryCopy'

/**
 * Memoria en el chat, fuera de la actividad plegada: una propuesta
 * (modo «Preguntar») o el aviso «Recordado · Deshacer» (modo «Automático»).
 */
export function MemoryActivityCard({ item }: { item: MemoryTimelineItem }) {
  if (item.memoryEvent === 'remembered') return <RememberedNotice item={item} />
  return <CandidateFromTimeline item={item} />
}

function CandidateFromTimeline({ item }: { item: MemoryTimelineItem }) {
  const memory = useMemoryState()
  const id = item.candidateId ?? ''
  const fallback = item.status === 'approved' || item.status === 'denied' ? item.status : 'pending'
  const { status } = effectiveCandidateStatus(memory, id, fallback)
  // Un Engine que conoce la propuesta manda; el evento es solo lo que se vio en vivo.
  const known = memory.candidates.find((candidate) => candidate.id === id)
  return (
    <MemoryCandidateCard
      candidate={{
        id,
        topic: known?.topic || item.topic,
        text: known?.text || item.text,
        kind: known?.kind || item.kind,
        reason: known?.reason ?? item.reason,
        sensitive: known?.sensitive ?? item.sensitive,
      }}
      status={status}
    />
  )
}

function RememberedNotice({ item }: { item: MemoryTimelineItem }) {
  const { t } = useI18n()
  const memory = useMemoryState()
  const goSettings = useUIStore((s) => s.goSettings)
  const [busy, setBusy] = useState(false)
  const id = item.memoryId ?? ''
  const forgotten = Boolean(memory.forgotten[id])

  async function undo() {
    setBusy(true)
    try {
      // La revisión que se conozca; si no, `forgetMemory` pide la actual.
      await forgetMemory(id, memory.records.find((record) => record.id === id)?.revision)
    } catch (e) {
      toast.error(memoryErrorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <p data-testid="memory-remembered" data-forgotten={forgotten || undefined} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 py-1 text-[12px] text-[var(--text-muted)]">
      <Brain size={13} aria-hidden="true" className="shrink-0 text-[var(--accent-2)]" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{t(forgotten ? 'memory.undone' : 'memory.remembered', { text: item.text })}</span>
      {!forgotten && id && <>
        <span aria-hidden="true">·</span>
        <button type="button" disabled={busy} onClick={() => void undo()} className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-[var(--text)] disabled:opacity-60">
          {busy && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}{t('memory.undo')}
        </button>
      </>}
      <span aria-hidden="true">·</span>
      <button type="button" onClick={() => goSettings('memory')} className="underline underline-offset-2 hover:text-[var(--text)]">{t('memory.openSettings')}</button>
    </p>
  )
}
