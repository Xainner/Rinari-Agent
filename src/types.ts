/** Shared UI types. Engine-owned domain types live in services/engine.ts. */

import type { MessageOrigin } from './types/protocol.generated'

export type Language = 'es' | 'en'

export type Role = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: Role
  content: string
  createdAt: number
  /** Fallback waiting state when no protocol-backed execution is available. */
  pending?: boolean
  turnId?: string
  attachments?: AttachmentRef[]
  /**
   * Procedencia del mensaje de rol usuario: `peer` = lo envió el agente de
   * otro panel (dato no confiable), `user` con `quoted_source` = reenviado a
   * mano por el usuario. Ausente o `user` sin cita = lo escribió el usuario.
   */
  origin?: MessageOrigin | null
}

export type SessionKind = 'chat' | 'project'

export interface PendingApproval {
  approval_id: string
  session_id: string | null
  turn_id: string | null
  capability: string
  target: string | null
  risk: string
  description: string
  status?: 'pending' | 'resolving' | 'expired'
}

export interface TurnStopReason {
  code: string
  message: string
  modelCalls?: number
  toolCalls?: number
  wallTimeS?: number
}

export interface AttachmentRef {
  id: string
  path: string
  name: string
  mime_type?: string
  size?: number
  source: 'native' | 'workspace'
  status?: 'preparing' | 'ready' | 'error'
  error?: string
  previewUrl?: string
  uri?: string
  sha256?: string
  kind?: 'image' | 'text' | 'pdf' | 'docx' | 'xlsx'
  derivedUri?: string
  images?: Array<{ uri: string; sha256?: string }>
  ocr?: boolean
  pageRange?: string
  visualPages?: number[]
  truncated?: boolean
  warning?: string
  data_url?: string
}
