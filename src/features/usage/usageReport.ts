import { create } from 'zustand'
import { platform } from '../../platform'

/** Una fila por modelo del informe de uso (#78). */
export interface UsageModelRow {
  model_id: string
  model_name: string
  provider_id?: string | null
  provider_alias?: string | null
  calls: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  cache_percent: number | null
  cost: number | null
}

export type UsageScope = 'session' | 'today' | 'project' | 'all'

export interface UsageWarning {
  kind: 'image_resent' | 'empty_answers' | 'no_cache' | 'loops' | (string & {})
  count: number
  max?: number
  model?: string | null
}

/** `usage.report` del Engine: sale de lo guardado, sin llamar al modelo. */
export interface UsageReport {
  scope: UsageScope
  ref: string | null
  generated_at: string
  models: UsageModelRow[]
  totals: Omit<UsageModelRow, 'model_id' | 'model_name' | 'provider_id' | 'provider_alias' | 'cache_percent'>
  tools: { total: number; ok: number; failed: number; top: Array<{ tool: string; count: number }> }
  compactions: number
  warnings: UsageWarning[]
  time: { first_at: string | null; last_at: string | null; active_ms: number }
}

export const usageApi = {
  report: (scope: UsageScope, ref: string | null, save?: { sessionId: string }) =>
    platform().command<{ report: UsageReport }>('usage_report', {
      scope,
      ref: ref ?? null,
      save: save ? true : null,
      session_id: save?.sessionId ?? null,
    }),
  list: (sessionId: string) => platform().command<{ reports: UsageReport[] }>('usage_report_list', { session_id: sessionId }),
}

/**
 * Las fotos de `/usage` de cada conversación (#78): se quedan en el chat con
 * su fecha y nunca van al modelo. Se leen al abrir la conversación.
 */
interface UsageReportsState {
  bySession: Record<string, UsageReport[]>
  load: (sessionId: string) => Promise<void>
  add: (sessionId: string, report: UsageReport) => void
}

export const useUsageReports = create<UsageReportsState>((set, get) => ({
  bySession: {},
  load: async (sessionId) => {
    if (!sessionId || get().bySession[sessionId]) return
    try {
      const { reports } = await usageApi.list(sessionId)
      set((state) => ({ bySession: { ...state.bySession, [sessionId]: reports } }))
    } catch {
      // Un Engine sin informes deja el chat como estaba.
    }
  },
  add: (sessionId, report) => set((state) => ({
    bySession: { ...state.bySession, [sessionId]: [...(state.bySession[sessionId] ?? []), report] },
  })),
}))

const number = (value: number) => value.toLocaleString('en-US')

/** El informe como texto para copiar o descargar, con el formato que pidió el dueño. */
export function usageMarkdown(report: UsageReport, labels: { title: string; scope: string }): string {
  const lines = [`# ${labels.title}`, '', `${labels.scope} · ${report.generated_at}`, '', 'Session:']
  for (const row of report.models) {
    lines.push(
      `  ${row.model_name}: ${row.calls} calls · ${number(row.input_tokens)} input · ${number(row.output_tokens)} output · ` +
        `${number(row.cache_read_tokens)} cache read · ${number(row.cache_write_tokens)} cache write` +
        (row.reasoning_tokens ? ` · ${number(row.reasoning_tokens)} reasoning` : '') +
        (row.cost !== null ? ` · $${row.cost.toFixed(4)}` : ''),
    )
  }
  const totals = report.totals
  lines.push(
    `  Total: ${totals.calls} calls · ${number(totals.input_tokens)} input · ${number(totals.output_tokens)} output` +
      (totals.cost !== null && totals.cost !== undefined ? ` · $${totals.cost.toFixed(4)}` : ''),
    '',
    `Tools: ${report.tools.total} (${report.tools.ok} ok, ${report.tools.failed} failed)` +
      (report.tools.top.length ? ` · ${report.tools.top.map((item) => `${item.tool} ${item.count}`).join(', ')}` : ''),
    `Compactions: ${report.compactions}`,
    `Active time: ${Math.round(report.time.active_ms / 1000)} s`,
  )
  if (report.warnings.length) {
    lines.push('', 'Warnings:', ...report.warnings.map((warning) => `  - ${warning.kind}: ${warning.count}`))
  }
  return `${lines.join('\n')}\n`
}

/**
 * Pinta en el chat el informe de uso de una conversación (#78): `/usage`,
 * `/context`, el «Detalles» del anillo y la tarjeta de contexto del resumen.
 */
export async function showUsageReport(sessionId: string): Promise<void> {
  const { report } = await usageApi.report('session', sessionId, { sessionId })
  useUsageReports.getState().add(sessionId, report)
}
