import { useId, useState } from 'react'
import { Brain, Check, LoaderCircle, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { inputClass } from '../../lib/ui'
import { Button } from '../../components/ui/button'
import { resolveCandidate } from './memoryStore'
import { candidateReason, kindLabel, memoryErrorMessage } from './memoryCopy'
import type { CandidateDecision, CandidateStatus } from './types'

export interface CandidateView {
  id: string
  topic: string
  text: string
  kind?: string
  reason?: string | null
  sensitive?: boolean
}

/**
 * Una propuesta de memoria con sus tres salidas: Aprobar, Editar (y luego
 * aprobar con el texto corregido) o Descartar. La misma tarjeta vive en el
 * chat y en Ajustes → Memoria; el estado lo decide el Engine.
 */
export function MemoryCandidateCard({ candidate, status, variant = 'chat' }: {
  candidate: CandidateView
  status: CandidateStatus
  variant?: 'chat' | 'settings'
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [topic, setTopic] = useState(candidate.topic)
  const [text, setText] = useState(candidate.text)
  const [busy, setBusy] = useState<CandidateDecision | null>(null)
  const [error, setError] = useState('')
  const fieldId = useId()
  const pending = status === 'pending'

  async function decide(decision: CandidateDecision) {
    if (decision === 'allow_once' && editing && !text.trim()) { setError(t('memory.error.empty')); return }
    setBusy(decision)
    setError('')
    try {
      const edits = decision === 'allow_once' && editing
        ? {
            ...(text.trim() !== candidate.text ? { text: text.trim() } : {}),
            ...(topic.trim() && topic.trim() !== candidate.topic ? { topic: topic.trim() } : {}),
          }
        : {}
      await resolveCandidate(candidate.id, decision, edits)
      setEditing(false)
    } catch (e) {
      toast.error(memoryErrorMessage(e, t))
    } finally {
      setBusy(null)
    }
  }

  const kind = kindLabel(candidate.kind, t)
  const titleId = `${fieldId}-title`
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-testid="memory-candidate"
      data-status={status}
      className={variant === 'chat'
        ? 'my-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3 text-[13px]'
        : 'rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-[13px]'}
    >
      <div className="flex flex-wrap items-center gap-2">
        {variant === 'chat' && <Brain size={14} aria-hidden="true" className="text-[var(--accent-2)]" />}
        {variant === 'chat' && <span className="text-[12px] text-[var(--text-muted)]">{t('memory.candidate.title')}</span>}
        {/* Tras «Guardar y aprobar» se ve lo que aprobaste, no la propuesta original. */}
        <span id={titleId} className="font-medium text-[var(--text)]">{topic.trim() || candidate.topic}</span>
        {kind && <span className="rounded-full bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{kind}</span>}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t('memory.topic')}</span>
            <input className={inputClass} value={topic} maxLength={128} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t('memory.text')}</span>
            <textarea className={`${inputClass} min-h-20 resize-y`} value={text} maxLength={4096} aria-invalid={Boolean(error)} onChange={(e) => setText(e.target.value)} autoFocus />
          </label>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-[var(--text)] [overflow-wrap:anywhere]">{text.trim() || candidate.text}</p>
      )}

      {candidateReason(candidate.reason, t) && !editing && <p className="mt-1 text-[12px] text-[var(--text-subtle)]">{candidateReason(candidate.reason, t)}</p>}
      {candidate.sensitive && pending && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--warning)]">
          <ShieldAlert size={13} aria-hidden="true" />{t('memory.candidate.sensitive')}
        </p>
      )}
      {error && <p role="alert" className="mt-1.5 text-[12px] text-[var(--danger)]">{error}</p>}

      {pending ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {editing ? <>
            <Button size="sm" disabled={busy !== null} onClick={() => void decide('allow_once')}>
              {busy === 'allow_once' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              {t('memory.candidate.saveApprove')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { setEditing(false); setTopic(candidate.topic); setText(candidate.text); setError('') }}>
              {t('memory.cancel')}
            </Button>
          </> : <>
            <Button size="sm" disabled={busy !== null} onClick={() => void decide('allow_once')}>
              {busy === 'allow_once' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              {t('memory.candidate.approve')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setEditing(true)}>
              {t('memory.candidate.edit')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void decide('deny')}>
              {busy === 'deny' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
              {t('memory.candidate.dismiss')}
            </Button>
          </>}
        </div>
      ) : (
        <p role="status" className="mt-1.5 text-[12px] text-[var(--text-muted)]">
          {t(status === 'approved' ? 'memory.candidate.approved' : 'memory.candidate.denied')}
        </p>
      )}
    </div>
  )
}
