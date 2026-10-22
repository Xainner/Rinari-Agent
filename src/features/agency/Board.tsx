import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ClipboardList, RotateCcw, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import Markdown from '../../components/Markdown'
import { FileFromContext } from '../files/FileWorkspace'
import { useI18n, type I18nKey } from '../../i18n'
import { commandMessage, engineApi, onEngineEvent } from '../../services/engine'
import { useAgencyStore } from '../../stores/agency'
import { cn } from '../../lib/utils'
import type { Errand, ErrandStatus } from './types'

const TONE: Record<ErrandStatus, string> = {
  pending: 'neutral',
  in_progress: 'accent',
  delivered: 'success',
  reviewed: 'success',
  returned: 'warning',
  blocked: 'danger',
  cancelled: 'neutral',
}

/** Motivos que el Engine da como código: se dicen en el idioma del dueño. */
const REASON_CODES = new Set(['stopped_by_owner', 'too_many_returns', 'team archived', 'its agent left'])
function reasonText(reason: string, t: ReturnType<typeof useI18n>['t']): string {
  if (!REASON_CODES.has(reason)) return reason
  return t(`agency.errand.reason.${reason.replace(/ /g, '_')}` as I18nKey)
}

interface ErrandCardProps {
  errand: Errand
  /** id → nombre de los agentes, para decir de quién y para quién. */
  names: Map<string, string>
  compact?: boolean
  onChanged?: () => void
}

/**
 * Un recado (D-3, D-26): qué es, para quién, cómo se sabe que está hecho y en
 * qué va. El dueño revisa cualquier recado entregado (lo pidiera él o un
 * agente: si nadie lo cierra, queda abierto), reintenta uno trabado o lo
 * cancela. El resultado se lee con el formato del chat.
 */
export function ErrandCard({ errand, names, compact = false, onChanged }: ErrandCardProps) {
  const { t } = useI18n()
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')
  // Names, never raw ids: an agent that is gone says so.
  const to = errand.to_agent_id ? names.get(errand.to_agent_id) ?? t('agency.agent.gone') : t('agency.errand.nobody')
  const from = errand.from_agent_id ? names.get(errand.from_agent_id) ?? t('agency.agent.gone') : null
  const open = errand.status === 'pending' || errand.status === 'in_progress' || errand.status === 'returned' || errand.status === 'blocked'

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work()
      onChanged?.()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  return (
    <article className="agency-errand" data-status={errand.status} data-testid="agency-errand">
      <header className="agency-errand-head">
        <ClipboardList size={14} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-semibold">{errand.title}</span>
        <span className="r-chip" data-tone={TONE[errand.status]}>{t(`agency.errand.status.${errand.status}` as I18nKey)}</span>
      </header>
      <p className="agency-errand-who">{from ? t('agency.errand.who', { from, to }) : t('agency.errand.whoOwner', { to })}</p>
      {!compact && errand.body && <p className="agency-errand-body">{errand.body}</p>}
      {!compact && errand.done_when.length > 0 && (
        <ul className="agency-errand-checks" aria-label={t('agency.errand.doneWhen')}>
          {errand.done_when.map((check) => <li key={check}>{check}</li>)}
        </ul>
      )}
      {errand.result?.summary && (errand.status === 'delivered' || errand.status === 'reviewed') && (
        <div className={cn('agency-errand-result', compact && 'is-compact')} data-testid="agency-errand-result">
          {/* Sus enlaces son de la carpeta del puesto que lo hizo. */}
          <FileFromContext.Provider value={errand.session_id ?? undefined}>
            <Markdown>{errand.result.summary}</Markdown>
          </FileFromContext.Provider>
        </div>
      )}
      {errand.return_reason && (errand.status === 'returned' || errand.status === 'blocked' || errand.status === 'pending') && (
        <p className="agency-errand-reason">{t(errand.status === 'blocked' ? 'agency.errand.blockedWhy' : 'agency.errand.returnedWhy', { reason: reasonText(errand.return_reason, t) })}</p>
      )}
      {returning ? (
        <div className="flex flex-wrap gap-2">
          <input className="field-input min-w-0 flex-1" value={reason} maxLength={300} autoFocus placeholder={t('agency.errand.reason')} aria-label={t('agency.errand.reason')} onChange={(event) => setReason(event.target.value)} />
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setReturning(false)}>{t('agency.settings.cancel')}</button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={!reason.trim()}
            onClick={() => void act(async () => {
              await engineApi.agencyReviewErrand(errand.id, false, reason.trim())
              setReturning(false)
              setReason('')
            })}
          >
            {t('agency.errand.sendBack')}
          </button>
        </div>
      ) : (
        <div className="agency-errand-actions">
          {errand.status === 'delivered' && (
            <>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => void act(() => engineApi.agencyReviewErrand(errand.id, true))} data-testid="agency-errand-accept">
                <Check size={12} aria-hidden="true" /> {t('agency.errand.accept')}
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setReturning(true)}>
                <Undo2 size={12} aria-hidden="true" /> {t('agency.errand.return')}
              </button>
            </>
          )}
          {errand.status === 'blocked' && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => void act(() => engineApi.agencyRetryErrand(errand.id))} data-testid="agency-errand-retry">
              <RotateCcw size={12} aria-hidden="true" /> {t('agency.errand.retry')}
            </button>
          )}
          {open && (
            <button type="button" className="btn btn-quiet btn-xs" onClick={() => void act(() => engineApi.agencyCancelErrand(errand.id))} aria-label={`${t('agency.errand.cancel')} · ${errand.title}`}>
              <X size={12} aria-hidden="true" /> {t('agency.errand.cancel')}
            </button>
          )}
        </div>
      )}
    </article>
  )
}

const COLUMNS: { key: string; statuses: ErrandStatus[] }[] = [
  { key: 'pending', statuses: ['pending', 'returned', 'blocked'] },
  { key: 'in_progress', statuses: ['in_progress'] },
  { key: 'delivered', statuses: ['delivered', 'reviewed'] },
]

/** Una ráfaga de mensajes de la oficina es una sola recarga. */
const TEAM_RELOAD_DEBOUNCE_MS = 200

/**
 * Llama a `reload` cuando cambia algo de este equipo (su oficina o su
 * pizarra), una vez por ráfaga de eventos.
 */
export function useTeamEvents(teamId: string | null, reload: () => void) {
  useEffect(() => {
    if (!teamId) return
    reload()
    let stop: (() => void) | undefined
    let disposed = false
    let timer: number | undefined
    void onEngineEvent((event) => {
      const payload = event.payload as { team_id?: string } | undefined
      if ((event.event === 'agency.office.message' || event.event === 'agency.team.changed') && payload?.team_id === teamId) {
        window.clearTimeout(timer)
        timer = window.setTimeout(reload, TEAM_RELOAD_DEBOUNCE_MS)
      }
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      window.clearTimeout(timer)
      stop?.()
    }
  }, [reload, teamId])
}

/** Los recados de un equipo y los nombres de sus agentes, al día con los eventos del Engine. */
export function useTeamBoard(teamId: string | null) {
  const [errands, setErrands] = useState<Errand[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [teamName, setTeamName] = useState('')

  const seq = useRef(0)
  const reload = useCallback(async () => {
    if (!teamId) return
    const mine = ++seq.current
    try {
      const [board, agents] = await Promise.all([engineApi.agencyTeam(teamId), engineApi.agencyAgents({ includeArchived: true })])
      if (mine !== seq.current) return
      setErrands(board.errands)
      setTeamName(board.team.name)
      setNames(new Map(agents.agents.map((agent) => [agent.id, agent.name])))
    } catch {
      // El Engine puede estar reiniciando: queda lo último que se supo.
    }
  }, [teamId])

  useTeamEvents(teamId, useCallback(() => void reload(), [reload]))

  return { errands, names, teamName, reload }
}

/**
 * La pizarra de un equipo (D-4, D-14): la cola de recados, en orden. Cada
 * puesto toma el siguiente cuando está libre, de a uno (Vía 1, D-28).
 */
export function BoardPanel({ teamId }: { teamId: string }) {
  const { t } = useI18n()
  const { errands, names, teamName, reload } = useTeamBoard(teamId)
  const visible = errands.filter((errand) => errand.status !== 'cancelled')

  return (
    <div className="agency-board" data-testid="agency-board">
      {teamName && <p className="agency-board-team">{t('agency.board.of', { name: teamName })}</p>}
      {visible.length === 0 ? (
        <p className="field-hint px-1">{t('agency.board.empty')}</p>
      ) : (
        COLUMNS.map((column) => {
          const items = visible.filter((errand) => column.statuses.includes(errand.status))
          return (
            <section key={column.key} className="agency-board-column" aria-label={t(`agency.board.${column.key}` as I18nKey)}>
              <h3 className="agency-board-heading">{t(`agency.board.${column.key}` as I18nKey)} <span>{items.length}</span></h3>
              {items.map((errand) => <ErrandCard key={errand.id} errand={errand} names={names} compact onChanged={() => void reload()} />)}
            </section>
          )
        })
      )}
    </div>
  )
}

/** «Pizarra» en el panel lateral de un puesto: la del equipo de esa conversación. */
export function PostBoard({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const post = useAgencyStore((state) => state.postSessions[sessionId])
  if (!post) return <p className="field-hint p-3">{t('agency.board.notPost')}</p>
  return <BoardPanel teamId={post.teamId} />
}
