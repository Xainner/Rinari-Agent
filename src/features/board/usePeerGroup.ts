import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import {
  commandMessage,
  engineApi,
  isCommandError,
  onEngineEvent,
  type PeerGroup,
  type PeerGroupMember,
  type SessionSummary,
} from '../../services/engine'
import type { BoardPane } from '../../stores/board'

/** Miembros derivados del board: cada panel disponible, con su etiqueta y flags. */
export function peerMembersFor(
  panes: readonly BoardPane[],
  sessionsById: Record<string, SessionSummary | undefined>,
  fallbackLabel: string,
): PeerGroupMember[] {
  return panes
    .filter((pane) => sessionsById[pane.sessionId])
    .map((pane) => {
      const record = sessionsById[pane.sessionId]
      const label = record?.title || record?.project_root?.split(/[\\/]/).filter(Boolean).at(-1) || fallbackLabel
      return {
        session_id: pane.sessionId,
        label: label.slice(0, 120),
        send: pane.peerSend,
        receive: pane.peerReceive,
      }
    })
}

function sameMembers(a: PeerGroupMember[], b: PeerGroupMember[]): boolean {
  if (a.length !== b.length) return false
  const key = (m: PeerGroupMember) => `${m.session_id}${m.label}${m.send ? 1 : 0}${m.receive ? 1 : 0}`
  const left = new Set(a.map(key))
  return b.every((m) => left.has(key(m)))
}

export interface UsePeerGroupOptions {
  boardId: string
  panes: readonly BoardPane[]
  sessionsById: Record<string, SessionSummary | undefined>
  messagingEnabled: boolean
  /** `status.capabilities.session_peer_messaging_v1 === true` */
  supported: boolean
  engineReady: boolean
  /** Cambia cuando el proceso del Engine se reinicia: el grupo se vuelve a registrar. */
  engineGeneration: number
}

/**
 * Registra en el Engine el grupo de pares del board y lo mantiene alineado
 * con los paneles/flags. Idempotente por `board_id`; cada cambio viaja con la
 * `expected_revision` conocida y un CONFLICT relee el grupo y reintenta una vez.
 * Nunca infiere pares: solo lo que el store del board dice.
 */
export function usePeerGroup(options: UsePeerGroupOptions): void {
  const { boardId, panes, sessionsById, messagingEnabled, supported, engineReady, engineGeneration } = options
  const { t } = useI18n()
  const fallback = t('sidebar.newChat')
  const members = useMemo(() => peerMembersFor(panes, sessionsById, fallback), [panes, sessionsById, fallback])
  const membersKey = useMemo(
    () => members.map((m) => `${m.session_id}:${m.label}:${m.send ? 1 : 0}${m.receive ? 1 : 0}`).sort().join('|'),
    [members],
  )
  const known = useRef<{ generation: number; group: PeerGroup | null }>({ generation: -1, group: null })
  const inFlight = useRef<Promise<void> | null>(null)
  const lastApplied = useRef<{ key: string; enabled: boolean } | null>(null)

  useEffect(() => {
    if (!supported || !engineReady) return
    if (known.current.generation !== engineGeneration) {
      known.current = { generation: engineGeneration, group: null }
      lastApplied.current = null
    }
    const enabled = messagingEnabled && members.length > 0
    if (lastApplied.current && lastApplied.current.key === membersKey && lastApplied.current.enabled === enabled) return
    let cancelled = false

    const apply = async (retry: boolean): Promise<void> => {
      if (cancelled) return
      if (!known.current.group) {
        try {
          const current = await engineApi.peerGroupGet({ board_id: boardId })
          if (cancelled) return
          known.current.group = current.group
        } catch {
          // Sin grupo previo: se crea con revision 0.
        }
      }
      const current = known.current.group
      if (current && !members.length && !current.enabled) {
        lastApplied.current = { key: membersKey, enabled }
        return
      }
      if (current && current.enabled === enabled && sameMembers(current.members, members)) {
        lastApplied.current = { key: membersKey, enabled }
        return
      }
      try {
        const next = await engineApi.peerGroupSet({
          board_id: boardId,
          group_id: current?.group_id ?? null,
          expected_revision: current?.revision ?? 0,
          enabled,
          members,
        })
        if (cancelled) return
        known.current.group = next
        lastApplied.current = { key: membersKey, enabled }
      } catch (error) {
        if (cancelled) return
        if (isCommandError(error) && error.code === 'CONFLICT' && !retry) {
          known.current.group = null
          return apply(true)
        }
        toast.error(t('board.peers.groupError', { error: commandMessage(error) }), { id: 'board-peer-group' })
      }
    }

    const run = (inFlight.current ?? Promise.resolve()).then(() => apply(false))
    inFlight.current = run.finally(() => {
      if (inFlight.current === run) inFlight.current = null
    })
    return () => {
      cancelled = true
    }
  }, [boardId, members, membersKey, messagingEnabled, supported, engineReady, engineGeneration, t])

  // El Engine es la autoridad: si un cierre de sesión o un reinicio cambian
  // el grupo, la revisión conocida se actualiza y el siguiente cambio no choca.
  useEffect(() => {
    if (!supported) return
    let unlisten: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event !== 'session.peer.group.updated') return
      const payload = event.payload as Partial<PeerGroup>
      if (payload.board_id !== boardId || typeof payload.group_id !== 'string') return
      known.current.group = {
        group_id: payload.group_id,
        board_id: boardId,
        revision: typeof payload.revision === 'number' ? payload.revision : 0,
        authorization_epoch: typeof payload.authorization_epoch === 'number' ? payload.authorization_epoch : 0,
        enabled: payload.enabled === true,
        members: Array.isArray(payload.members) ? payload.members : [],
      }
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [boardId, supported])
}
