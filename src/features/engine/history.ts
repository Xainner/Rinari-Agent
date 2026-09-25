import type { ChatMessage } from '../../types'
import type { HistoryMessage } from '../../services/engine'

/** Timestamp persistido → ms. Determinista: si el valor es inválido cae a 0. */
export function historyTimestamp(createdAt: string): number {
  const parsed = Date.parse(createdAt ?? '')
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Filas persistidas → mensajes UI. Solo contenido conversacional real.
 * Los tool calls viven en Activity, nunca como texto sintético de chat;
 * cada mensaje conserva su timestamp y orden persistidos (seq).
 */
export function historyToMessages(rows: HistoryMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  const sorted = [...rows].sort((a, b) => a.seq - b.seq)
  for (const row of sorted) {
    if (row.role !== 'user' && row.role !== 'assistant') continue
    const content = row.content ?? ''
    const attachmentRows: NonNullable<HistoryMessage['attachments']> = row.attachments?.length
      ? row.attachments
      : row.images?.map((image) => ({ uri: image.uri, sha256: image.sha256, kind: 'image' })) ?? []
    if (content === '' && attachmentRows.length === 0) continue
    out.push({
      id: `h${row.seq}`,
      role: row.role,
      content,
      createdAt: historyTimestamp(row.created_at),
      turnId: row.turn_id ?? undefined,
      origin: row.role === 'user' && row.origin && row.origin.kind !== 'user' ? row.origin
        : row.role === 'user' && (row.origin?.quoted_source || row.origin?.steer_id) ? row.origin : undefined,
      attachments: attachmentRows?.map((attachment, index) => ({
        id: attachment.id ?? attachment.uri,
        path: attachment.uri,
        name: attachment.name ?? (attachment.kind === 'image' ? `Imagen ${index + 1}` : `Adjunto ${index + 1}`),
        source: 'workspace' as const,
        uri: attachment.uri,
        sha256: attachment.sha256,
        mime_type: attachment.content_type,
        size: attachment.size,
        kind: (attachment.kind as 'image' | 'text' | 'pdf' | 'docx' | 'xlsx' | undefined) ?? 'image',
        derivedUri: attachment.derived_uri,
        images: attachment.images,
        ocr: attachment.ocr,
        truncated: attachment.truncated,
        warning: attachment.warning,
        status: 'ready' as const,
      })),
    })
  }
  return out
}
