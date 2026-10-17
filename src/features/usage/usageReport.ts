import { create } from 'zustand'
import { version as APP_VERSION } from '../../../package.json'
import { platform } from '../../platform'
import type { ProviderUsageSnapshot } from '../../types/protocol.generated'

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

/** Los límites del plan de un proveedor, tomados al hacer el informe (#78). */
export interface UsageLimits extends Pick<ProviderUsageSnapshot, 'status' | 'windows' | 'balances' | 'detail' | 'fetched_at'> {
  provider_id: string
  provider_alias: string | null
  product_id: string | null
  /** El proveedor de esta conversación: sale primero, aunque no informe nada. */
  conversation: boolean
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
  /** Quién hizo el informe; falta en las fotos de antes de 0.4.0. */
  client?: { app_version: string | null; engine_version: string | null; profile: string | null; provider: string | null; model: string | null }
  /** El contexto de la conversación en ese momento (solo «Esta conversación»). */
  context?: { window_tokens: number; used_tokens: number | null; compact_at_tokens: number | null; last_compaction_at: string | null } | null
  /** Límites del plan: el proveedor de la conversación y los demás conectados. */
  limits?: UsageLimits[]
}

export const usageApi = {
  report: (scope: UsageScope, ref: string | null, save?: { sessionId: string }) =>
    platform().command<{ report: UsageReport }>('usage_report', {
      scope,
      ref: ref ?? null,
      save: save ? true : null,
      session_id: save?.sessionId ?? null,
      app_version: APP_VERSION,
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
  const lines = [`# ${labels.title}`, '', `${labels.scope} · ${report.generated_at}`]
  const client = report.client
  if (client) {
    const who = [
      client.app_version && `Rinari Agent ${client.app_version}`,
      client.engine_version && `Engine ${client.engine_version}`,
      client.profile && `profile ${client.profile}`,
      [client.provider, client.model].filter(Boolean).join(' / '),
    ].filter(Boolean)
    if (who.length) lines.push(who.join(' · '))
  }
  if (report.limits?.length) {
    lines.push('', 'Plan limits:')
    for (const item of report.limits) {
      const name = item.provider_alias ?? item.provider_id
      if (!item.windows.length && !item.balances.length) {
        lines.push(`  ${name}: not reported (${item.detail || item.status})`)
        continue
      }
      for (const window of item.windows) {
        const used = window.used_percent !== null && window.used_percent !== undefined ? `${Math.round(window.used_percent)}% used` : 'unknown'
        lines.push(`  ${name} · ${window.label || window.id}: ${used}${window.resets_at ? ` · resets ${window.resets_at}` : ''}`)
      }
      for (const balance of item.balances) {
        lines.push(`  ${name} · ${balance.label}: ${balance.unlimited ? 'unlimited' : balance.remaining ?? '—'} ${balance.currency ?? ''}`.trimEnd())
      }
    }
  }
  if (report.context?.window_tokens) {
    const { used_tokens: used, window_tokens: total } = report.context
    lines.push('', 'Context:', `  ${used ? number(used) : '—'} of ${number(total)} tokens${used ? ` (${Math.round((100 * used) / total)}%)` : ''} · ${report.compactions} compactions`)
  }
  lines.push('', 'Session:')
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
    `Active time: ${Math.round(report.time.active_ms / 1000)} s` +
      (report.time.first_at && report.time.last_at ? ` · from ${report.time.first_at} to ${report.time.last_at}` : ''),
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
