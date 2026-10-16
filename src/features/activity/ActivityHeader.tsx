import { LoaderCircle } from 'lucide-react'
import { useI18n, type I18nKey } from '../../i18n'
import { activityState, turnDuration, turnIsActive } from './activityPresentation'
import { toolCategory } from './formatActivity'
import { elapsedLabel } from './TurnMeta'
import TokenUsage from './TokenUsageIndicator'
import type { TurnTimeline } from './types'
import { ActivityText } from './ActivityText'

type Translate = ReturnType<typeof useI18n>['t']

/** Lo que Rinari hace ahora mismo, en una línea («Leyendo un archivo…», «Pensando…»). */
export function liveActionLabel(timeline: TurnTimeline, t: Translate): string {
  const state = activityState(timeline)
  if (state.kind === 'action') {
    const item = state.item
    if (item.type === 'tool') {
      const category = toolCategory(item.tool)
      return item.tool === 'agent.wait' ? t('activity.live.agents')
        : item.tool === 'wait.for' ? t('activity.live.wait')
        : category === 'other' ? t('activity.live.tool', { tool: item.tool })
          : t(`activity.live.${category}` as I18nKey)
    }
    if (item.type === 'vision') {
      const images = timeline.items.filter(i => i.type === 'vision' && i.route !== 'conversation')
      const total = images.reduce((n, i) => n + (i.type === 'vision' ? Math.max(1, i.images.length) : 0), 0)
      const finished = images.filter(i => 'status' in i && !['running', 'queued', 'preparing'].includes(i.status ?? '')).reduce((n, i) => n + (i.type === 'vision' ? Math.max(1, i.images.length) : 0), 0)
      return t('activity.live.vision', { n: finished, total })
    }
    return t(item.type === 'context' ? 'activity.live.context' : 'activity.live.verification')
  }
  if (state.kind === 'retrying') return t('activity.live.retrying', { n: state.retry.attempt, total: state.retry.maxAttempts })
  return t(`activity.live.${state.kind}` as I18nKey)
}

export function ActivityHeader({ timeline, now, previous = false }: { timeline: TurnTimeline; now: number; previous?: boolean }) {
  const { t } = useI18n()
  if (previous) return <span>{t('activity.previous')}</span>
  const state = activityState(timeline)
  const active = turnIsActive(timeline.status)
  const duration = turnDuration(timeline, now)
  let label: string
  if (state.kind !== 'action' && !active) {
    label = t(`activity.terminal.${timeline.status}` as I18nKey)
    if (duration !== null) label = t(`activity.terminal.${timeline.status}Duration` as I18nKey, { duration: elapsedLabel(duration) })
    else label += ` · ${t('activity.durationUnknown')}`
  } else label = liveActionLabel(timeline, t)
  return <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
    {active && <span className="w-full tabular-nums">{duration === null ? t('activity.inProgressUnknown') : t('activity.inProgress', { duration: elapsedLabel(duration) })}</span>}
    {active && <LoaderCircle size={13} aria-hidden="true" className="shrink-0 animate-spin motion-reduce:animate-none" />}
    <ActivityText active={active} role={active ? 'status' : undefined} aria-live={active ? 'polite' : undefined} className="min-w-0 break-words">{label}</ActivityText>
    {active && state.parallel > 0 && <span className="text-xs">{t('activity.parallelAgents', { n: state.parallel })}</span>}
    {state.kind === 'action' && state.simultaneous > 1 && <span className="text-xs">{t('activity.parallelActions', { n: state.simultaneous })}</span>}
    {active && <TokenUsage usage={timeline.usage} />}
  </span>
}
