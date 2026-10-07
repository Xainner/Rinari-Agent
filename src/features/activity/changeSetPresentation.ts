import type { ChangeSetTimelineItem, TurnTimeline } from './types'

export type ChangeSetPresentation = 'hidden' | 'changes'
export function hasPartialCoverage(item: ChangeSetTimelineItem): boolean {
  return !item.attributionComplete || item.warnings.length > 0
}
/** Files decide, not the diff size: a binary, a delete or a rename change with
 * zero lines. A set with no files says nothing in the chat even when coverage
 * was partial: "no change observed" read as noise after a command that only
 * could have written. The coverage flag and warnings stay in the audit data. */
export function changeSetPresentation(item: ChangeSetTimelineItem): ChangeSetPresentation {
  return item.files.length > 0 ? 'changes' : 'hidden'
}
export function presentedChangeSets(timeline: TurnTimeline) {
  const sets = timeline.items.filter((item): item is ChangeSetTimelineItem => item.type === 'changeset')
  const changes = sets.filter(item => changeSetPresentation(item) === 'changes')
  return { changes, latest: changes.at(-1) }
}

