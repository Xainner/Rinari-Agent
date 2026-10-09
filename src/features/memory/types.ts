/**
 * Tipos de la memoria personal tal como los describe el contrato del Engine
 * para la memoria visible.
 *
 * Se tipan aquí porque `protocol.generated.ts` todavía no declara
 * `memory.settings.*` ni los eventos `memory.candidate.*`/`memory.remembered`:
 * al regenerar los tipos desde el schema nuevo, este módulo debe reexportar
 * los generados en lugar de declararlos.
 */

/** Qué hace Rinari con lo que aprende sin que se lo pidas. */
export type LearnedFactsMode = 'ask' | 'auto'

export interface MemorySettings {
  learned_facts: LearnedFactsMode
}

/**
 * Tipo de recuerdo. Los cuatro primeros son los del contrato; `rule` es el
 * nombre que usaba el Engine anterior. Un tipo desconocido se muestra tal cual.
 */
export type MemoryKind = 'environment' | 'workflow' | 'preference' | 'fact' | 'rule' | (string & {})

export interface MemoryRecord {
  id: string
  topic: string
  text: string
  kind: MemoryKind
  scope: string
  provenance?: string | null
  created_at?: string | null
  updated_at?: string | null
  /** Concurrencia optimista: `memory.update`/`memory.forget` la exigen. */
  revision: number
}

export interface MemoryListResult {
  scope: 'user' | string
  records: MemoryRecord[]
  count: number
  query?: string
}

/** Estado normalizado de una propuesta, sea cual sea el nombre del Engine. */
export type CandidateStatus = 'pending' | 'approved' | 'denied'

export interface MemoryCandidate {
  id: string
  session_id?: string | null
  topic: string
  text: string
  kind: MemoryKind
  scope?: string
  reason?: string | null
  sensitive?: boolean
  status: string
  created_at?: string | null
  memory_id?: string | null
}

export interface MemoryCandidatesResult {
  candidates: MemoryCandidate[]
  count: number
}

export type CandidateDecision = 'allow_once' | 'deny'

/** Lo que el usuario cambió antes de aprobar. Solo viajan los campos tocados. */
export interface CandidateEdits {
  text?: string
  topic?: string
}

/** `memory.candidate.created` dentro de un turno. */
export interface MemoryCandidateCreatedEvent {
  candidate_id: string
  topic: string
  text: string
  kind: MemoryKind
  scope?: string
  reason?: string
  sensitive?: boolean
}

/** `memory.remembered`: modo automático, ya guardado. */
export interface MemoryRememberedEvent {
  memory_id: string
  topic: string
  text: string
  kind: MemoryKind
  scope?: string
}

/** `memory.candidate.resolved`: desde el chat, desde Ajustes o desde la CLI. */
export interface MemoryCandidateResolvedEvent {
  candidate_id: string
  status: 'approved' | 'denied' | string
  memory_id?: string
}

/** El Engine anterior decía `accepted`; el contrato nuevo, `approved`. */
export function candidateStatus(value: unknown): CandidateStatus {
  if (value === 'approved' || value === 'accepted' || value === 'allowed') return 'approved'
  if (value === 'denied' || value === 'rejected' || value === 'dismissed') return 'denied'
  return 'pending'
}

/** Orden y nombres de los filtros por tipo en Ajustes. */
export const MEMORY_KINDS = ['environment', 'workflow', 'preference', 'fact'] as const
