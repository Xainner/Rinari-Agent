import { useContext, useState } from 'react'
import { Brain, LoaderCircle, Settings2, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { memoryApi } from '../../services/memory'
import { Select } from '../../components/ui/select'
import { TurnSessionContext } from '../activity/turnSession'
import { useOptionalEngineData } from '../engine/EngineContext'
import { useProfileStore } from '../profiles/profileStore'
import { PlaceIcon } from './placeIcon'
import type { MemoryPlace } from './types'
import { useUIStore } from '../../stores/ui'
import type { MemoryTimelineItem } from '../activity/types'
import { MemoryCandidateCard } from './MemoryCandidateCard'
import { effectiveCandidateStatus, forgetMemory, refreshMemory, useMemoryState } from './memoryStore'
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
        // Dónde la quiso guardar Rinari (#75); la tarjeta deja cambiarlo.
        scope: known?.scope,
        place: known?.place ?? null,
        project_root: known?.project_root ?? null,
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
  // Entra (y su check se dibuja) solo el que acaba de guardarse: al reabrir la conversación, quieto.
  const [fresh] = useState(() => Date.now() - item.occurredAt < 15_000)
  const [more, setMore] = useState(false)
  // Dónde quedó (#75): lo dice el evento; «Mover» lo cambia sin ir a Ajustes.
  const [place, setPlace] = useState<string>(item.place || 'general')
  const sessionId = useContext(TurnSessionContext)
  const engine = useOptionalEngineData()
  const activeProfile = useProfileStore((state) => state.activeId)
  const projectRoot = sessionId ? engine?.sessionsById?.[sessionId]?.project_root ?? null : null
  const moveOptions = [
    ...(place !== 'general' ? [{ value: 'general', label: t('memory.moveGeneral'), icon: <PlaceIcon place="general" size={13} /> }] : []),
    ...(activeProfile && place !== 'profile' ? [{ value: `profile|${activeProfile}`, label: t('memory.place.profile'), icon: <PlaceIcon place="profile" size={13} /> }] : []),
    ...(projectRoot && place !== 'project' ? [{ value: `project|${projectRoot}`, label: t('memory.place.project'), icon: <PlaceIcon place="project" size={13} /> }] : []),
    ...(sessionId && place !== 'chat' ? [{ value: `chat|${sessionId}`, label: t('memory.place.chat'), icon: <PlaceIcon place="chat" size={13} /> }] : []),
  ]

  async function move(target: string) {
    const [where, ref] = target.split('|')
    try {
      await memoryApi.move(id, where, where === 'project' ? { project_root: ref } : ref ? { place_ref: ref } : {})
      setPlace(where)
      toast.success(t('memory.moved', { n: 1 }))
      void refreshMemory()
    } catch (e) {
      toast.error(memoryErrorMessage(e, t))
    }
  }

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
    <section
      data-testid="memory-remembered"
      data-forgotten={forgotten || undefined}
      data-status={forgotten ? 'forgotten' : 'saved'}
      data-entering={fresh || undefined}
      aria-label={t('memory.rememberedTitle')}
      className="proposal-card memory-saved"
    >
      <header className="proposal-card-head">
        <span className="proposal-card-icon" aria-hidden="true"><Brain size={15} /></span>
        <div className="min-w-0 flex-1">
          <p className="proposal-card-title">{t('memory.rememberedTitle')}</p>
          {(item.topic || item.kind) && (
            <p className="memory-saved-topic">
              {item.topic && <span className="truncate">{item.topic}</span>}
              {item.kind && <span className="r-chip">{item.kind}</span>}
            </p>
          )}
        </div>
        {!forgotten && place && (
          <span className="memory-place-chip" data-place={place} data-testid="memory-remembered-place">
            <PlaceIcon place={place as MemoryPlace} size={11} />
            <span className="truncate">{t(`memory.place.${place}` as I18nKey)}</span>
          </span>
        )}
        <span className="r-chip memory-saved-state" data-tone={forgotten ? undefined : 'success'}>
          {forgotten
            ? <X size={11} aria-hidden="true" />
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={fresh ? 'r-check' : undefined}><path d="M5 12.5l4.2 4.2L19 7" /></svg>}
          {t(forgotten ? 'memory.rememberedForgotten' : 'memory.rememberedSaved')}
        </span>
      </header>
      <p className={`memory-saved-text${more ? ' is-expanded' : ''}`}>{item.text}</p>
      {item.text.length > 160 && (
        <button type="button" className="memory-saved-more" aria-expanded={more} onClick={() => setMore((value) => !value)}>
          {more ? t('followups.less') : t('followups.readAll')}
        </button>
      )}
      <div className="memory-saved-actions">
        {!forgotten && id && (
          <button type="button" disabled={busy} onClick={() => void undo()} className="btn btn-ghost btn-xs">
            {busy ? <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <Undo2 size={12} aria-hidden="true" />}{t('memory.undo')}
          </button>
        )}
        {!forgotten && id && moveOptions.length > 0 && (
          <Select<string>
            compact
            value={null}
            placeholder={t('memory.move')}
            label={t('memory.move')}
            options={moveOptions}
            onChange={(target) => void move(target)}
            testId="memory-remembered-move"
          />
        )}
        <button type="button" onClick={() => goSettings('memory')} className="btn btn-quiet btn-xs">
          <Settings2 size={12} aria-hidden="true" />{t('memory.openSettings')}
        </button>
      </div>
    </section>
  )
}
