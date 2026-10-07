import { platform } from '../../platform'

/**
 * Servicio documental del Engine (documents.*). El escritorio no abre ZIP de
 * Office ni ejecuta nada de un documento: pide inspección, lectura acotada y
 * renders, y muestra lo que el Engine devuelve.
 */

export type DocumentKind = 'pptx' | 'xlsx' | 'docx' | 'pdf'
export const DOCUMENT_KINDS: readonly DocumentKind[] = ['pptx', 'xlsx', 'docx', 'pdf']

export interface DocumentRevision {
  id: string
  session_id: string
  document_id: string
  parent_id: string | null
  kind: string
  name: string
  uri: string
  sha256: string
  size: number
  operation: string
  backend: string | null
  state: string
  report: DocumentReport | null
  created_at: string
}

export interface DocumentCheck {
  status: 'passed' | 'failed' | 'partial' | 'not_run' | 'not_applicable'
  reason?: string
  evidence?: Record<string, unknown>
  findings?: Array<Record<string, unknown>>
}

export interface SemanticChange {
  change: 'content_changed' | 'shape_added' | 'shape_removed' | 'slide_added' | 'slide_removed' | 'slides_reordered' | 'notes_changed'
  slide_id?: number
  index?: number
  shape_id?: number
  before?: string
  after?: string
}

export interface DocumentReport {
  revision_id: string
  sha256: string
  status: DocumentCheck['status']
  checks: Record<string, DocumentCheck>
  warnings: Array<{ code: string; severity?: string; scope?: string; detail?: string }>
  /** draft | final | accepted_draft */
  deliverable_state?: string
  semantic_diff?: SemanticChange[]
  visual_review?: { pages: number[]; page_count: number; reviewer?: string; at?: string }
}

export interface DocumentRisk { code: string; detail: string; count?: number }

export interface DocumentInspectionResult {
  revision: DocumentRevision
  container: { kind: string; part_count: number; expanded_bytes: number; encrypted: boolean; risks: DocumentRisk[] }
  inspection: Record<string, unknown> | null
  editable?: boolean
  reason?: string
}

export interface PreviewPage { page: number; uri: string; width?: number; height?: number }

export interface DocumentPreview {
  revision_id: string
  backend: string | null
  pdf_uri: string | null
  pages: PreviewPage[]
}

export interface DocumentJobError { code: string; message: string; retryable?: boolean; action?: string }

export interface DocumentJob {
  job_id: string
  session_id: string
  operation: string
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelling' | 'cancelled' | 'interrupted'
  phase: string | null
  progress: { done: number; total: number | null } | null
  result: (Partial<DocumentPreview> & { page_count?: number; cached?: boolean }) | null
  error: DocumentJobError | null
}

export interface DocumentCapability {
  kind: string
  operation: string
  available: boolean
  backend?: string | null
  reason?: string
  action?: string
}

export const ACTIVE_JOB = new Set<DocumentJob['status']>(['queued', 'running', 'cancelling'])

export function documentKind(name: string): DocumentKind | null {
  const suffix = name.toLowerCase().split(/[?#]/)[0].split('.').at(-1) ?? ''
  return (DOCUMENT_KINDS as readonly string[]).includes(suffix) ? (suffix as DocumentKind) : null
}

export const documentsApi = {
  capabilities: (kind?: DocumentKind, operation?: string) =>
    platform().command<{ capabilities: DocumentCapability[] }>('documents_capabilities_get', {
      kind: kind ?? null,
      operation: operation ?? null,
    }),
  importFile: (session_id: string, path: string, turn_id?: string) =>
    platform().command<{ revision: DocumentRevision }>('documents_import', { session_id, path, turn_id: turn_id ?? null }),
  inspect: (session_id: string, ref: string) =>
    platform().command<DocumentInspectionResult>('documents_inspect', { session_id, ref }),
  render: (session_id: string, ref: string, pages?: number[]) =>
    platform().command<DocumentJob>('documents_job_start', { session_id, operation: 'render', ref, pages: pages ?? null }),
  job: (session_id: string, job_id: string) =>
    platform().command<DocumentJob>('documents_job_get', { session_id, job_id }),
  cancel: (session_id: string, job_id: string) =>
    platform().command<DocumentJob>('documents_job_cancel', { session_id, job_id }),
  preview: (session_id: string, ref: string) =>
    platform().command<{ revision: DocumentRevision; preview: DocumentPreview | null }>('documents_preview_get', { session_id, ref }),
  range: (session_id: string, ref: string, selection?: string, cursor?: number) =>
    platform().command<Record<string, unknown> & { truncated?: boolean; next_cursor?: number | null }>('documents_range_get', {
      session_id,
      ref,
      selection: selection ?? null,
      cursor: cursor ?? null,
    }),
  /** `validate` corre la validación si la revisión aún no tiene informe. */
  report: (session_id: string, revision_id: string, validate = false) =>
    platform().command<{ revision_id: string; report: DocumentReport | null }>('documents_report_get', { session_id, revision_id, validate }),
  revisions: (session_id: string, document_id?: string) =>
    platform().command<{ revisions: DocumentRevision[] }>('documents_revisions_list', { session_id, document_id: document_id ?? null }),
}
