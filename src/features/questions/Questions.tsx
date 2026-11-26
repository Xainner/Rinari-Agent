import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp, X } from 'lucide-react'
import { toast } from 'sonner'
import { desktopApi, type QuestionRequest } from '../../services/desktop'
import { commandMessage } from '../../services/engine'
import { useI18n } from '../../i18n'
import { refreshPendingQuestions, usePendingQuestions } from './usePendingQuestions'
import { answersFor, emptyDrafts, fixedOptions, hasAnswer, isMulti, isOther, otherOn, picksFor, selectionFor, togglePick, touched, type Question, type QuestionDrafts, type QuestionSelection } from './questionDrafts'
import { useCalmMotion } from '../../lib/motion'
import { OfferCard, offerOf } from '../children/OfferCard'

/** Lo que la pregunta que se va tarda en salir; la que llega espera a que se marque la elegida. */
const LEAVE_MS = 420

export function QuestionCard(props: { request: QuestionRequest; onResolved: () => void }) {
  // «¿Nueva sesión o aquí?» travels as a question the Engine marks as an offer.
  const offer = offerOf(props.request)
  if (offer) return <OfferCard key={props.request.request_id} request={props.request} offer={offer} onResolved={props.onResolved} />
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
  const [drafts, setDrafts] = useState<QuestionDrafts>(emptyDrafts)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const indexRef = useRef(0)
  const pointerAdvance = useRef({ index: -1, until: 0 })
  // La pregunta que se va (#63): queda encima, con la opción elegida marcada,
  // y sale hacia su lado mientras entra la nueva. Solo con movimiento.
  const calm = useCalmMotion()
  const [leaving, setLeaving] = useState<{ key: number; question: Question; drafts: QuestionDrafts; selection?: QuestionSelection; direction: 'forward' | 'back'; chosen: boolean } | null>(null)
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
  const multi = question ? isMulti(question) : false
  const selected = question ? selectionFor(question, drafts) : undefined
  const picks = question && multi ? picksFor(question, drafts) : null
  const other = question ? otherOn(question, drafts) : false
  const answers = answersFor(request, drafts)
  const valid = question ? hasAnswer(question, drafts) : false
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
      setLeaving({ key: Date.now(), question: from, drafts, selection: chosen ?? selectionFor(from, drafts), direction: way, chosen: Boolean(chosen) })
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
  // A multi-select question never moves on by itself: each click ticks or
  // unticks, and «Continuar» or «Enviar» goes on.
  function toggle(optionIndex: number | null) {
    if (!question || sendingRef.current || indexRef.current !== index) return
    focusRequested.current = optionIndex === null && !picksFor(question, drafts).other
    setDrafts(current => togglePick(question, current, optionIndex))
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
      <div>
        <h3 ref={heading} tabIndex={-1} aria-label={`${position}: ${question.title}${multi ? ` (${t('questions.multiHint')})` : ''}`} className="font-semibold">{question.title}</h3>
        {multi && <p className="question-hint">{t('questions.multiHint')}</p>}
      </div>
      <button disabled={sending} aria-label={t('questions.minimize')} title={t('questions.minimize')} className="btn btn-quiet btn-icon btn-xs -mt-1 -mr-1" onClick={() => setMinimized(true)}><X size={15} /></button>
    </div>
    <div ref={stage} className="question-stage" style={stageHeight === null ? undefined : { height: stageHeight }}>
    {leaving && (
      <div key={leaving.key} className="question-ghost space-y-1" data-direction={leaving.direction} data-chosen={leaving.chosen || undefined} aria-hidden="true" inert>
        {fixedOptions(leaving.question).map(({ option, index: optionIndex }) => {
          const on = isMulti(leaving.question) ? picksFor(leaving.question, leaving.drafts).options.includes(optionIndex) : leaving.selection?.kind === 'option' && leaving.selection.optionIndex === optionIndex
          return <div key={optionIndex} className={`question-option flex w-full gap-3 p-3 text-left${on ? ' is-on' : ''}`}>
            {isMulti(leaving.question) && <QuestionCheck on={on} />}
            <span><strong>{option.label}{option.recommended ? ` (${t('questions.recommended')})` : ''}</strong>
              {option.description && <span className="mt-1 block text-xs text-[var(--text-muted)]">{option.description}</span>}</span>
          </div>
        })}
        <div className={`question-option flex w-full gap-3 p-3 text-left${otherOn(leaving.question, leaving.drafts) ? ' is-on' : ''}`}>
          {isMulti(leaving.question) && <QuestionCheck on={otherOn(leaving.question, leaving.drafts)} />}
          <strong>{t('questions.other')}</strong>
        </div>
      </div>
    )}
    <div key={question.id} role={multi ? 'group' : 'radiogroup'} aria-label={question.title} data-direction={direction ?? undefined} data-chosen={chosenStep || undefined} data-multi={multi || undefined} className="question-step space-y-1">
      {fixedOptions(question).map(({ option, index: optionIndex }) => {
        const checked = picks ? picks.options.includes(optionIndex) : selected?.kind === 'option' && selected.optionIndex === optionIndex
        return <button key={optionIndex} role={multi ? 'checkbox' : 'radio'} aria-checked={checked} disabled={sending}
          onKeyDown={event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault() }}
          onClick={event => multi ? toggle(optionIndex) : choose({ kind: 'option', optionIndex, value: option.label }, event.detail)}
          className={`question-option flex w-full gap-3 p-3 text-left${checked ? ' is-on' : ''}`}>
          {multi && <QuestionCheck on={checked} />}
          <span><strong>{option.label}{option.recommended ? ` (${t('questions.recommended')})` : ''}</strong>
            {option.description && <span className="mt-1 block text-xs text-[var(--text-muted)]">{option.description}</span>}</span>
        </button>
      })}
      <button role={multi ? 'checkbox' : 'radio'} aria-checked={other} disabled={sending} onClick={event => multi ? toggle(null) : choose({ kind: 'other' }, event.detail)}
        className={`question-option flex w-full gap-3 p-3 text-left${other ? ' is-on' : ''}`}>
        {multi && <QuestionCheck on={other} />}
        <span><strong>{t('questions.other')}{syntheticMetadata?.recommended ? ` (${t('questions.recommended')})` : ''}</strong>
          {syntheticMetadata?.description && <span className="mt-1 block text-xs text-[var(--text-muted)]">{syntheticMetadata.description}</span>}</span>
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
            <span key={item.id} className="question-dot" data-state={at === index ? 'current' : touched(item, drafts) ? 'answered' : 'pending'} />
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

/** The tick box of a multi-select option: it fills when the option is chosen. */
function QuestionCheck({ on }: { on: boolean }) {
  return <span className="question-check" data-on={on || undefined} aria-hidden="true" />
}

export default function Questions({ sessionId }: { sessionId: string }) {
  const requests = usePendingQuestions(sessionId)
  return <>{requests.map(request => <QuestionCard key={request.request_id} request={request} onResolved={() => refreshPendingQuestions(sessionId)} />)}</>
}
