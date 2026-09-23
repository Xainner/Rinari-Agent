import type { ContextStatus } from '../../types/protocol.generated'

/** Typed views of the nested parts of `context.status`, which the generator leaves open. */

export type ContextSource = ContextStatus['window_source']
export type CheckResult = 'passed' | 'repaired' | 'failed'
export type CheckName = 'structure' | 'records' | 'reduction'
export const CHECKS: readonly CheckName[] = ['structure', 'records', 'reduction']

/** A row of `context.models`: a model's capacity, or why it could not be read. */
export type ModelContext = Partial<ContextStatus> & { model_id: string; model_alias?: string; error?: string }

export interface LastRequest {
  input_tokens: number
  measurement: 'reported'
  at: string
}

export type CompactionState = 'started' | 'completed' | 'failed' | 'cancelled' | 'skipped'
const STATES: readonly CompactionState[] = ['started', 'completed', 'failed', 'cancelled', 'skipped']

export interface LastCompaction {
  status: CompactionState
  reason?: string
  used_tokens?: number
  after_tokens?: number
  dropped_messages?: number
  duration_ms?: number
  checks: Partial<Record<CheckName, CheckResult>>
  error?: string
  at?: string
}

const count = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)

export function checksOf(value: unknown): Partial<Record<CheckName, CheckResult>> {
  if (!value || typeof value !== 'object') return {}
  const result: Partial<Record<CheckName, CheckResult>> = {}
  for (const name of CHECKS) {
    const outcome = (value as Record<string, unknown>)[name]
    if (outcome === 'passed' || outcome === 'repaired' || outcome === 'failed') result[name] = outcome
  }
  return result
}

export function lastRequest(status: ContextStatus | undefined): LastRequest | null {
  const value = status?.last_request
  if (!value || !count(value.input_tokens)) return null
  return { input_tokens: value.input_tokens, measurement: 'reported', at: text(value.at) ?? '' }
}

export function lastCompaction(status: ContextStatus | undefined): LastCompaction | null {
  const value = status?.last_compaction
  const state = STATES.find((known) => known === value?.status)
  if (!value || !state) return null
  return {
    status: state,
    reason: text(value.reason),
    used_tokens: count(value.used_tokens) ? value.used_tokens : undefined,
    after_tokens: count(value.after_tokens) ? value.after_tokens : undefined,
    dropped_messages: count(value.dropped_messages) ? value.dropped_messages : undefined,
    duration_ms: count(value.duration_ms) ? value.duration_ms : undefined,
    checks: checksOf(value.checks),
    error: text(value.error),
    at: text(value.at),
  }
}

type SourceKey = `context.source.${ContextSource}` | 'context.source.catalogDated'

/** The i18n key and values that name where a window came from. */
export function sourceLabel(
  source: ContextSource | undefined,
  updatedAt: string | null | undefined,
  lang: string,
): { key: SourceKey; values: Record<string, string> } {
  if (source === 'catalog') {
    const date = updatedAt ? new Date(updatedAt) : null
    const day = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(lang, { dateStyle: 'medium' }) : ''
    return day ? { key: 'context.source.catalogDated', values: { date: day } } : { key: 'context.source.catalog', values: {} }
  }
  return { key: `context.source.${source ?? 'fallback'}`, values: {} }
}

export const formatTokens = (value: number, lang: string) => new Intl.NumberFormat(lang).format(value)

export const formatSeconds = (ms: number, lang: string) =>
  new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: ms < 10_000 ? 1 : 0 }).format(ms / 1000)
