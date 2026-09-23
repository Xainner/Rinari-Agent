import { useI18n } from '../../i18n'
import type { TurnTokenUsage } from '../../types/protocol.generated'
import { formatTokens } from './tokenUsage'

/**
 * No live region or number tween: reconciliations may legitimately decrease.
 *
 * The full breakdown goes in a visually hidden text and the compact number is
 * hidden from assistive technology. An `aria-label` on a plain `<span>` is not
 * allowed for the generic role and screen readers ignore it inconsistently.
 */
export default function TokenUsage({ usage }: { usage?: TurnTokenUsage }) {
  const { t, lang } = useI18n()
  if (!usage) return null
  const number = (n: number) => new Intl.NumberFormat(lang).format(n)
  const details = [
    `${number(usage.total_tokens)} tokens`,
    `${t('usage.input')}: ${number(usage.input_tokens)}`,
    `${t('usage.output')}: ${number(usage.output_tokens)}`,
    usage.cached_input_tokens != null && `${t('usage.cache')}: ${number(usage.cached_input_tokens)}`,
    usage.reasoning_tokens != null && `${t('usage.reasoning')}: ${number(usage.reasoning_tokens)}`,
    `${t('usage.calls')}: ${number(usage.model_calls)}`,
    t(`usage.${usage.source}`),
  ].filter(Boolean).join(' · ')
  return <span className="tabular-nums" title={details}>
    <span data-testid="token-usage" aria-hidden="true">
      {usage.source === 'reported' ? '' : '~'}{formatTokens(usage.total_tokens, lang)} tokens
    </span>
    <span className="sr-only">{details}</span>
  </span>
}
