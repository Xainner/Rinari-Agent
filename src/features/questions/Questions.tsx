import { useState } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp, X } from 'lucide-react'
import { toast } from 'sonner'
import { desktopApi, type QuestionRequest } from '../../services/desktop'
import { commandMessage } from '../../services/engine'
import { refreshPendingQuestions, usePendingQuestions } from './usePendingQuestions'

export function QuestionCard({
  request,
  onResolved,
}: {
  request: QuestionRequest
  onResolved: () => void
}) {
  const [index, setIndex] = useState(0)
  const [minimized, setMinimized] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const question = request.questions[index]
  async function submit(skip: boolean) {
    if (sending) return
    setSending(true)
    try {
      await desktopApi.answer(request, answers, skip)
      onResolved()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSending(false)
    }
  }
  if (minimized)
    return (
      <button className="mb-3 flex items-center gap-2 text-sm" onClick={() => setMinimized(false)}>
        <CircleHelp size={16} /> Esperando tu respuesta · Mostrar preguntas
      </button>
    )
  return (
    <section
      aria-label="Preguntas de Rinari"
      className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold">{question.title}</h3>
        <button aria-label="Minimizar preguntas" onClick={() => setMinimized(true)}>
          <X size={16} />
        </button>
      </div>
      <div role="radiogroup" aria-label={question.title} className="space-y-1">
        {question.options?.map((option, i) => (
          <button
            key={i}
            role="radio"
            aria-checked={answers[question.id] === option.label}
            disabled={sending}
            onClick={() => setAnswers({ ...answers, [question.id]: option.label })}
            className={`flex w-full gap-3 rounded-xl p-3 text-left hover:bg-[var(--bg-hover)] ${answers[question.id] === option.label ? 'bg-[var(--bg-hover)] ring-1 ring-[var(--accent)]' : ''}`}
          >
            <span className="text-[var(--text-subtle)]">{i + 1}</span>
            <span>
              <strong>
                {option.label}
                {option.recommended ? ' (Recomendado)' : ''}
              </strong>
              {option.description && (
                <span className="mt-1 block text-xs text-[var(--text-muted)]">
                  {option.description}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      <textarea
        aria-label="Tu respuesta"
        placeholder="Escribe tu respuesta o una alternativa…"
        value={answers[question.id] ?? ''}
        disabled={sending}
        maxLength={8000}
        onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
        className="mt-3 w-full resize-none rounded-xl border border-[var(--border)] bg-transparent p-3 outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          aria-label="Pregunta anterior"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs">
          {index + 1} / {request.questions.length}
        </span>
        <button
          aria-label="Pregunta siguiente"
          disabled={index === request.questions.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <span className="flex-1" />
        <button disabled={sending} onClick={() => void submit(true)} className="px-3 py-1.5">
          Omitir
        </button>
        <button
          disabled={sending || request.questions.some((q) => !answers[q.id]?.trim())}
          onClick={() => void submit(false)}
          className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-white disabled:opacity-40"
        >
          {sending ? 'Enviando…' : 'Enviar respuesta'}
        </button>
      </div>
    </section>
  )
}

/**
 * Tarjetas de preguntas pendientes de una sesión. Consume el controlador
 * compartido (`usePendingQuestions`): una carga y una suscripción por sesión,
 * también cuando el badge del header del panel muestra la misma colección.
 */
export default function Questions({ sessionId }: { sessionId: string }) {
  const requests = usePendingQuestions(sessionId)
  return (
    <>
      {requests.map((request) => (
        <QuestionCard
          key={request.request_id}
          request={request}
          onResolved={() => refreshPendingQuestions(sessionId)}
        />
      ))}
    </>
  )
}
