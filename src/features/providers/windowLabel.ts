import type { I18nKey } from '../../i18n'

type Translate = (key: I18nKey, vars?: Record<string, string | number>) => string

const NAMED: Record<string, I18nKey> = { rolling: 'providers.windowRolling', weekly: 'providers.windowWeekly', monthly: 'providers.windowMonthly' }

/**
 * A plan window's name in the owner's language: the ones the app knows by id,
 * else by its length (5 h, a week, a month), else the provider's own label.
 * A limit group other than the plan's own keeps its name in front.
 */
export function windowLabel(
  window: { id: string; label: string; scope?: string | null; duration_seconds?: number | null },
  t: Translate,
): string {
  if (NAMED[window.id]) return t(NAMED[window.id])
  const seconds = window.duration_seconds
  if (!seconds || seconds <= 0) return window.label
  const span = seconds === 7 * 86400
    ? t('providers.windowWeekly')
    : seconds >= 28 * 86400 && seconds <= 31 * 86400
      ? t('providers.windowMonthly')
      : seconds === 5 * 3600
        ? t('providers.windowRolling')
        : seconds === 3600
          ? t('providers.windowHourOne')
          : t('providers.windowHours', { n: Math.round((seconds / 3600) * 10) / 10 })
  const group = window.scope && window.scope !== 'default' && window.scope !== 'account' ? window.scope : null
  return group ? `${group} · ${span}` : span
}
