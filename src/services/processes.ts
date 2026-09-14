import { invoke } from '@tauri-apps/api/core'
import type { ManagedProcess, ProcessOutput } from '../types/protocol.generated'

export interface ProcessListResult {
  processes: ManagedProcess[]
  truncated: boolean
}

export interface ProcessStopResult {
  id: string
  running: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === 'number'
}

export function isManagedProcess(value: unknown): value is ManagedProcess {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id === '') return false
  if (typeof value.kind !== 'string' || value.kind === '') return false
  if (typeof value.command !== 'string') return false
  if (typeof value.cwd !== 'string') return false
  if (typeof value.running !== 'boolean') return false
  if (typeof value.can_stop !== 'boolean') return false
  if (!isOptionalString(value.url)) return false
  if (!isOptionalNumber(value.pid)) return false
  if (!isOptionalNumber(value.started_at)) return false
  const exitCode = (value as Record<string, unknown>).exit_code
  if (!(exitCode === undefined || exitCode === null || typeof exitCode === 'number')) return false
  return true
}

export function isProcessListResult(value: unknown): value is ProcessListResult {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.processes)) return false
  if (typeof value.truncated !== 'boolean') return false
  return (value.processes as unknown[]).every(isManagedProcess)
}

export function isProcessOutput(value: unknown): value is ProcessOutput {
  if (!isRecord(value)) return false
  if (!isManagedProcess(value.process)) return false
  if (typeof value.stdout !== 'string') return false
  if (typeof value.stderr !== 'string') return false
  if (typeof value.truncated !== 'boolean') return false
  return true
}

export function isProcessStopResult(value: unknown): value is ProcessStopResult {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id === '') return false
  if (typeof value.running !== 'boolean') return false
  return true
}

function requireSession(sessionId: string): void {
  if (typeof sessionId !== 'string' || sessionId === '') {
    throw new Error('processes: sessionId requerido; no se crea ni se infiere sesión')
  }
}

function requireId(id: string): void {
  if (typeof id !== 'string' || id === '') {
    throw new Error('processes: id de recurso requerido (opaco, íntegro)')
  }
}

/**
 * Fachada tipada al bridge existente. No ejecuta shell ni señales;
 * reenvía sesión + ID opaco con snake_case y valida el envelope
 * antes de que la UI actualice estado.
 */
export const processesApi = {
  async list(sessionId: string): Promise<ProcessListResult> {
    requireSession(sessionId)
    const raw = await invoke<unknown>('workspace_process_list', { session_id: sessionId })
    if (!isProcessListResult(raw)) throw new Error('processes: respuesta list malformada')
    return raw
  },

  async read(sessionId: string, id: string): Promise<ProcessOutput> {
    requireSession(sessionId)
    requireId(id)
    const raw = await invoke<unknown>('workspace_process_read', { session_id: sessionId, id })
    if (!isProcessOutput(raw)) throw new Error('processes: respuesta read malformada')
    return raw
  },

  async stop(sessionId: string, id: string): Promise<ProcessStopResult> {
    requireSession(sessionId)
    requireId(id)
    const raw = await invoke<unknown>('workspace_process_stop', { session_id: sessionId, id })
    if (!isProcessStopResult(raw)) throw new Error('processes: respuesta stop malformada')
    return raw
  },
}

export type ProcessesApi = typeof processesApi
