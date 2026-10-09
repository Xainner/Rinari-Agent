import { platform } from '../platform'
import type {
  CandidateDecision,
  CandidateEdits,
  LearnedFactsMode,
  MemoryCandidate,
  MemoryCandidatesResult,
  MemoryExport,
  MemoryImportSummary,
  MemoryListResult,
  MemoryRecord,
  MemorySettings,
} from '../features/memory/types'

/**
 * Memoria personal del Engine. Cada llamada es una fila de
 * `docs/migration/desktop-command-contract.json`; el renderer no guarda ni
 * decide nada: el Engine es la autoridad sobre lo que Rinari recuerda.
 */
export const memoryApi = {
  settingsGet: () => platform().command<MemorySettings>('memory_settings_get'),
  settingsSet: (learned_facts: LearnedFactsMode) =>
    platform().command<MemorySettings>('memory_settings_set', { learned_facts }),
  // `all`: también los hechos aprendidos de un proyecto, no solo los personales.
  list: () => platform().command<MemoryListResult>('memory_list', { scope: 'all' }),
  search: (query: string) => platform().command<MemoryListResult>('memory_search', { query, scope: 'all' }),
  get: (id: string) => platform().command<{ record: MemoryRecord }>('memory_get', { id }),
  update: (id: string, expected_revision: number, fields: { text?: string; topic?: string }) =>
    platform().command<{ record: MemoryRecord }>('memory_update', { id, expected_revision, ...fields }),
  forget: (id: string, expected_revision: number) =>
    platform().command<{ id: string; forgotten: boolean }>('memory_forget', { id, expected_revision }),
  /** Archivo portátil: recuerdos y lo olvidado, con su digest. */
  exportBundle: () => platform().command<MemoryExport>('memory_export'),
  /** `dry_run`: el resumen sin escribir nada, para que la persona confirme. */
  importBundle: (bundle: Record<string, unknown>, digest: string, dry_run: boolean) =>
    platform().command<MemoryImportSummary>('memory_import', { bundle, digest, dry_run }),
  candidates: (status: 'pending' | 'resolved' | 'all' = 'all') =>
    platform().command<MemoryCandidatesResult>('memory_candidates_list', { status }),
  /** El Engine responde `{candidate}`; se acepta también la fila sola. */
  resolveCandidate: async (id: string, decision: CandidateDecision, edits: CandidateEdits = {}) => {
    const result = await platform().command<MemoryCandidate | { candidate: MemoryCandidate }>(
      'memory_candidate_resolve',
      { id, decision, ...(decision === 'allow_once' ? edits : {}) },
    )
    return 'candidate' in result && result.candidate && typeof result.candidate === 'object'
      ? result.candidate
      : (result as MemoryCandidate)
  },
}
