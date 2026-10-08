import { LoaderCircle } from 'lucide-react'
import { useI18n, type I18nKey } from '../../i18n'
import { activityState, turnDuration, turnIsActive } from './activityPresentation'
import { toolCategory } from './formatActivity'
import { elapsedLabel } from './TurnMeta'
import TokenUsage from './TokenUsageIndicator'
import type { TurnTimeline } from './types'

export function ActivityHeader({ timeline, now, previous = false }: { timeline: TurnTimeline; now: number; previous?: boolean }) {
  const { t } = useI18n()
  if (previous) return <span>{t('activity.previous')}</span>
  const state = activityState(timeline)
  const active = turnIsActive(timeline.status)
  const duration = turnDuration(timeline, now)
  let label: string
  if (state.kind === 'action') {
    const item = state.item
    if (item.type === 'tool') {
      const category = toolCategory(item.tool)
      label = item.tool === 'agent.wait' ? t('activity.live.agents')
        : category === 'other' ? t('activity.live.tool', { tool: item.tool })
          : t(`activity.live.${category}` as I18nKey)
    } else if (item.type === 'vision') {
      const images = timeline.items.filter(i => i.type === 'vision' && i.route !== 'conversation')
      const total = images.reduce((n, i) => n + (i.type === 'vision' ? Math.max(1, i.images.length) : 0), 0)
      const finished = images.filter(i => 'status' in i && !['running', 'queued', 'preparing'].includes(i.status ?? '')).reduce((n, i) => n + (i.type === 'vision' ? Math.max(1, i.images.length) : 0), 0)
      label = t('activity.live.vision', { n: finished, total })
    } else label = t(item.type === 'context' ? 'activity.live.context' : 'activity.live.verification')
  } else if (!active) {
    label = t(`activity.terminal.${timeline.status}` as I18nKey)
    if (duration !== null) label = t(`activity.terminal.${timeline.status}Duration` as I18nKey, { duration: elapsedLabel(duration) })
    else label += ` · ${t('activity.durationUnknown')}`
  } else label = t(`activity.live.${state.kind}` as I18nKey)
  return <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
    {active && <span className="w-full tabular-nums">{duration === null ? t('activity.inProgressUnknown') : t('activity.inProgress', { duration: elapsedLabel(duration) })}</span>}
    {active && <LoaderCircle size={13} aria-hidden="true" className="shrink-0 animate-spin motion-reduce:animate-none" />}
    <span role={active ? 'status' : undefined} aria-live={active ? 'polite' : undefined} className="min-w-0 break-words">{label}</span>
    {active && state.parallel > 0 && <span className="text-xs">{t('activity.parallelAgents', { n: state.parallel })}</span>}
    {state.kind === 'action' && state.simultaneous > 1 && <span className="text-xs">{t('activity.parallelActions', { n: state.simultaneous })}</span>}
    {active && <TokenUsage usage={timeline.usage} />}
  </span>
}
