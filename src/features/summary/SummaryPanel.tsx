import { ArrowDown, ArrowUp, Bot, ChevronDown, Ellipsis, FileStack, FileDiff, FolderOpen, Gauge, GitBranch, GitPullRequest, GitPullRequestCreate, Globe, ListChecks, Plug, Server, SquareTerminal, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { engineApi, type ArtifactSummary, type ScheduledTask, type SessionSummary } from '../../services/engine'
import type { ContextStatus } from '../../types/protocol.generated'
import { useSessionDockStore } from '../../stores/sessionDock'
import { useBranchNoticeStore } from '../../stores/branchNotice'
import { useUIStore } from '../../stores/ui'
import { useChecklistStore } from '../checklist/checklistStore'
import { useOptionalEngineData, useOptionalRuntimeStore } from '../engine/EngineContext'
import type { RuntimeStore } from '../engine/runtimeStore'
import { useSessionTimelines } from '../engine/sessionSelectors'
import { sessionAgents } from '../agents/AgentsPanel'
import { presentedChangeSets } from '../activity/changeSetPresentation'
import { ringFigures } from '../context/ContextRing'
import { useAgentRunningCount } from '../terminal/agentTab'
import { useFileWorkspace } from '../files/FileWorkspace'
import { branchChangeText } from '../engine/useSessionList'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import type { TurnTimeline } from '../activity/types'
import { compareUrl, useConversationSummary, useRepoStatus } from './summaryData'
import CreatePrDialog from './CreatePrDialog'
import { platform } from '../../platform'

export type SummaryCardId = 'env' | 'context' | 'plan' | 'changes' | 'results' | 'sources' | 'connectors' | 'agents' | 'background'
export const SUMMARY_CARDS: readonly SummaryCardId[] = ['env', 'context', 'plan', 'changes', 'results', 'sources', 'connectors', 'agents', 'background']
const PREFS_KEY = 'rinari.summary.cards.v1'

interface SummaryPrefs { order: SummaryCardId[]; hidden: SummaryCardId[]; collapsed: SummaryCardId[] }

/** El orden, cuáles se ven y cuáles están plegadas: preferencia de la persona, igual en todas las conversaciones. */
export function readSummaryPrefs(): SummaryPrefs {
  const fallback: SummaryPrefs = { order: [...SUMMARY_CARDS], hidden: [], collapsed: [] }
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<SummaryPrefs> | null
    if (!raw) return fallback
    const known = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is SummaryCardId => SUMMARY_CARDS.includes(id as SummaryCardId)) : [])
    const order = known(raw.order)
    return { order: [...order, ...SUMMARY_CARDS.filter((id) => !order.includes(id))], hidden: known(raw.hidden), collapsed: known(raw.collapsed) }
  } catch {
    return fallback
  }
}
function writeSummaryPrefs(prefs: SummaryPrefs) {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* solo una comodidad */ }
}

/**
 * El Resumen de una conversación (plan 0.4.0 #82): un mini panel con
 * tarjetas apiladas que dicen cómo está y llevan a su vista. Cada tarjeta
 * sale solo si tiene algo; se pliegan, y el «⋯» elige cuáles se ven y en qué
 * orden. Lo que la app no sabe todavía (fuentes, conectores, PR) no se
 * enseña: no se inventa.
 */
export default function SummaryPanel({ sessionId, record, onClose }: { sessionId: string; record: SessionSummary | null; onClose: () => void }) {
  const runtime = useOptionalRuntimeStore()
  return runtime
    ? <WithTimelines store={runtime} sessionId={sessionId} record={record} onClose={onClose} />
    : <Panel sessionId={sessionId} record={record} timelines={EMPTY} onClose={onClose} />
}
const EMPTY: Record<string, TurnTimeline> = {}

function WithTimelines({ store, sessionId, record, onClose }: { store: RuntimeStore; sessionId: string; record: SessionSummary | null; onClose: () => void }) {
  const timelines = useSessionTimelines(store, sessionId)
  return <Panel sessionId={sessionId} record={record} timelines={timelines} onClose={onClose} />
}

function Panel({ sessionId, record, timelines, onClose }: { sessionId: string; record: SessionSummary | null; timelines: Record<string, TurnTimeline>; onClose: () => void }) {
  const { t, lang } = useI18n()
  const data = useOptionalEngineData()
  const openView = useSessionDockStore((state) => state.openView)
  const reviewTurn = useSessionDockStore((state) => state.reviewTurn)
  const goProject = useUIStore((state) => state.goProject)
  const goSchedules = useUIStore((state) => state.goSchedules)
  const files = useFileWorkspace()
  const [prefs, setPrefs] = useState<SummaryPrefs>(() => readSummaryPrefs())
  const update = (next: SummaryPrefs) => { setPrefs(next); writeSummaryPrefs(next) }

  // --- datos ---------------------------------------------------------------
  const project = record?.project_id ? data?.projects.find((item) => item.id === record.project_id) ?? null : null
  const root = record?.project_root ?? null
  const folder = root ?? record?.current_cwd ?? null
  const gitStatus = root ? data?.projectStatusByRoot[root] ?? null : null
  const git = gitStatus?.status?.available ? gitStatus.status : null
  const branchNotice = useBranchNoticeStore((state) => state.bySession[sessionId])
  const model = record ? data?.models.find((item) => item.id === record.model_id)?.alias ?? record.model_id : null
  const checklist = useChecklistStore((state) => state.bySession[sessionId]?.checklist ?? null)
  const turns = useMemo(() => Object.values(timelines).sort((a, b) => b.startedAt - a.startedAt), [timelines])
  const plans = turns.filter((turn) => turn.mode === 'plan' && turn.status === 'completed')
  const lastChanges = turns.map((turn) => ({ turn, set: presentedChangeSets(turn).latest })).find((entry) => entry.set)
  const agents = sessionAgents(timelines)
  const running = useAgentRunningCount(data?.status?.capabilities?.desktop_terminal_v1 ? sessionId : '')
  const busy = data?.busySessionIds?.has?.(sessionId) ?? false
  const [context, setContext] = useState<ContextStatus | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([])
  const [schedules, setSchedules] = useState<ScheduledTask[]>([])
  const schedulesEnabled = data?.status?.capabilities?.scheduled_tasks_v1 === true
  // Lo que junta el Engine (#82): fuentes, resultados, conectores, trabajo de fondo y el repo con sus PR.
  const summary = useConversationSummary(sessionId, data?.status?.capabilities?.session_summary_v1 === true)
  const { status: repo } = useRepoStatus(sessionId, data?.status?.capabilities?.repo_status_v1 === true && Boolean(root))
  const [prOpen, setPrOpen] = useState(false)
  const [allSources, setAllSources] = useState(false)
  const openInPanel = (url: string) => {
    openView(sessionId, 'browser')
    void platform().browser.navigate(sessionId, url).catch(() => platform().opener.openUrl(url))
  }
  // Se vuelve a leer al terminar cada turno: lo que cambia lo cambia un turno.
  useEffect(() => {
    if (busy) return
    let alive = true
    engineApi.contextStatus({ session_id: sessionId }).then((next) => { if (alive) setContext(next) }).catch(() => { if (alive) setContext(null) })
    engineApi.artifactList(sessionId).then((result) => { if (alive) setArtifacts(result.artifacts) }).catch(() => { if (alive) setArtifacts([]) })
    if (schedulesEnabled && record?.project_id) {
      engineApi.scheduleList().then((result) => { if (alive) setSchedules(result.tasks.filter((task) => task.project_id === record.project_id && task.enabled)) }).catch(() => { if (alive) setSchedules([]) })
    } else setSchedules([])
    return () => { alive = false }
  }, [sessionId, busy, schedulesEnabled, record?.project_id])
  const figures = ringFigures(context)

  // --- tarjetas --------------------------------------------------------------
  const cards: Partial<Record<SummaryCardId, ReactNode>> = {}
  cards.env = (
    <SummaryCard id="env" icon={<FolderOpen size={14} />} title={t('summary.env.title')} meta={project?.name ?? (record?.kind === 'PROJECT' ? null : t('summary.env.noProject'))}
      onOpen={root ? () => goProject(root) : undefined} openLabel={t('summary.env.openProject')} prefs={prefs} onPrefs={update}>
      <dl className="summary-facts">
        {folder && <div><dt>{t('summary.env.folder')}</dt><dd className="is-mono" title={folder}>{folder}</dd></div>}
        <div><dt>{t('summary.env.branch')}</dt><dd>{(repo?.branch ?? git?.branch) ? <><GitBranch size={11} aria-hidden="true" /> <span className="is-mono">{repo?.branch ?? git?.branch}</span>{repo && (repo.ahead || repo.behind) ? <span className="summary-sync"> ↑{repo.ahead ?? 0} ↓{repo.behind ?? 0}</span> : null}{(repo?.dirty ?? git?.dirty) ? ` · ${t('summary.env.dirty', { n: repo?.changed ?? git?.files.length ?? 0 })}` : ''}</> : (repo && !repo.available) || (gitStatus?.status && !gitStatus.status.available) ? t('summary.env.noGit') : '—'}</dd></div>
        {model && <div><dt>{t('summary.env.model')}</dt><dd>{model}</dd></div>}
        {record && <div><dt>{t('summary.env.permission')}</dt><dd>{t(`summary.permission.${record.effective_permission_profile}`)}</dd></div>}
      </dl>
      {branchNotice && <p className="summary-warning"><TriangleAlert size={12} aria-hidden="true" /> {branchChangeText(branchNotice, lang)}</p>}
      {folder && files && (
        <div className="summary-actions">
          <button type="button" className="btn btn-quiet btn-xs" onClick={() => files.reveal(folder)}><FolderOpen size={12} aria-hidden="true" /> {t('summary.env.openFolder')}</button>
          {data?.status?.capabilities?.desktop_terminal_v1 && (
            <button type="button" className="btn btn-quiet btn-xs" onClick={() => openView(sessionId, 'terminal')}><SquareTerminal size={12} aria-hidden="true" /> {t('summary.env.openTerminal')}</button>
          )}
        </div>
      )}
    </SummaryCard>
  )
  if (figures) {
    const percent = Math.round(figures.ratio * 100)
    cards.context = (
      <SummaryCard id="context" icon={<Gauge size={14} />} title={t('summary.context.title')} meta={`${figures.estimated ? '≈' : ''}${percent}%`}
        onOpen={() => openView(sessionId, 'insight')} openLabel={t('summary.context.open')} prefs={prefs} onPrefs={update}>
        <div className="summary-bar" data-near={figures.near || undefined} role="img" aria-label={t('summary.context.used', { n: percent })}>
          <span style={{ width: `${percent}%` }} />
        </div>
      </SummaryCard>
    )
  }
  if (plans.length > 0 || checklist) {
    const done = checklist?.items.filter((item) => item.status === 'completed').length ?? 0
    cards.plan = (
      <SummaryCard id="plan" icon={<ListChecks size={14} />} title={t('summary.plan.title')} meta={checklist ? t('summary.plan.steps', { done, total: checklist.items.length }) : null}
        onOpen={plans.length > 0 ? () => openView(sessionId, 'plan') : undefined} openLabel={t('summary.plan.open')} prefs={prefs} onPrefs={update}>
        {plans.length > 0 && <p className="summary-line">{t(plans.length === 1 ? 'summary.plan.oneplan' : 'summary.plan.plans', { n: plans.length })}</p>}
        {checklist && (
          <ul className="summary-list">
            {checklist.items.slice(0, 5).map((item) => <li key={item.id} data-done={item.status === 'completed' || undefined}>{item.content}</li>)}
          </ul>
        )}
      </SummaryCard>
    )
  }
  const prs = repo?.prs ?? []
  const github = Boolean(repo?.github)
  const canPr = github && Boolean(repo?.branch) && prs.every((pr) => pr.state !== 'open')
  if (lastChanges?.set || (git && git.files.length > 0) || prs.length > 0 || canPr) {
    const set = lastChanges?.set
    cards.changes = (
      <SummaryCard id="changes" icon={<FileDiff size={14} />} title={t('summary.changes.title')}
        meta={set ? `+${set.additions} −${set.deletions}` : null}
        onOpen={() => (lastChanges ? reviewTurn(sessionId, lastChanges.turn.turnId) : openView(sessionId, 'changes'))} openLabel={t('summary.changes.open')} prefs={prefs} onPrefs={update}>
        {set && <p className="summary-line">{t(set.files.length === 1 ? 'summary.changes.turnOne' : 'summary.changes.turn', { n: set.files.length })}</p>}
        {git && git.files.length > 0 && <p className="summary-line">{t('summary.changes.repo', { n: git.files.length })}</p>}
        {prs.length > 0 && (
          <ul className="summary-list summary-prs">
            {prs.map((pr) => (
              <li key={pr.url}>
                <button type="button" className="summary-link" onClick={() => openInPanel(pr.url)}><GitPullRequest size={11} aria-hidden="true" /> #{pr.number} {pr.title}</button>
                <span className="r-chip summary-pr-state" data-tone={pr.state === 'merged' ? 'accent' : pr.state === 'open' ? 'success' : undefined}>{t(`summary.pr.state.${pr.state === 'merged' || pr.state === 'closed' ? pr.state : 'open'}`)}</span>
                {pr.checks && <span className="r-chip summary-pr-state" data-tone={pr.checks === 'success' ? 'success' : pr.checks === 'failure' ? 'danger' : 'warning'}>{t(`summary.pr.checks.${pr.checks}`)}</span>}
              </li>
            ))}
          </ul>
        )}
        {canPr && repo && (
          repo.gh === 'ready'
            ? <button type="button" className="btn btn-secondary btn-xs summary-pr-create" onClick={() => setPrOpen(true)}><GitPullRequestCreate size={12} aria-hidden="true" /> {t('summary.pr.create')}</button>
            : compareUrl(repo) && <button type="button" className="btn btn-ghost btn-xs summary-pr-create" title={t('summary.pr.noGh')} onClick={() => void platform().opener.openUrl(compareUrl(repo)!)}><GitPullRequestCreate size={12} aria-hidden="true" /> {t('summary.pr.createOnGithub')}</button>
        )}
      </SummaryCard>
    )
  }
  const results = summary?.results.filter((item) => item.exists) ?? []
  if (results.length > 0) {
    cards.results = (
      <SummaryCard id="results" icon={<FileStack size={14} />} title={t('summary.results.title')} meta={String(results.length)}
        onOpen={() => openView(sessionId, 'files')} openLabel={t('summary.results.open')} prefs={prefs} onPrefs={update}>
        <ul className="summary-list">
          {results.slice(0, 5).map((item) => (
            <li key={item.path}>
              <button type="button" className="summary-link" disabled={!files} title={item.path} onClick={() => files?.open(item.path)}>{item.name}</button>
            </li>
          ))}
        </ul>
      </SummaryCard>
    )
  } else if (artifacts.length > 0) {
    cards.results = (
      <SummaryCard id="results" icon={<FileStack size={14} />} title={t('summary.results.title')} meta={String(artifacts.length)}
        onOpen={() => useSessionDockStore.getState().reveal(sessionId, 'workspace', { workspaceTab: 'artifacts' })} openLabel={t('summary.results.open')} prefs={prefs} onPrefs={update}>
        <ul className="summary-list">
          {artifacts.slice(0, 5).map((artifact) => (
            <li key={artifact.uri}>
              <button type="button" className="summary-link" disabled={!files} onClick={() => files?.open(artifact.uri)}>{artifact.name}</button>
            </li>
          ))}
        </ul>
      </SummaryCard>
    )
  }
  if (summary && summary.sourcesTotal > 0) {
    const pages = allSources ? summary.pages : summary.pages.slice(0, 4)
    const searches = allSources ? summary.searches : summary.searches.slice(0, 2)
    const more = summary.pages.length + summary.searches.length - pages.length - searches.length
    cards.sources = (
      <SummaryCard id="sources" icon={<Globe size={14} />} title={t('summary.sources.title')} meta={String(summary.sourcesTotal)} prefs={prefs} onPrefs={update}>
        <ul className="summary-list">
          {pages.map((page) => (
            <li key={page.url}><button type="button" className="summary-link" title={page.url} onClick={() => openInPanel(page.url)}>{page.title || hostOf(page.url)}</button></li>
          ))}
          {searches.map((search) => <li key={search.query}>{t('summary.sources.search', { query: search.query })}</li>)}
          {summary.mcp.map((entry) => <li key={entry.connector}>{t('summary.sources.mcp', { connector: entry.connector, n: entry.calls })}</li>)}
        </ul>
        {(more > 0 || allSources) && (
          <button type="button" className="summary-link" onClick={() => setAllSources((value) => !value)}>{allSources ? t('summary.sources.less') : t('summary.sources.all', { n: more })}</button>
        )}
      </SummaryCard>
    )
  }
  if (summary && (summary.mcpServers.length > 0 || summary.skills.length > 0)) {
    cards.connectors = (
      <SummaryCard id="connectors" icon={<Plug size={14} />} title={t('summary.connectors.title')} meta={String(summary.mcpServers.length + summary.skills.length)} prefs={prefs} onPrefs={update}>
        {summary.mcpServers.length > 0 && (
          <ul className="summary-list">
            {summary.mcpServers.map((server) => <li key={server.name} data-live={server.connected || undefined} data-off={!server.connected || undefined}>{server.name}</li>)}
          </ul>
        )}
        {summary.skills.length > 0 && <p className="summary-line">{t('summary.connectors.skills', { names: summary.skills.map((skill) => skill.name).join(', ') })}</p>}
      </SummaryCard>
    )
  }
  if (agents.length > 0) {
    const live = agents.filter((agent) => agent.live).length
    cards.agents = (
      <SummaryCard id="agents" icon={<Bot size={14} />} title={t('summary.agents.title')} meta={live > 0 ? t('summary.agents.working', { n: live }) : String(agents.length)}
        onOpen={() => openView(sessionId, 'agents')} openLabel={t('summary.agents.open')} prefs={prefs} onPrefs={update}>
        <ul className="summary-list">
          {agents.slice(0, 4).map((entry) => <li key={entry.item.agentId} data-live={entry.live || undefined}>{entry.item.objective || entry.item.agent}</li>)}
        </ul>
      </SummaryCard>
    )
  }
  const processes = summary ? summary.processes.length : running
  const scheduledCount = summary ? summary.scheduled.filter((task) => task.enabled).length : schedules.length
  if (processes > 0 || scheduledCount > 0) {
    cards.background = (
      <SummaryCard id="background" icon={<Server size={14} />} title={t('summary.background.title')} meta={null} prefs={prefs} onPrefs={update}>
        {processes > 0 && <button type="button" className="summary-link" onClick={() => openView(sessionId, 'terminal')}>{t('terminal.agentRunning', { n: processes })}</button>}
        {summary && summary.processes.length > 0 && (
          <ul className="summary-list">{summary.processes.slice(0, 3).map((process) => <li key={process.id} className="is-mono" data-live>{process.command}</li>)}</ul>
        )}
        {scheduledCount > 0 && <button type="button" className="summary-link" onClick={() => goSchedules()}>{t(scheduledCount === 1 ? 'summary.background.scheduleOne' : 'summary.background.schedules', { n: scheduledCount })}</button>}
      </SummaryCard>
    )
  }

  const shown = prefs.order.filter((id) => cards[id] && !prefs.hidden.includes(id))
  return (
    <div className="summary-panel" data-testid="summary-panel">
      <header className="summary-head">
        <ListChecks size={14} aria-hidden="true" className="summary-head-icon" />
        <h2>{t('summary.title')}</h2>
        <span className="flex-1" />
        <SummaryMenu prefs={prefs} onPrefs={update} />
        <button type="button" className="pane-header-icon" aria-label={t('summary.close')} title={t('summary.close')} onClick={onClose}><X size={14} /></button>
      </header>
      {repo?.branch && prOpen && (
        <CreatePrDialog
          open={prOpen}
          onClose={() => setPrOpen(false)}
          sessionId={sessionId}
          branch={repo.branch}
          defaultTitle={record?.title ?? repo.branch}
          defaultBase={repo.upstream && !repo.upstream.endsWith(`/${repo.branch}`) ? repo.upstream.replace(/^[^/]+\//, '') : 'main'}
        />
      )}
      <div className="summary-cards">
        {shown.map((id) => <div key={id} className="summary-slot">{cards[id]}</div>)}
        {shown.length === 0 && <p className="summary-empty">{t('summary.empty')}</p>}
      </div>
    </div>
  )
}

const hostOf = (url: string) => { try { return new URL(url).host } catch { return url } }

function SummaryCard({ id, icon, title, meta, onOpen, openLabel, prefs, onPrefs, children }: {
  id: SummaryCardId
  icon: ReactNode
  title: string
  meta: string | null
  onOpen?: () => void
  openLabel?: string
  prefs: SummaryPrefs
  onPrefs: (next: SummaryPrefs) => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const collapsed = prefs.collapsed.includes(id)
  return (
    <section className="summary-card" data-card={id} data-collapsed={collapsed || undefined} aria-label={title}>
      <div className="summary-card-head">
        <button type="button" className="summary-card-open" disabled={!onOpen} onClick={onOpen} title={onOpen ? openLabel : undefined}>
          <span className="summary-card-icon" aria-hidden="true">{icon}</span>
          <span className="summary-card-title">{title}</span>
          {meta && <span className="summary-card-meta">{meta}</span>}
        </button>
        <button
          type="button"
          className="pane-header-icon summary-card-fold"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('summary.expand', { card: title }) : t('summary.collapse', { card: title })}
          onClick={() => onPrefs({ ...prefs, collapsed: collapsed ? prefs.collapsed.filter((item) => item !== id) : [...prefs.collapsed, id] })}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {!collapsed && <div className="summary-card-body">{children}</div>}
    </section>
  )
}

/** El «⋯»: qué tarjetas se ven y en qué orden. */
function SummaryMenu({ prefs, onPrefs }: { prefs: SummaryPrefs; onPrefs: (next: SummaryPrefs) => void }) {
  const { t } = useI18n()
  const move = (id: SummaryCardId, delta: number) => {
    const order = [...prefs.order]
    const from = order.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= order.length) return
    order.splice(from, 1)
    order.splice(to, 0, id)
    onPrefs({ ...prefs, order })
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="pane-header-icon" aria-label={t('summary.customize')} title={t('summary.customize')}><Ellipsis size={14} /></button>
      </PopoverTrigger>
      <PopoverContent align="end" className="summary-menu">
        <p className="summary-menu-title">{t('summary.customize')}</p>
        <ul>
          {prefs.order.map((id, index) => {
            const hidden = prefs.hidden.includes(id)
            return (
              <li key={id} className={cn(hidden && 'is-hidden')}>
                <label>
                  <input type="checkbox" className="r-checkbox" checked={!hidden} onChange={() => onPrefs({ ...prefs, hidden: hidden ? prefs.hidden.filter((item) => item !== id) : [...prefs.hidden, id] })} />
                  {t(`summary.${id}.title`)}
                </label>
                <button type="button" className="pane-header-icon" aria-label={t('summary.moveUp', { card: t(`summary.${id}.title`) })} disabled={index === 0} onClick={() => move(id, -1)}><ArrowUp size={12} /></button>
                <button type="button" className="pane-header-icon" aria-label={t('summary.moveDown', { card: t(`summary.${id}.title`) })} disabled={index === prefs.order.length - 1} onClick={() => move(id, 1)}><ArrowDown size={12} /></button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
