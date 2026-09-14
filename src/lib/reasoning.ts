export const REASONING_LEVELS = ['off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
export type ReasoningEffort = typeof REASONING_LEVELS[number]

export function supportsEffort(capabilities: Record<string, unknown> | null | undefined, level: ReasoningEffort): boolean {
  if (level === 'off') return true
  if (capabilities?.reasoning === false || capabilities?.reasoning_effort === false) return false
  const reasoning = capabilities?.reasoning
  const levels = capabilities?.reasoning_levels ?? (typeof reasoning === 'object' && reasoning !== null ? (reasoning as Record<string, unknown>).supported_efforts : undefined)
  if (Array.isArray(levels)) return levels.includes(level)
  return capabilities?.reasoning_effort === true || reasoning === true
}
