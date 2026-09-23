import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp, X } from 'lucide-react'
import { toast } from 'sonner'
import { desktopApi, type QuestionRequest } from '../../services/desktop'
import { commandMessage } from '../../services/engine'
import { useI18n } from '../../i18n'
import { refreshPendingQuestions, usePendingQuestions } from './usePendingQuestions'
import { answerFor, answersFor, fixedOptions, isOther, selectionFor, type QuestionDrafts, type QuestionSelection } from './questionDrafts'

export function QuestionCard(props: { request: QuestionRequest; onResolved: () => void }) {
  return <QuestionFlow key={props.request.request_id} {...props} />
}

function QuestionFlow({ request, onResolved }: { request: QuestionRequest; onResolved: () => void }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [minimized, setMinimized] = useState(false)
  const [drafts, setDrafts] = useState<QuestionDrafts>({ selections: {}, customText: {} })
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const indexRef = useRef(0)
  const pointerAdvance = useRef({ index: -1, until: 0 })
  const heading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  // Focus moves after the user's own step, Other or restore. A card that just
  // arrived only takes focus if nobody has it: taking it from the composer, or
  // from another Boards pane, would send the next keystrokes into this card.
  const focusRequested = useRef(!document.activeElement || document.activeElement === document.body)
  const question = request.questions[index]
  const selected = question ? selectionFor(question, drafts) : undefined
  const other = selected?.kind === 'other'
  const answers = answersFor(request, drafts)
  const valid = question ? Boolean(answerFor(question, drafts).trim()) : false
  const last = index === request.questions.length - 1
  const position = t('questions.progress', { n: index + 1, total: request.questions.length })
  useLayoutEffect(() => {
    if (minimized || !focusRequested.current) return
    focusRequested.current = false
    if (other) input.current?.focus()
    else heading.current?.focus()
  }, [index, other, minimized])

  function go(next: number) {
    if (sendingRef.current) return
    focusRequested.current = true
    indexRef.current = Math.max(0, Math.min(next, request.questions.length - 1))
    setIndex(indexRef.current)
  }
  function choose(selection: QuestionSelection, detail: number) {
    if (!question || sendingRef.current || indexRef.current !== index || detail > 1) return
    // A second pointer click may land on a newly mounted option and arrive
    // with detail=1. Keep that gesture from answering the next question.
    if (detail > 0 && pointerAdvance.current.index === index && Date.now() < pointerAdvance.current.until) return
    focusRequested.current = true
    setDrafts(current => ({ ...current, selections: { ...current.selections, [question.id]: selection } }))
    if (selection.kind === 'option' && !last) {
      if (detail > 0) pointerAdvance.current = { index: index + 1, until: Date.now() + 250 }
      go(index + 1)
    }
    else if (selection.kind === 'other') input.current?.focus()
  }
  async function submit(skip: boolean) {
    if (sendingRef.current || (!skip && !answers)) return
    sendingRef.current = true
    setSending(true)
    try {
      await desktopApi.answer(request, skip ? {} : answers!, skip)
      onResolved()
      // Stay locked until the pending-request controller removes this card.
    } catch (error) {
      sendingRef.current = false
      setSending(false)
      toast.error(commandMessage(error))
    }
  }
  if (!question) return null
  if (minimized) return <button disabled={sending} className="mb-3 flex items-center gap-2 text-sm" onClick={() => { focusRequested.current = true; setMinimized(false) }}>
    <CircleHelp size={16} /> {t('questions.waiting')} · {t('questions.restore')}
  </button>
  const syntheticMetadata = question.options?.find(option => isOther(option.label))
  return <section aria-label={t('questions.region')} className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm">
    <div className="mb-3 flex items-start justify-between gap-3">
      <h3 ref={heading} tabIndex={-1} aria-label={`${position}: ${question.title}`} className="font-semibold">{question.title}</h3>
      <button disabled={sending} aria-label={t('questions.minimize')} onClick={() => setMinimized(true)}><X size={16} /></button>
    </div>
    <div key={question.id} role="radiogroup" aria-label={question.title} className="space-y-1">
      {fixedOptions(question).map(({ option, index: optionIndex }) => {
        const checked = selected?.kind === 'option' && selected.optionIndex === optionIndex
        return <button key={optionIndex} role="radio" aria-checked={checked} disabled={sending}
          onKeyDown={event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault() }}
          onClick={event => choose({ kind: 'option', optionIndex, value: option.label }, event.detail)}
          className={`flex w-full gap-3 rounded-xl p-3 text-left hover:bg-[var(--bg-hover)] ${checked ? 'bg-[var(--bg-hover)] ring-1 ring-[var(--accent)]' : ''}`}>
          <span><strong>{option.label}{option.recommended ? ` (${t('questions.recommended')})` : ''}</strong>
            {option.description && <span className="mt-1 block text-xs text-[var(--text-muted)]">{option.description}</span>}</span>
        </button>
      })}
      <button role="radio" aria-checked={Boolean(other)} disabled={sending} onClick={event => choose({ kind: 'other' }, event.detail)}
        className={`w-full rounded-xl p-3 text-left hover:bg-[var(--bg-hover)] ${other ? 'ring-1 ring-[var(--accent)]' : ''}`}>
        <strong>{t('questions.other')}{syntheticMetadata?.recommended ? ` (${t('questions.recommended')})` : ''}</strong>
        {syntheticMetadata?.description && <span className="mt-1 block text-xs text-[var(--text-muted)]">{syntheticMetadata.description}</span>}
      </button>
    </div>
    {other && <textarea ref={input} aria-label={t('questions.custom')} placeholder={t('questions.placeholder')}
      value={drafts.customText[question.id] ?? ''} disabled={sending} maxLength={8000}
      onChange={event => setDrafts(current => ({ ...current, customText: { ...current.customText, [question.id]: event.target.value } }))}
      className="mt-3 w-full resize-none rounded-xl border border-[var(--border)] bg-transparent p-3 outline-none focus:ring-1 focus:ring-[var(--accent)]" />}
    {other && !last && <button disabled={sending || !valid} onClick={() => go(index + 1)} className="mt-2 rounded-lg border border-[var(--border)] px-3 py-2 disabled:opacity-40">{t('questions.continue')}</button>}
    <div className="mt-2 flex items-center gap-2">
      <button aria-label={t('questions.previous')} disabled={sending || index === 0} onClick={() => go(index - 1)}><ChevronLeft size={16} /></button>
      <span className="text-xs">{position}</span>
      <button aria-label={t('questions.next')} disabled={sending || last || !valid} onClick={() => go(index + 1)}><ChevronRight size={16} /></button>
      <span className="flex-1" />
      <button disabled={sending} onClick={() => void submit(true)} className="px-3 py-1.5">{t('questions.skip')}</button>
      <button disabled={sending || !answers} onClick={() => void submit(false)} className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-white disabled:opacity-40">
        {t(sending ? 'questions.sending' : request.questions.length === 1 ? 'questions.send' : 'questions.sendMany')}
      </button>
    </div>
  </section>
}

export default function Questions({ sessionId }: { sessionId: string }) {
  const requests = usePendingQuestions(sessionId)
  return <>{requests.map(request => <QuestionCard key={request.request_id} request={request} onResolved={() => refreshPendingQuestions(sessionId)} />)}</>
}
