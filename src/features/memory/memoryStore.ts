import { useSyncExternalStore } from 'react'
import { onEngineEvent, isCommandError } from '../../services/engine'
import { memoryApi } from '../../services/memory'
import type {
  CandidateDecision,
  CandidateEdits,
  CandidateStatus,
  LearnedFactsMode,
  MemoryCandidate,
  MemoryRecord,
  MemorySettings,
} from './types'
import { candidateStatus } from './types'

/**
 * Estado compartido de la memoria personal: lo leen Ajustes → Memoria y las
 * tarjetas del chat, así una propuesta aprobada en un sitio cambia en el otro.
 *
 * El Engine es la fuente: tras cada acción, y ante cualquier evento
 * `memory.*`, se vuelve a consultar (invalidación). Una sola carga y una sola
 * suscripción a eventos para todos los consumidores; se libera con el último.
 * Lo único local es el resultado de una acción mientras llega la recarga.
 */
export interface MemoryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  /** `null` si este Engine no expone `memory.settings.*`. */
  settings: MemorySettings | null
  settingsError: string
  records: MemoryRecord[]
  candidates: MemoryCandidate[]
  /** Resoluciones conocidas antes de que la recarga las traiga. */
  resolutions: Record<string, { status: Exclude<CandidateStatus, 'pending'>; memoryId?: string }>
  /** Recuerdos olvidados desde esta ventana (el aviso «Recordado» pasa a «Olvidado»). */
  forgotten: Record<string, true>
}

const INITIAL: MemoryState = {
  status: 'idle',
  error: '',
  settings: null,
  settingsError: '',
  records: [],
  candidates: [],
  resolutions: {},
  forgotten: {},
}

let state: MemoryState = INITIAL
const listeners = new Set<() => void>()
let generation = 0
let stopEvents: (() => void) | null = null
let active = false

function set(patch: Partial<MemoryState>) {
  state = { ...state, ...patch }
  for (const listener of [...listeners]) listener()
}

function message(error: unknown): string {
  return isCommandError(error) ? error.message : String(error)
}

/** Vuelve a leer recuerdos, propuestas y el ajuste. Lo usan todas las acciones. */
export async function refreshMemory(): Promise<void> {
  const current = ++generation
  if (state.status !== 'ready') set({ status: 'loading', error: '' })
  const [records, candidates, settings] = await Promise.allSettled([
    memoryApi.list(),
    memoryApi.candidates('all'),
    memoryApi.settingsGet(),
  ])
  if (current !== generation) return
  const failure = records.status === 'rejected' ? records.reason : candidates.status === 'rejected' ? candidates.reason : null
  const nextCandidates = candidates.status === 'fulfilled' ? candidates.value.candidates ?? [] : state.candidates
  // Una resolución local se conserva solo hasta que el Engine la confirme.
  const resolutions = Object.fromEntries(Object.entries(state.resolutions).filter(([id]) => {
    const known = nextCandidates.find((item) => item.id === id)
    return !known || candidateStatus(known.status) === 'pending'
  }))
  set({
    status: failure ? (state.status === 'ready' ? 'ready' : 'error') : 'ready',
    error: failure ? message(failure) : '',
    records: records.status === 'fulfilled' ? records.value.records ?? [] : state.records,
    candidates: nextCandidates,
    resolutions,
    settings: settings.status === 'fulfilled' ? settings.value : null,
    settingsError: settings.status === 'rejected' ? message(settings.reason) : '',
  })
}

function startEvents() {
  void onEngineEvent((event) => {
    if (!active || !event.event.startsWith('memory.')) return
    if (event.event === 'memory.candidate.resolved') {
      const id = typeof event.payload.candidate_id === 'string' ? event.payload.candidate_id : ''
      const status = candidateStatus(event.payload.status)
      if (id && status !== 'pending') {
        const memoryId = typeof event.payload.memory_id === 'string' ? event.payload.memory_id : undefined
        set({ resolutions: { ...state.resolutions, [id]: { status, memoryId } } })
      }
    }
    void refreshMemory()
  }).then((stop) => {
    if (active) stopEvents = stop
    else stop()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!active) {
    active = true
    startEvents()
    void refreshMemory()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    // Diferido: un remount inmediato reutiliza la carga en vez de repetirla.
    queueMicrotask(() => {
      if (listeners.size > 0 || !active) return
      active = false
      stopEvents?.()
      stopEvents = null
      generation++
      state = INITIAL
    })
  }
}

export function useMemoryState(): MemoryState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL)
}

/** Estado efectivo de una propuesta: lo resuelto aquí, lo que dice el Engine o lo del evento. */
export function effectiveCandidateStatus(
  current: MemoryState,
  candidateId: string,
  fallback: CandidateStatus,
): { status: CandidateStatus; memoryId?: string } {
  const local = current.resolutions[candidateId]
  if (local) return local
  const known = current.candidates.find((item) => item.id === candidateId)
  if (known) return { status: candidateStatus(known.status), memoryId: known.memory_id ?? undefined }
  return { status: fallback }
}

export async function resolveCandidate(id: string, decision: CandidateDecision, edits: CandidateEdits = {}) {
  const result = await memoryApi.resolveCandidate(id, decision, edits)
  const status = candidateStatus(result?.status) === 'pending'
    ? decision === 'deny' ? 'denied' : 'approved'
    : candidateStatus(result.status) as Exclude<CandidateStatus, 'pending'>
  set({ resolutions: { ...state.resolutions, [id]: { status, memoryId: result?.memory_id ?? undefined } } })
  void refreshMemory()
  return result
}

export async function updateMemory(record: MemoryRecord, fields: { text?: string; topic?: string }) {
  try {
    const { record: next } = await memoryApi.update(record.id, record.revision, fields)
    if (next) set({ records: state.records.map((item) => (item.id === next.id ? next : item)) })
    return next
  } finally {
    void refreshMemory()
  }
}

/**
 * Olvida un recuerdo. Sin revisión conocida (aviso «Recordado» del chat) se
 * pide la actual: «Deshacer» expresa una intención clara sobre ese recuerdo.
 * Un recuerdo que ya no existe cuenta como olvidado.
 */
export async function forgetMemory(id: string, revision?: number): Promise<void> {
  try {
    const expected = revision ?? (await memoryApi.get(id)).record.revision
    await memoryApi.forget(id, expected)
  } catch (error) {
    if (!(isCommandError(error) && error.code === 'NOT_FOUND')) {
      void refreshMemory()
      throw error
    }
  }
  set({ forgotten: { ...state.forgotten, [id]: true }, records: state.records.filter((item) => item.id !== id) })
  void refreshMemory()
}

export async function setLearnedFacts(mode: LearnedFactsMode): Promise<MemorySettings> {
  const next = await memoryApi.settingsSet(mode)
  set({ settings: next, settingsError: '' })
  return next
}

/** Para pruebas: descarta el estado compartido. */
export function resetMemoryStoreForTests(): void {
  active = false
  stopEvents?.()
  stopEvents = null
  listeners.clear()
  generation++
  state = INITIAL
}
