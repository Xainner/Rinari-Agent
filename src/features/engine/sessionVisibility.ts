// Visibilidad de sesiones en el desktop.
// El engine devuelve estados de runtime (active/interrupted/stopped) además
// de los de archivo (closed/archived); solo estos últimos se ocultan.
// Ver: session.list excluye únicamente closed/archived por defecto.
import type { SessionSummary } from '../../services/engine'

export function isSessionHidden(item: Pick<SessionSummary, 'state'>): boolean {
  return item.state === 'closed' || item.state === 'archived'
}

/**
 * Presencia: la conversación continua con Rinari. No es uno de los chats: no
 * sale en la lista, ni en recientes, ni en cerradas o archivadas.
 */
export function isPresenceSession(item: Pick<SessionSummary, 'lineage_kind'> | null | undefined): boolean {
  return item?.lineage_kind === 'presence'
}

export function partitionSessions(items: SessionSummary[]): {
  visible: SessionSummary[]
  closed: SessionSummary[]
  archived: SessionSummary[]
} {
  const chats = items.filter((item) => !isPresenceSession(item))
  return {
    visible: chats.filter((item) => !isSessionHidden(item)),
    closed: chats.filter((item) => item.state === 'closed'),
    archived: chats.filter((item) => item.state === 'archived'),
  }
}
