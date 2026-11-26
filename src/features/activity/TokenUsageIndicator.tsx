import { useI18n } from '../../i18n'
import type { TurnTokenUsage } from '../../types/protocol.generated'
import { formatTokens } from './tokenUsage'
import { numberFormat } from '../../lib/numberFormat'

/** «1 token», «2 tokens»: the same word in Spanish and English. */
const tokenWord = (count: number) => count === 1 ? 'token' : 'tokens'

/**
 * What the turn produced: the model's output tokens, every call of the turn
 * included (subagents too), like «↓ 1.2K tokens». While a call streams the
 * Engine estimates them from the text; when it ends the provider's count
 * replaces the estimate, so the number may step up (reasoning is counted
 * then). Nothing is shown before the first output token.
 *
 * No live region or number tween: reconciliations may legitimately decrease.
 * The full breakdown goes in a visually hidden text and the compact number is
 * hidden from assistive technology. An `aria-label` on a plain `<span>` is not
 * allowed for the generic role and screen readers ignore it inconsistently.
 */
export default function TokenUsage({ usage }: { usage?: TurnTokenUsage }) {
  const { t, lang } = useI18n()
  if (!usage || usage.output_tokens <= 0) return null
  const number = (n: number) => numberFormat(lang).format(n)
  const context = typeof usage.context_tokens === 'number' && usage.context_tokens > 0 ? usage.context_tokens : null
  const details = [
    `${t('usage.output')}: ${number(usage.output_tokens)} ${tokenWord(usage.output_tokens)}`,
    usage.reasoning_tokens != null && `${t('usage.reasoning')}: ${number(usage.reasoning_tokens)}`,
    `${t('usage.input')}: ${number(usage.input_tokens)}`,
    usage.cached_input_tokens != null && `${t('usage.cache')}: ${number(usage.cached_input_tokens)}`,
    `${t('usage.turnCost')}: ${number(usage.total_tokens)} ${tokenWord(usage.total_tokens)}`,
    context !== null && `${t('usage.context')}: ${number(context)}`,
    `${t('usage.calls')}: ${number(usage.model_calls)}`,
    t(`usage.${usage.source}`),
  ].filter(Boolean).join(' · ')
  return <span className="token-usage tabular-nums" title={details}>
    <span data-testid="token-usage" aria-hidden="true">
      <span className="token-usage-arrow">↓</span> {usage.source === 'reported' ? '' : '~'}{formatTokens(usage.output_tokens, lang)} {tokenWord(usage.output_tokens)}
    </span>
    <span className="sr-only">{details}</span>
  </span>
}
