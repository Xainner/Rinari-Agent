import type { QuestionRequest } from '../../services/desktop'
export type Question = QuestionRequest['questions'][number]
export type QuestionSelection = { kind: 'option'; optionIndex: number; value: string } | { kind: 'other' }
export type QuestionDrafts = { selections: Record<string, QuestionSelection>; customText: Record<string, string> }
export const isOther = (label: string) => ['otra', 'other'].includes(label.trim().toLocaleLowerCase())
export const fixedOptions = (question: Question) => (question.options ?? []).map((option, index) => ({ option, index })).filter(({ option }) => !isOther(option.label))
export function selectionFor(question: Question, drafts: QuestionDrafts): QuestionSelection | undefined {
  return drafts.selections[question.id] ?? (fixedOptions(question).length === 0 ? { kind: 'other' } : undefined)
}
export function answerFor(question: Question, drafts: QuestionDrafts): string {
  const selection = selectionFor(question, drafts)
  return selection?.kind === 'option' ? selection.value : selection?.kind === 'other' ? (drafts.customText[question.id] ?? '').trim() : ''
}
export function answersFor(request: QuestionRequest, drafts: QuestionDrafts): Record<string, string> | null {
  const entries = request.questions.map(question => [question.id, answerFor(question, drafts)] as const)
  return entries.length > 0 && entries.every(([, answer]) => answer.trim().length > 0) ? Object.fromEntries(entries) : null
}
