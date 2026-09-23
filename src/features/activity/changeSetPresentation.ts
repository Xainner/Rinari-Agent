import type { ChangeSetTimelineItem, TurnTimeline } from './types'

export type ChangeSetPresentation = 'hidden' | 'coverage-warning' | 'changes'
export function hasPartialCoverage(item: ChangeSetTimelineItem): boolean {
  return !item.attributionComplete || item.warnings.length > 0
}
export function changeSetPresentation(item: ChangeSetTimelineItem): ChangeSetPresentation {
  return item.files.length > 0 ? 'changes' : hasPartialCoverage(item) ? 'coverage-warning' : 'hidden'
}
export function presentedChangeSets(timeline: TurnTimeline) {
  const sets = timeline.items.filter((item): item is ChangeSetTimelineItem => item.type === 'changeset')
  const changes = sets.filter(item => changeSetPresentation(item) === 'changes')
  const emptyPartial = sets.filter(item => changeSetPresentation(item) === 'coverage-warning')
  return { changes, emptyPartial, latest: changes.at(-1) }
}

/** Only known, content-free Engine diagnostics are displayed. Older/custom engines
 * may put paths or command output in warnings; unknown strings stay in the audit. */
export function coverageDetailKeys(warnings: string[]) {
  return [...new Set(warnings.map(warning => warning === 'A shell or process command may have modified paths outside the bounded observation.'
    ? 'changes.coverage.shell' : warning === 'Workspace scan exceeded the attribution budget.'
      ? 'changes.coverage.budget' : 'changes.coverage.other'))]
}

