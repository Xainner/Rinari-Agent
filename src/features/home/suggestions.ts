import type { I18nKey } from '../../i18n'
export interface HomeContext { projectName: string | null; changedFiles: number | null; attachmentCount: number }
export interface HomeSuggestion { id: string; group: 'general' | 'project' | 'attachment' | 'multiple' | 'git'; icon: 'code' | 'plan' | 'concept' | 'file'; title: I18nKey; description: I18nKey; prompt: I18nKey }
export const suggestionCatalog: HomeSuggestion[] = [
  { id: 'code', group: 'general', icon: 'code', title: 'home.code.title', description: 'home.code.description', prompt: 'home.code.prompt' },
  { id: 'plan', group: 'general', icon: 'plan', title: 'home.plan.title', description: 'home.plan.description', prompt: 'home.plan.prompt' },
  { id: 'concept', group: 'general', icon: 'concept', title: 'home.concept.title', description: 'home.concept.description', prompt: 'home.concept.prompt' },
  { id: 'file', group: 'general', icon: 'file', title: 'home.file.title', description: 'home.file.description', prompt: 'home.file.prompt' },
  { id: 'architecture', group: 'project', icon: 'code', title: 'home.architecture.title', description: 'home.architecture.description', prompt: 'home.architecture.prompt' },
  { id: 'improvement', group: 'project', icon: 'plan', title: 'home.improvement.title', description: 'home.improvement.description', prompt: 'home.improvement.prompt' },
  { id: 'problem', group: 'project', icon: 'concept', title: 'home.problem.title', description: 'home.problem.description', prompt: 'home.problem.prompt' },
  { id: 'tests', group: 'project', icon: 'file', title: 'home.tests.title', description: 'home.tests.description', prompt: 'home.tests.prompt' },
  { id: 'analyze', group: 'attachment', icon: 'code', title: 'home.analyze.title', description: 'home.analyze.description', prompt: 'home.analyze.prompt' },
  { id: 'explain', group: 'attachment', icon: 'concept', title: 'home.explain.title', description: 'home.explain.description', prompt: 'home.explain.prompt' },
  { id: 'compare', group: 'multiple', icon: 'file', title: 'home.compare.title', description: 'home.compare.description', prompt: 'home.compare.prompt' },
  { id: 'fileplan', group: 'attachment', icon: 'plan', title: 'home.fileplan.title', description: 'home.fileplan.description', prompt: 'home.fileplan.prompt' },
  { id: 'review', group: 'git', icon: 'code', title: 'home.review.title', description: 'home.review.description', prompt: 'home.review.prompt' },
  { id: 'regressions', group: 'git', icon: 'concept', title: 'home.regressions.title', description: 'home.regressions.description', prompt: 'home.regressions.prompt' },
  { id: 'verify', group: 'git', icon: 'plan', title: 'home.verify.title', description: 'home.verify.description', prompt: 'home.verify.prompt' },
  { id: 'summary', group: 'git', icon: 'file', title: 'home.summary.title', description: 'home.summary.description', prompt: 'home.summary.prompt' },
  { id: 'decisions', group: 'general', icon: 'plan', title: 'home.decisions.title', description: 'home.decisions.description', prompt: 'home.decisions.prompt' },
  { id: 'debug', group: 'general', icon: 'code', title: 'home.debug.title', description: 'home.debug.description', prompt: 'home.debug.prompt' },
]
export function applicableSuggestions(context: HomeContext): HomeSuggestion[] {
  const rank = (group: HomeSuggestion['group']) => group === 'attachment' || group === 'multiple' ? 0 : group === 'git' ? 1 : group === 'project' ? 2 : 3
  return suggestionCatalog.filter(item => item.group === 'general'
    || item.group === 'project' && Boolean(context.projectName)
    || item.group === 'git' && context.changedFiles !== null && context.changedFiles > 0
    || item.group === 'attachment' && context.attachmentCount > 0
    || item.group === 'multiple' && context.attachmentCount > 1)
    .sort((a, b) => rank(a.group) - rank(b.group))
}
export function suggestionPage(items: HomeSuggestion[], offset: number): HomeSuggestion[] {
  return Array.from({ length: Math.min(4, items.length) }, (_, index) => items[(offset + index) % items.length])
}
