import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp, X } from 'lucide-react'
import { toast } from 'sonner'
import { desktopApi, type QuestionRequest } from '../../services/desktop'
import { commandMessage } from '../../services/engine'
import { useI18n } from '../../i18n'
import { refreshPendingQuestions, usePendingQuestions } from './usePendingQuestions'
import { answerFor, answersFor, fixedOptions, isOther, selectionFor, type Question, type QuestionDrafts, type QuestionSelection } from './questionDrafts'
import { useCalmMotion } from '../../lib/motion'

/** Lo que la pregunta que se va tarda en salir; la que llega espera a que se marque la elegida. */
const LEAVE_MS = 420

export function QuestionCard(props: { request: QuestionRequest; onResolved: () => void }) {
  return <QuestionFlow key={props.request.request_id} {...props} />
}

function QuestionFlow({ request, onResolved }: { request: QuestionRequest; onResolved: () => void }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  // Hacia dónde fue el último paso: la pregunta entra desde ese lado (#63).
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  // La pregunta llega tras elegir una opción: espera un instante a que se vea marcada.
  const [chosenStep, setChosenStep] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [drafts, setDrafts] = useState<QuestionDrafts>({ selections: {}, customText: {} })
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const indexRef = useRef(0)
  const pointerAdvance = useRef({ index: -1, until: 0 })
  // La pregunta que se va (#63): queda encima, con la opción elegida marcada,
  // y sale hacia su lado mientras entra la nueva. Solo con movimiento.
  const calm = useCalmMotion()
  const [leaving, setLeaving] = useState<{ key: number; question: Question; selection?: QuestionSelection; direction: 'forward' | 'back'; chosen: boolean } | null>(null)
  const leaveTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])
  // La altura sigue a la pregunta: con más o menos opciones, la tarjeta crece o
  // encoge suave en vez de saltar.
  const stage = useRef<HTMLDivElement>(null)
  const [stageHeight, setStageHeight] = useState<number | null>(null)
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
    const step = stage.current?.querySelector<HTMLElement>('.question-step')
    if (!step) return
    const measure = () => setStageHeight(step.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(step)
    return () => observer.disconnect()
  }, [question?.id, minimized])
  useLayoutEffect(() => {
    if (minimized || !focusRequested.current) return
    focusRequested.current = false
    if (other) input.current?.focus()
    else heading.current?.focus()
  }, [index, other, minimized])

  function go(next: number, chosen?: QuestionSelection) {
    if (sendingRef.current) return
    focusRequested.current = true
    const target = Math.max(0, Math.min(next, request.questions.length - 1))
    if (target === indexRef.current) return
    const way = target > indexRef.current ? 'forward' : 'back'
    const from = request.questions[indexRef.current]
    if (!calm && from) {
      window.clearTimeout(leaveTimer.current)
      setLeaving({ key: Date.now(), question: from, selection: chosen ?? selectionFor(from, drafts), direction: way, chosen: Boolean(chosen) })
      leaveTimer.current = window.setTimeout(() => setLeaving(null), LEAVE_MS)
    }
    setDirection(way)
    setChosenStep(Boolean(chosen) && !calm)
    indexRef.current = target
    setIndex(target)
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
      go(index + 1, selection)
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
  return <section aria-label={t('questions.region')} className="question-card mb-3 p-4 text-sm">
    <div className="mb-3 flex items-start justify-between gap-3">
      <h3 ref={heading} tabIndex={-1} aria-label={`${position}: ${question.title}`} className="font-semibold">{question.title}</h3>
      <button disabled={sending} aria-label={t('questions.minimize')} title={t('questions.minimize')} className="btn btn-quiet btn-icon btn-xs -mt-1 -mr-1" onClick={() => setMinimized(true)}><X size={15} /></button>
    </div>
    <div ref={stage} className="question-stage" style={stageHeight === null ? undefined : { height: stageHeight }}>
    {leaving && (
      <div key={leaving.key} className="question-ghost space-y-1" data-direction={leaving.direction} data-chosen={leaving.chosen || undefined} aria-hidden="true" inert>
        {fixedOptions(leaving.question).map(({ option, index: optionIndex }) => (
          <div key={optionIndex} className={`question-option flex w-full gap-3 p-3 text-left${leaving.selection?.kind === 'option' && leaving.selection.optionIndex === optionIndex ? ' is-on' : ''}`}>
            <span><strong>{option.label}{option.recommended ? ` (${t('questions.recommended')})` : ''}</strong>
              {option.description && <span className="mt-1 block text-xs text-[var(--text-muted)]">{option.description}</span>}</span>
          </div>
        ))}
        <div className={`question-option w-full p-3 text-left${leaving.selection?.kind === 'other' ? ' is-on' : ''}`}><strong>{t('questions.other')}</strong></div>
      </div>
    )}
    <div key={question.id} role="radiogroup" aria-label={question.title} data-direction={direction ?? undefined} data-chosen={chosenStep || undefined} className="question-step space-y-1">
      {fixedOptions(question).map(({ option, index: optionIndex }) => {
        const checked = selected?.kind === 'option' && selected.optionIndex === optionIndex
        return <button key={optionIndex} role="radio" aria-checked={checked} disabled={sending}
          onKeyDown={event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault() }}
          onClick={event => choose({ kind: 'option', optionIndex, value: option.label }, event.detail)}
          className={`question-option flex w-full gap-3 p-3 text-left${checked ? ' is-on' : ''}`}>
          <span><strong>{option.label}{option.recommended ? ` (${t('questions.recommended')})` : ''}</strong>
            {option.description && <span className="mt-1 block text-xs text-[var(--text-muted)]">{option.description}</span>}</span>
        </button>
      })}
      <button role="radio" aria-checked={Boolean(other)} disabled={sending} onClick={event => choose({ kind: 'other' }, event.detail)}
        className={`question-option w-full p-3 text-left${other ? ' is-on' : ''}`}>
        <strong>{t('questions.other')}{syntheticMetadata?.recommended ? ` (${t('questions.recommended')})` : ''}</strong>
        {syntheticMetadata?.description && <span className="mt-1 block text-xs text-[var(--text-muted)]">{syntheticMetadata.description}</span>}
      </button>
    </div>
    </div>
    {other && <textarea ref={input} aria-label={t('questions.custom')} placeholder={t('questions.placeholder')}
      value={drafts.customText[question.id] ?? ''} disabled={sending} maxLength={8000}
      onChange={event => setDrafts(current => ({ ...current, customText: { ...current.customText, [question.id]: event.target.value } }))}
      className="field-input mt-3 resize-none" />}
    <div className="mt-2 flex items-center gap-2">
      <button aria-label={t('questions.previous')} title={t('questions.previous')} className="btn btn-quiet btn-icon btn-xs" disabled={sending || index === 0} onClick={() => go(index - 1)}><ChevronLeft size={15} /></button>
      <span className="text-xs text-[var(--text-muted)]">{position}</span>
      {request.questions.length > 1 && (
        <span className="question-dots" aria-hidden="true">
          {request.questions.map((item, at) => (
            <span key={item.id} className="question-dot" data-state={at === index ? 'current' : selectionFor(item, drafts) ? 'answered' : 'pending'} />
          ))}
        </span>
      )}
      <button aria-label={t('questions.next')} title={t('questions.next')} className="btn btn-quiet btn-icon btn-xs" disabled={sending || last || !valid} onClick={() => go(index + 1)}><ChevronRight size={15} /></button>
      <span className="flex-1" />
      <button disabled={sending} onClick={() => void submit(true)} className="btn btn-quiet btn-sm">{t('questions.skip')}</button>
      {/* Un solo botón principal (#37): «Continuar» mientras falten preguntas, «Enviar» en la última. */}
      {last ? (
        <button disabled={sending || !answers} onClick={() => void submit(false)} className="btn btn-primary btn-sm">
          {t(sending ? 'questions.sending' : request.questions.length === 1 ? 'questions.send' : 'questions.sendMany')}
        </button>
      ) : (
        <button disabled={sending || !valid} onClick={() => go(index + 1)} className="btn btn-primary btn-sm">
          {t('questions.continue')}
        </button>
      )}
    </div>
  </section>
}

export default function Questions({ sessionId }: { sessionId: string }) {
  const requests = usePendingQuestions(sessionId)
  return <>{requests.map(request => <QuestionCard key={request.request_id} request={request} onResolved={() => refreshPendingQuestions(sessionId)} />)}</>
}
