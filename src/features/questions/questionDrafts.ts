import type { QuestionRequest } from '../../services/desktop'
export type Question = QuestionRequest['questions'][number]
export type QuestionSelection = { kind: 'option'; optionIndex: number; value: string } | { kind: 'other' }
/** What is ticked on a multi-select question: options by index, and «Otra». */
export type QuestionPicks = { options: number[]; other: boolean }
export type QuestionDrafts = {
  selections: Record<string, QuestionSelection>
  customText: Record<string, string>
  picks: Record<string, QuestionPicks>
}
export type QuestionAnswer = string | string[]
export const emptyDrafts = (): QuestionDrafts => ({ selections: {}, customText: {}, picks: {} })
export const isOther = (label: string) => ['otra', 'other'].includes(label.trim().toLocaleLowerCase())
export const isMulti = (question: Question) => question.multi_select === true
export const fixedOptions = (question: Question) => (question.options ?? []).map((option, index) => ({ option, index })).filter(({ option }) => !isOther(option.label))
export function selectionFor(question: Question, drafts: QuestionDrafts): QuestionSelection | undefined {
  return drafts.selections[question.id] ?? (fixedOptions(question).length === 0 ? { kind: 'other' } : undefined)
}
export function picksFor(question: Question, drafts: QuestionDrafts): QuestionPicks {
  return drafts.picks[question.id] ?? { options: [], other: fixedOptions(question).length === 0 }
}
/** Ticks or unticks one option (or «Otra» with `null`) of a multi-select question. */
export function togglePick(question: Question, drafts: QuestionDrafts, optionIndex: number | null): QuestionDrafts {
  const current = picksFor(question, drafts)
  const next = optionIndex === null
    ? { ...current, other: !current.other }
    : { ...current, options: current.options.includes(optionIndex) ? current.options.filter(index => index !== optionIndex) : [...current.options, optionIndex] }
  return { ...drafts, picks: { ...drafts.picks, [question.id]: next } }
}
/** True when the question shows «Otra» as chosen, so its text box is open. */
export function otherOn(question: Question, drafts: QuestionDrafts): boolean {
  return isMulti(question) ? picksFor(question, drafts).other : selectionFor(question, drafts)?.kind === 'other'
}
export function answerFor(question: Question, drafts: QuestionDrafts): QuestionAnswer {
  const custom = (drafts.customText[question.id] ?? '').trim()
  if (isMulti(question)) {
    const picks = picksFor(question, drafts)
    // In the options' own order, whatever order they were ticked in.
    const labels = fixedOptions(question).filter(({ index }) => picks.options.includes(index)).map(({ option }) => option.label)
    return picks.other && custom && !labels.includes(custom) ? [...labels, custom] : labels
  }
  const selection = selectionFor(question, drafts)
  return selection?.kind === 'option' ? selection.value : selection?.kind === 'other' ? custom : ''
}
/** A question is answered with a choice, or with «Otra» and its text written. */
export function hasAnswer(question: Question, drafts: QuestionDrafts): boolean {
  const answer = answerFor(question, drafts)
  if (!isMulti(question)) return typeof answer === 'string' && answer.trim().length > 0
  const picks = picksFor(question, drafts)
  return answer.length > 0 && (!picks.other || Boolean((drafts.customText[question.id] ?? '').trim()))
}
/** Whether the progress dot shows the question as answered. */
export function touched(question: Question, drafts: QuestionDrafts): boolean {
  if (!isMulti(question)) return Boolean(selectionFor(question, drafts))
  const picks = picksFor(question, drafts)
  return picks.options.length > 0 || picks.other
}
export function answersFor(request: QuestionRequest, drafts: QuestionDrafts): Record<string, QuestionAnswer> | null {
  if (request.questions.length === 0 || !request.questions.every(question => hasAnswer(question, drafts))) return null
  return Object.fromEntries(request.questions.map(question => [question.id, answerFor(question, drafts)]))
}
