import { platform } from '../platform'
import type {
  CandidateDecision,
  CandidateEdits,
  LearnedFactsMode,
  MemoryCandidate,
  MemoryCandidatesResult,
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
  list: () => platform().command<MemoryListResult>('memory_list'),
  search: (query: string) => platform().command<MemoryListResult>('memory_search', { query }),
  get: (id: string) => platform().command<{ record: MemoryRecord }>('memory_get', { id }),
  update: (id: string, expected_revision: number, fields: { text?: string; topic?: string }) =>
    platform().command<{ record: MemoryRecord }>('memory_update', { id, expected_revision, ...fields }),
  forget: (id: string, expected_revision: number) =>
    platform().command<{ id: string; forgotten: boolean }>('memory_forget', { id, expected_revision }),
  candidates: (status: 'pending' | 'resolved' | 'all' = 'all') =>
    platform().command<MemoryCandidatesResult>('memory_candidates_list', { status }),
  /** El Engine anterior envolvía la respuesta en `{candidate}`; el contrato nuevo la devuelve sola. */
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
