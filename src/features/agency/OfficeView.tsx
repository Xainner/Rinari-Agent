import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, OctagonPause, Play, PauseCircle, Workflow } from 'lucide-react'
import Markdown, { type MarkdownExtension } from '../../components/Markdown'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { commandMessage, engineApi } from '../../services/engine'
import { ErrandCard, useTeamEvents } from './Board'
import { PresentedFiles } from '../activity/PresentedFiles'
import { FileFromContext } from '../files/FileWorkspace'
import AgentAvatar from './AgentAvatar'
import { openErrand } from './OfficePanels'
import { useAgencyData } from './AgencyData'
import { CHAIN_MAX_HOPS, chainReasonKey, chainResumeText } from './chainStop'
import { postState, type PostState } from './postState'
import type { AgencyAgent, AgencyTeam, Errand, OfficeMessage } from './types'

interface OfficeViewProps {
  team: AgencyTeam
  agents: AgencyAgent[]
}

/** La @mención que se está escribiendo justo antes del cursor, si hay una. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const match = /(^|[\s(])@([^\s@]{0,30})$/u.exec(before)
  if (!match) return null
  return { start: caret - match[2].length - 1, query: match[2] }
}

/** El texto partido en trozos: los pares son texto, los impares una @mención de un agente del equipo. */
export function splitMentions(text: string, names: string[]): string[] {
  if (names.length === 0) return [text]
  const escaped = [...names].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return text.split(new RegExp(`(@(?:${escaped.join('|')}))(?![\\p{L}\\p{N}_])`, 'giu'))
}

interface HastNode {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/** Las @menciones del texto como un elemento propio, fuera de código y enlaces. */
function rehypeMentions(names: string[]) {
  return () => (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children || node.tagName === 'code' || node.tagName === 'pre' || node.tagName === 'a') return
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          walk(child)
          return [child]
        }
        const parts = splitMentions(child.value, names)
        if (parts.length === 1) return [child]
        // splitMentions alterna texto y mención: la paridad se decide antes de
        // quitar los tramos vacíos, o el texto se pintaría como mención.
        return parts
          .map((part, index): HastNode | null => {
            if (!part) return null
            return index % 2 === 1
              ? { type: 'element', tagName: 'span', properties: { dataMention: part.slice(1) }, children: [{ type: 'text', value: part }] }
              : { type: 'text', value: part }
          })
          .filter((node): node is HastNode => node !== null)
      })
    }
    walk(tree)
  }
}

/**
 * El texto de un mensaje con el formato del chat (negritas, listas, código) y
 * sus @menciones como una mención, con el avatar de quien se nombra.
 */
function MessageText({ text, members }: { text: string; members: AgencyAgent[] }) {
  const extension = useMemo<MarkdownExtension>(() => {
    // Como el Engine: el nombre completo o el comienzo, en palabras enteras, del
    // nombre de un solo compañero («@Operator» es «Operator de MetaTrader»).
    const byName = new Map(members.map((agent) => [agent.name.toLowerCase(), agent]))
    const starts = new Map<string, AgencyAgent[]>()
    for (const agent of members) {
      const words = agent.name.split(/\s+/)
      for (let n = 1; n < words.length; n++) {
        const key = words.slice(0, n).join(' ').toLowerCase()
        starts.set(key, [...(starts.get(key) ?? []), agent])
      }
    }
    for (const [key, owners] of starts) if (owners.length === 1 && !byName.has(key)) byName.set(key, owners[0])
    const names = [...byName.keys()]
    return {
      rehypePlugins: [rehypeMentions(names)],
      components: {
        span({ node: _node, children, ...props }) {
          const name = (props as Record<string, unknown>)['data-mention']
          if (typeof name !== 'string') return <span {...props}>{children}</span>
          const agent = byName.get(name.toLowerCase()) ?? null
          return (
            <span className="agency-mention" data-agent-id={agent?.id}>
              {agent && <AgentAvatar agent={agent} size={14} className="agency-mention-avatar" />}
              {children}
            </span>
          )
        },
      },
    }
  }, [members])
  return (
    <div className="agency-office-text">
      <Markdown extension={extension}>{text}</Markdown>
    </div>
  )
}

/**
 * Un flujo del equipo en la oficina (replanteo, fase 3): empezó, pasa a un
 * paso o terminó. Al terminar, lo que entregó cada paso va plegado debajo: el
 * primer párrafo del texto es el aviso para quien lo reporta (en inglés, para
 * el modelo) y la app lo dice en su idioma.
 */
function FlowNotice({ message, members }: { message: OfficeMessage; members: AgencyAgent[] }) {
  const { t } = useI18n()
  const notice = message.notice?.kind === 'flow' ? message.notice : null
  if (!notice) return null
  const title = notice.state === 'started'
    ? t('agency.office.flow.started', { flow: notice.flow })
    : notice.state === 'step'
      ? t('agency.office.flow.step', { flow: notice.flow, step: notice.step ?? '' })
      : t('agency.office.flow.done', { flow: notice.flow })
  const outputs = notice.state === 'done' ? message.text.split('\n\n').slice(1).join('\n\n').trim() : ''
  return (
    <div className="agency-office-flow" role="note" data-testid="agency-flow-notice" data-state={notice.state}>
      <span className="agency-office-flow-icon" aria-hidden="true"><Workflow size={14} /></span>
      <div className="min-w-0 flex-1">
        <p className="agency-office-flow-title">{title}</p>
        {outputs && (
          <details className="agency-office-flow-outputs">
            <summary>{t('agency.office.flow.outputs')}</summary>
            <MessageText text={outputs} members={members} />
          </details>
        )}
      </div>
    </div>
  )
}

/**
 * Una cadena que la oficina cortó (D-31): una línea fija, en palabras llanas,
 * con qué límite saltó y «Continuar», que vuelve a publicar como tuyo el
 * último mensaje de esa cadena (una cadena nueva, con sus saltos a cero).
 */
function ChainStopped({ message, messages, team }: { message: OfficeMessage; messages: OfficeMessage[]; team: AgencyTeam }) {
  const { t } = useI18n()
  const notice = message.notice?.kind === 'stopped' ? message.notice : null
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  if (!notice) return null
  const text = chainResumeText(messages, notice.chain_id, message.id)
  const resume = async () => {
    if (!text || state !== 'idle') return
    setState('sending')
    try {
      await engineApi.agencyOfficePost(team.id, text)
      setState('sent')
    } catch (error) {
      setState('idle')
      toast.error(commandMessage(error))
    }
  }
  return (
    <div className="agency-office-stop" role="note" data-testid="agency-chain-stopped" data-reason={notice.reason}>
      <span className="agency-office-stop-icon" aria-hidden="true"><OctagonPause size={15} /></span>
      <div className="min-w-0 flex-1">
        <p className="agency-office-stop-title">{t('agency.chain.stoppedLine')}</p>
        <p className="agency-office-stop-why">
          {t(chainReasonKey(notice.reason), { max: CHAIN_MAX_HOPS })}
          {notice.detail ? <span className="agency-office-stop-detail"> · {notice.detail}</span> : null}
        </p>
      </div>
      {text && (
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          disabled={state !== 'idle'}
          onClick={() => void resume()}
          title={t('agency.chain.continueHint')}
          data-testid="agency-chain-continue"
        >
          <Play size={12} aria-hidden="true" /> {state === 'sent' ? t('agency.chain.continued') : t('agency.chain.continue')}
        </button>
      )}
    </div>
  )
}

/** El estado de un agente en su puesto, dicho con palabras además del punto. */
function stateLabel(state: PostState, t: ReturnType<typeof useI18n>['t']): string {
  return state === 'needs_you' ? t('agency.agent.needsYou') : state === 'working' ? t('agency.agent.working') : ''
}

/**
 * La oficina de un equipo (A2): un chat de grupo del dueño y sus agentes, no
 * una conversación con un modelo. Solo una @mención despierta a alguien
 * (D-1); su respuesta vuelve aquí. Recado, Pizarra y la ficha del equipo
 * viven en su panel lateral (`App` la monta dentro de `SessionWorkspace`
 * con `officeDockKey`), como las vistas de una conversación; «/recado …» en
 * el mensaje abre el recado con ese título.
 */
export default function OfficeView({ team, agents }: OfficeViewProps) {
  const { t } = useI18n()
  const { status, halted, reload: reloadAgency } = useAgencyData()
  const [messages, setMessages] = useState<OfficeMessage[]>([])
  const [errands, setErrands] = useState<Errand[]>([])
  const end = useRef<HTMLDivElement>(null)

  const members = useMemo(
    () => team.members.map((id) => agents.find((agent) => agent.id === id)).filter((agent): agent is AgencyAgent => Boolean(agent)),
    [team.members, agents],
  )
  const byId = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])
  const names = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents])
  const errandsById = useMemo(() => new Map(errands.map((errand) => [errand.id, errand])), [errands])
  // La tarjeta de un recado va una sola vez, en el mensaje que lo dejó; los siguientes (la entrega) solo lo nombran.
  const cardAt = useMemo(() => {
    const first = new Map<string, string>()
    for (const message of messages) if (message.errand_id && !first.has(message.errand_id)) first.set(message.errand_id, message.id)
    return new Set(first.values())
  }, [messages])

  const seq = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++seq.current
    try {
      const result = await engineApi.agencyTeam(team.id)
      if (mine !== seq.current) return
      setMessages(result.messages)
      setErrands(result.errands)
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }, [team.id])

  useTeamEvents(team.id, useCallback(() => void reload(), [reload]))

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length])

  const chief = team.chief_agent_id ? byId.get(team.chief_agent_id) ?? null : null

  return (
    <div className="agency-office" data-testid="agency-office">
        <header className="agency-office-head">
          <ul className="agency-office-faces" aria-label={t('agency.office.members', { n: members.length })}>
            {members.slice(0, 5).map((agent) => {
              const state = postState(team, agent.id, status)
              const label = stateLabel(state, t)
              return (
                <li key={agent.id} className="agency-office-face" data-state={state} title={label ? `${agent.name} · ${label}` : agent.name} aria-label={label ? `${agent.name} · ${label}` : agent.name} data-testid="agency-office-face">
                  <AgentAvatar agent={agent} size={30} />
                  {state !== 'idle' && <span className="agency-face-dot" data-tone={state === 'needs_you' ? 'warning' : undefined} aria-hidden="true" />}
                </li>
              )
            })}
          </ul>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[19px] font-semibold text-[var(--text)]">{team.name}</h1>
            <p className="truncate text-[12.5px] text-[var(--text-muted)]">
              {team.purpose || t('agency.office.members', { n: members.length })}
              {chief ? ` · ${t('agency.office.chief', { name: chief.name })}` : ''}
            </p>
          </div>
        </header>

        <div className="agency-office-log" role="log" aria-live="polite" aria-label={t('agency.office.log', { name: team.name })}>
          <div className="agency-office-thread">
            {messages.length === 0 ? (
              <div className="agency-office-empty">
                <div className="agency-office-empty-faces" aria-hidden="true">
                  {members.slice(0, 4).map((agent) => <AgentAvatar key={agent.id} agent={agent} size={44} />)}
                </div>
                <p className="font-display text-[17px] font-semibold text-[var(--text)]">{t('agency.office.emptyTitle', { name: team.name })}</p>
                <p>{t('agency.office.empty')}</p>
              </div>
            ) : (
              messages.map((message) => {
                if (message.notice?.kind === 'stopped') return <ChainStopped key={message.id} message={message} messages={messages} team={team} />
                if (message.notice?.kind === 'flow') return <FlowNotice key={message.id} message={message} members={members} />
                const agent = message.author_kind === 'agent' ? byId.get(message.agent_id ?? '') ?? null : null
                // A name, never a raw id: an agent that left says so.
                const author = message.author_kind === 'owner' ? t('agency.office.you') : agent?.name ?? t('agency.agent.gone')
                const errand = message.errand_id && cardAt.has(message.id) ? errandsById.get(message.errand_id) : undefined
                return (
                  <div key={message.id} className={cn('agency-office-message', message.author_kind === 'owner' && 'is-owner')} data-testid="agency-office-message">
                    {message.author_kind === 'agent' ? (
                      <AgentAvatar agent={agent ?? { id: message.agent_id ?? '', name: author ?? '' }} size={32} className="agency-office-avatar" />
                    ) : (
                      <span className="agency-office-avatar is-owner" aria-hidden="true">{t('agency.office.youShort')}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="agency-office-author">
                        <span className={cn('agency-office-name', agent && 'is-agent')} data-agent-id={agent?.id}>{author}</span>
                        <time className="agency-office-time" dateTime={new Date(message.created_at * 1000).toISOString()}>
                          {new Date(message.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </p>
                      {message.notice?.kind === 'files' ? (
                        // Lo que presentó en su puesto, visto aquí también (estudio, 21-oct).
                        <PresentedFiles item={{ id: message.id, type: 'present', activitySeq: 0, occurredAt: message.created_at * 1000, files: message.notice.items }} />
                      ) : message.notice?.kind === 'errand' ? (
                        <p className="agency-office-notice">{t('agency.office.notice.errand', { title: message.notice.title })}</p>
                      ) : message.notice?.kind === 'wait' ? (
                        <p className="agency-office-notice">{t('agency.office.notice.wait', { name: message.notice.for })}</p>
                      ) : (
                        <>
                          {message.notice?.kind === 'delivered' && (
                            <p className="agency-office-notice">
                              {message.notice.to
                                ? t('agency.office.notice.deliveredTo', { title: message.notice.title, name: message.notice.to })
                                : t('agency.office.notice.delivered', { title: message.notice.title })}
                            </p>
                          )}
                          {/* Sus enlaces a archivos son de su puesto: se abren con esa conversación. */}
                          <FileFromContext.Provider value={team.posts.find((post) => post.agent_id === message.agent_id)?.session_id}>
                            <MessageText text={message.text} members={members} />
                          </FileFromContext.Provider>
                        </>
                      )}
                      {errand && <ErrandCard errand={errand} names={names} onChanged={() => void reload()} />}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={end} />
          </div>
        </div>

        {halted ? (
          <div className="agency-halted-note" role="status" data-testid="agency-office-halted">
            <PauseCircle size={14} aria-hidden="true" />
            <span>{t('agency.halted.office')}</span>
          </div>
        ) : team.stopped && (
          <div className="agency-halted-note" role="status" data-testid="agency-team-stopped">
            <PauseCircle size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1">{t('agency.team.stoppedOffice')}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void engineApi.agencyResumeTeam(team.id)
                .then(() => { toast.success(t('agency.team.resumed', { name: team.name })); void reloadAgency() })
                .catch((error) => toast.error(commandMessage(error)))}
              data-testid="agency-team-resume"
            >
              <Play size={13} aria-hidden="true" /> {t('agency.team.resume')}
            </button>
          </div>
        )}
        <OfficeComposer team={team} members={members} onPosted={() => void reload()} />
    </div>
  )
}

/** Ajusta el alto del cuadro a su texto, hasta un tope; más allá, se desplaza. */
const COMPOSER_MAX = 220

/**
 * El composer de la oficina, con la cara del de una conversación: una
 * tarjeta redondeada que crece con el texto. Una @mención de un agente del
 * equipo se ve como mención mientras se escribe (un fondo pintado detrás del
 * texto, que sigue al cuadro); la lista de agentes sale encima, pegada a él.
 */
function OfficeComposer({ team, members, onPosted }: { team: AgencyTeam; members: AgencyAgent[]; onPosted: () => void }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [picked, setPicked] = useState(0)
  // Escape cierra la lista de @menciones hasta que se vuelva a escribir.
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)

  const names = useMemo(() => members.map((agent) => agent.name), [members])
  const mention = dismissed ? null : mentionQuery(text, caret)
  const suggestions = mention
    ? members.filter((agent) => agent.name.toLowerCase().startsWith(mention.query.toLowerCase())).slice(0, 6)
    : []

  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(COMPOSER_MAX, element.scrollHeight)}px`
  }, [text])

  const syncScroll = () => {
    if (backdrop.current && input.current) backdrop.current.scrollTop = input.current.scrollTop
  }

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
    // A double Enter posted twice, and each @mention starts a paid turn.
    if (!message || sendingRef.current) return
    // «/recado …» abre el recado con ese título en el panel lateral en vez de escribir en la oficina.
    const slash = /^\/recado\b\s*(.*)$/isu.exec(message)
    if (slash) {
      openErrand(team.id, slash[1].trim())
      setText('')
      return
    }
    sendingRef.current = true
    setSending(true)
    // Cleared before the call; restored if it fails and the box is still empty.
    setText('')
    setCaret(0)
    try {
      await engineApi.agencyOfficePost(team.id, message)
      onPosted()
    } catch (error) {
      // Back in the box, unless the owner already wrote something new there.
      setText((current) => (current === '' ? message : current))
      toast.error(commandMessage(error))
    } finally {
      sendingRef.current = false
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

  const highlighted: ReactNode[] = splitMentions(text, names).map((part, index) => (index % 2 === 1 ? <mark key={index} className="office-input-mention">{part}</mark> : part))

  return (
    <div className="office-composer-wrap">
      <div className="office-composer" data-toast-avoid="">
        {suggestions.length > 0 && (
          <div role="listbox" aria-label={t('agency.office.mention')} data-testid="agency-mention-list" className="r-pop composer-suggestions office-mention-list" data-state="open">
            <p className="slash-group" aria-hidden="true">{t('agency.office.mentionHeading')}</p>
            {suggestions.map((agent, index) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={index === picked}
                className={cn('slash-row', index === picked && 'is-active')}
                onMouseEnter={() => setPicked(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(agent)
                }}
              >
                <AgentAvatar agent={agent} size={28} />
                <span className="slash-text">
                  <span className="slash-name office-mention-name">@{agent.name}</span>
                  {agent.role && <span className="slash-desc">{agent.role}</span>}
                </span>
                {index === picked && <span className="slash-enter" aria-hidden="true">↵</span>}
              </button>
            ))}
            <p className="slash-hint">{t('agency.office.mentionHint')}</p>
          </div>
        )}
        <div className="office-input-shell">
          <div ref={backdrop} className="office-input-backdrop" aria-hidden="true">{highlighted}{'\n'}</div>
          <textarea
            ref={input}
            className="office-input"
            value={text}
            rows={1}
            maxLength={8000}
            placeholder={t('agency.office.placeholder')}
            aria-label={t('agency.office.placeholder')}
            onChange={(event) => {
              setText(event.target.value)
              setCaret(event.target.selectionStart ?? event.target.value.length)
              setPicked(0)
              setDismissed(false)
            }}
            onScroll={syncScroll}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            data-testid="agency-office-input"
          />
        </div>
        <div className="office-composer-row">
          <p className="office-composer-hint">{t('agency.office.hint', { max: CHAIN_MAX_HOPS })}</p>
          <button type="button" className="office-send" disabled={sending || !text.trim()} onClick={() => void send()} aria-label={t('agency.office.send')} title={t('agency.office.send')} data-testid="agency-office-send">
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
