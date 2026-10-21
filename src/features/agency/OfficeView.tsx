import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ClipboardList, KanbanSquare, SendHorizontal, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { Select } from '../../components/ui/select'
import { commandMessage, engineApi, onEngineEvent } from '../../services/engine'
import agencyIcon from '../../assets/agency/agency-icon.webp'
import { BoardPanel, ErrandCard } from './Board'
import type { AgencyAgent, AgencyTeam, Errand, OfficeMessage } from './types'

const NOBODY = '__chief__'

interface OfficeViewProps {
  team: AgencyTeam
  agents: AgencyAgent[]
  onEditTeam: (team: AgencyTeam) => void
}

/** La @mención que se está escribiendo justo antes del cursor, si hay una. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const match = /(^|[\s(])@([^\s@]{0,30})$/u.exec(before)
  if (!match) return null
  return { start: caret - match[2].length - 1, query: match[2] }
}

/** El texto de un mensaje con sus @menciones resaltadas. */
function MessageText({ text, names }: { text: string; names: string[] }) {
  const parts = useMemo(() => {
    if (names.length === 0) return [text]
    const escaped = [...names].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return text.split(new RegExp(`(@(?:${escaped.join('|')}))(?![\\p{L}\\p{N}_])`, 'giu'))
  }, [text, names])
  return (
    <p className="agency-office-text">
      {parts.map((part, index) => (index % 2 === 1 ? <span key={index} className="agency-mention">{part}</span> : part))}
    </p>
  )
}

/**
 * La oficina de un equipo (A2): un chat de grupo del dueño y sus agentes, no
 * una conversación con un modelo. Solo una @mención despierta a alguien
 * (D-1); su respuesta vuelve aquí. «Recado» deja un pedido en la pizarra
 * (D-3), que cada puesto toma de a uno (Vía 1, D-28). «/recado» en el
 * mensaje abre lo mismo.
 */
export default function OfficeView({ team, agents, onEditTeam }: OfficeViewProps) {
  const { t } = useI18n()
  const [messages, setMessages] = useState<OfficeMessage[]>([])
  const [errands, setErrands] = useState<Errand[]>([])
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [picked, setPicked] = useState(0)
  // Escape cierra la lista de @menciones hasta que se vuelva a escribir.
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [errandOpen, setErrandOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [checks, setChecks] = useState('')
  const [to, setTo] = useState<string>(NOBODY)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  const members = useMemo(
    () => team.members.map((id) => agents.find((agent) => agent.id === id)).filter((agent): agent is AgencyAgent => Boolean(agent)),
    [team.members, agents],
  )
  const names = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents])
  const errandsById = useMemo(() => new Map(errands.map((errand) => [errand.id, errand])), [errands])
  // La tarjeta de un recado va una sola vez, en el mensaje que lo dejó; los siguientes (la entrega) solo lo nombran.
  const cardAt = useMemo(() => {
    const first = new Map<string, string>()
    for (const message of messages) if (message.errand_id && !first.has(message.errand_id)) first.set(message.errand_id, message.id)
    return new Set(first.values())
  }, [messages])

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.agencyTeam(team.id)
      setMessages(result.messages)
      setErrands(result.errands)
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }, [team.id])

  useEffect(() => {
    void reload()
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      const payload = event.payload as { team_id?: string } | undefined
      if ((event.event === 'agency.office.message' || event.event === 'agency.team.changed') && payload?.team_id === team.id) void reload()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [reload, team.id])

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length])

  const mention = dismissed ? null : mentionQuery(text, caret)
  const suggestions = mention
    ? members.filter((agent) => agent.name.toLowerCase().startsWith(mention.query.toLowerCase())).slice(0, 6)
    : []

  const choose = (agent: AgencyAgent) => {
    if (!mention) return
    const next = `${text.slice(0, mention.start)}@${agent.name} ${text.slice(caret)}`
    const position = mention.start + agent.name.length + 2
    setText(next)
    setCaret(position)
    setPicked(0)
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(position, position)
    })
  }

  const send = async () => {
    const message = text.trim()
    if (!message) return
    // «/recado …» abre el recado con ese título en vez de escribir en la oficina.
    const slash = /^\/recado\b\s*(.*)$/isu.exec(message)
    if (slash) {
      setTitle(slash[1].trim())
      setErrandOpen(true)
      setText('')
      return
    }
    setSending(true)
    try {
      await engineApi.agencyOfficePost(team.id, message)
      setText('')
      setCaret(0)
      await reload()
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setPicked((current) => (current + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        choose(suggestions[Math.min(picked, suggestions.length - 1)])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  const leaveErrand = async () => {
    if (!title.trim()) return
    try {
      await engineApi.agencyCreateErrand(team.id, {
        title: title.trim(),
        body: body.trim(),
        done_when: checks.split('\n').map((line) => line.trim()).filter(Boolean),
        to_agent_id: to === NOBODY ? null : to,
      })
      setErrandOpen(false)
      setTitle('')
      setBody('')
      setChecks('')
      setTo(NOBODY)
      await reload()
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  const chiefName = team.chief_agent_id ? names.get(team.chief_agent_id) : null

  return (
    <div className={cn('agency-office', boardOpen && 'has-board')} data-testid="agency-office">
      <div className="agency-office-main">
        <header className="agency-office-head">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[20px] font-semibold text-[var(--text)]">{team.name}</h1>
            <p className="truncate text-[12.5px] text-[var(--text-muted)]">
              {team.purpose || t('agency.office.members', { n: members.length })}
              {chiefName ? ` · ${t('agency.office.chief', { name: chiefName })}` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setErrandOpen((open) => !open)} aria-expanded={errandOpen} data-testid="agency-office-errand">
            <ClipboardList size={13} aria-hidden="true" /> {t('agency.office.errand')}
          </button>
          <button type="button" className={cn('btn btn-ghost btn-sm', boardOpen && 'is-active')} onClick={() => setBoardOpen((open) => !open)} aria-pressed={boardOpen} data-testid="agency-office-board">
            <KanbanSquare size={13} aria-hidden="true" /> {t('dock.view.board')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEditTeam(team)}>
            <SlidersHorizontal size={13} aria-hidden="true" /> {t('agency.office.card')}
          </button>
        </header>

        <div className="agency-office-log" role="log" aria-live="polite" aria-label={t('agency.office.log', { name: team.name })}>
          {messages.length === 0 ? (
            <p className="agency-office-empty">{t('agency.office.empty')}</p>
          ) : (
            messages.map((message) => {
              const author = message.author_kind === 'owner' ? t('agency.office.you') : names.get(message.agent_id ?? '') ?? message.agent_id
              const errand = message.errand_id && cardAt.has(message.id) ? errandsById.get(message.errand_id) : undefined
              return (
                <div key={message.id} className={cn('agency-office-message', message.author_kind === 'owner' && 'is-owner')} data-testid="agency-office-message">
                  {message.author_kind === 'agent' ? (
                    <img src={agencyIcon} alt="" className="agency-office-avatar" draggable={false} />
                  ) : (
                    <span className="agency-office-avatar is-owner" aria-hidden="true">{t('agency.office.youShort')}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="agency-office-author">
                      {author}
                      <time className="agency-office-time" dateTime={new Date(message.created_at * 1000).toISOString()}>
                        {new Date(message.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </p>
                    <MessageText text={message.text} names={members.map((agent) => agent.name)} />
                    {errand && <ErrandCard errand={errand} names={names} onChanged={() => void reload()} />}
                  </div>
                </div>
              )
            })
          )}
          <div ref={end} />
        </div>

        {errandOpen && (
          <form
            className="agency-errand-form"
            data-testid="agency-errand-form"
            onSubmit={(event) => {
              event.preventDefault()
              void leaveErrand()
            }}
          >
            <div className="agency-form-grid">
              <label className="grid gap-1">
                <span className="field-label">{t('agency.errand.title')}</span>
                <input className="field-input" value={title} maxLength={200} required autoFocus onChange={(event) => setTitle(event.target.value)} data-testid="agency-errand-title" />
              </label>
              <div className="grid gap-1">
                <span className="field-label">{t('agency.errand.to')}</span>
                <Select
                  value={to}
                  label={t('agency.errand.to')}
                  options={[
                    { value: NOBODY, label: chiefName ? t('agency.errand.toChief', { name: chiefName }) : t('agency.errand.nobody') },
                    ...members.map((agent) => ({ value: agent.id, label: agent.name })),
                  ]}
                  onChange={setTo}
                  testId="agency-errand-to"
                />
              </div>
            </div>
            <label className="grid gap-1">
              <span className="field-label">{t('agency.errand.body')}</span>
              <textarea className="field-input min-h-[60px] resize-y" value={body} maxLength={8000} onChange={(event) => setBody(event.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="field-label">{t('agency.errand.doneWhen')}</span>
              <textarea className="field-input min-h-[60px] resize-y" value={checks} placeholder={t('agency.errand.doneWhenPlaceholder')} onChange={(event) => setChecks(event.target.value)} data-testid="agency-errand-checks" />
              <span className="field-hint">{t('agency.errand.doneWhenHint')}</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setErrandOpen(false)}>{t('agency.settings.cancel')}</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={!title.trim()} data-testid="agency-errand-submit">{t('agency.errand.leave')}</button>
            </div>
          </form>
        )}

        <div className="agency-office-composer">
          {suggestions.length > 0 && (
            <ul className="agency-mention-list" role="listbox" aria-label={t('agency.office.mention')} data-testid="agency-mention-list">
              <li role="presentation" className="agency-mention-hint">{t('agency.office.mentionHint')}</li>
              {suggestions.map((agent, index) => (
                <li key={agent.id} role="option" aria-selected={index === picked}>
                  <button
                    type="button"
                    className={cn('agency-mention-option', index === picked && 'is-active')}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      choose(agent)
                    }}
                  >
                    <img src={agencyIcon} alt="" className="agency-post-avatar" draggable={false} />
                    <span className="truncate">{agent.name}</span>
                    {agent.role && <span className="truncate text-[11px] text-[var(--text-subtle)]">{agent.role}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={input}
            className="field-input agency-office-input"
            value={text}
            rows={2}
            maxLength={8000}
            placeholder={t('agency.office.placeholder')}
            aria-label={t('agency.office.placeholder')}
            onChange={(event) => {
              setText(event.target.value)
              setCaret(event.target.selectionStart ?? event.target.value.length)
              setPicked(0)
              setDismissed(false)
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            data-testid="agency-office-input"
          />
          <button type="button" className="btn btn-primary btn-sm" disabled={sending || !text.trim()} onClick={() => void send()} aria-label={t('agency.office.send')} data-testid="agency-office-send">
            <SendHorizontal size={14} aria-hidden="true" />
          </button>
          <p className="agency-office-hint">{t('agency.office.hint')}</p>
        </div>
      </div>
      {boardOpen && (
        <aside className="agency-office-board" aria-label={t('dock.view.board')}>
          <BoardPanel teamId={team.id} />
        </aside>
      )}
    </div>
  )
}
