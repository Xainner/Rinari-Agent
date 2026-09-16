// Visibilidad de sesiones en el desktop.
// El engine devuelve estados de runtime (active/interrupted/stopped) además
// de los de archivo (closed/archived); solo estos últimos se ocultan.
// Ver: session.list excluye únicamente closed/archived por defecto.
import type { SessionSummary } from '../../services/engine'

export function isSessionHidden(item: Pick<SessionSummary, 'state'>): boolean {
  return item.state === 'closed' || item.state === 'archived'
}

export function partitionSessions(items: SessionSummary[]): {
  visible: SessionSummary[]
  closed: SessionSummary[]
  archived: SessionSummary[]
} {
  return {
    visible: items.filter((item) => !isSessionHidden(item)),
    closed: items.filter((item) => item.state === 'closed'),
    archived: items.filter((item) => item.state === 'archived'),
  }
}
