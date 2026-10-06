/** Estado de los indicadores de atención que el renderer manda a main (indicators.ts). */
export type AttentionCategory = 'none' | 'needs_you' | 'failed' | 'done' | 'other'

export interface AttentionIndicators {
  generation: number
  count: number
  category: AttentionCategory
  working: number
  tooltip: string
  description: string
}
