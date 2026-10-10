import {
  AppWindow,
  Bot,
  Brain,
  Check,
  ClipboardCheck,
  Code,
  Copy,
  ChevronDown,
  CircleAlert,
  FileSearch,
  FileText,
  Globe,
  Image as ImageIcon,
  GitBranch,
  ListTree,
  LoaderCircle,
  MessageCircleQuestion,
  Pencil,
  ShieldAlert,
  Sparkles,
  SquareTerminal,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import type { ChatMessage } from '../../types'
import Markdown from '../../components/Markdown'
import { FileLink } from '../files/FileWorkspace'
import MessageBubble from '../../components/MessageBubble'
import { usePeerNavigation } from '../board/PeerNavigationContext'
import TurnMeta from './TurnMeta'
import CompactionDetails from '../context/CompactionDetails'
import TurnResult from './TurnResult'
import { ModelChangeNotice } from './ModelChangeNotice'
import { MemoryActivityCard } from '../memory/MemoryActivityCard'
import { SkillProposalCard } from '../skills/SkillProposalCard'
import { commandMessage, engineApi } from '../../services/engine'
import { agentInstruction, formatTool, toolCategory, type ToolCategory } from './formatActivity'
import { copyText } from '../../lib/clipboard'
import { ImageActivity } from './ImageActivity'
import type { ContextTimelineItem, SteerTimelineItem, TimelineItem, TurnTimeline, VisionTimelineItem } from './types'
import { approvalCopy } from './approvalCopy'
import { activityBlocks, activityState, operationIsActive, projectActivity, turnDuration, turnIsActive } from './activityPresentation'
import { ActivityMotion, ActivityText } from './ActivityText'
import { ActivityDisclosure, InspectionDetails, InspectionItem, InspectionScope, childInspectionKey } from './ActivityDisclosure'
import { ActivityTransition } from './ActivityTransition'
import { ActivityHeader } from './ActivityHeader'
import { activityKey, useActivityDisclosure } from '../../stores/activityDisclosure'
import { RinariAvatar } from '../rinari/RinariAvatar'
import { useAgentFocusStore } from '../../stores/agentFocus'
import { useSessionDockStore } from '../../stores/sessionDock'
import { rinariStateForTurn } from '../rinari/turnState'

interface Props {
  timeline: TurnTimeline
  user?: ChatMessage
  now: number
  onResolveApproval: (id: string, decision: string) => void
  onContinue?: () => void
  planActions?: ReactNode
  /** Abre la superficie de cambios de la sesión (fila de metadatos del turno). */
  onReviewChanges?: () => void
  /**
   * Dónde se pinta. En un panel de Boards la cara y el estado de Rinari viven
   * en la cabecera del panel: aquí no se repite «Pensando…».
   */
  surface?: 'chat' | 'pane'
}

const ActivityActive = createContext(true)
/** Sesión del turno: «Ver en el panel» abre los Agentes de esa sesión. */
const TurnSessionContext = createContext<string | null>(null)

const ICONS: Record<ToolCategory, typeof FileText> = {
  image: ImageIcon,
  read: FileText,
  search: FileSearch,
  list: ListTree,
  edit: Pencil,
  git: GitBranch,
  command: SquareTerminal,
  verify: ClipboardCheck,
  browser: AppWindow,
  web: Globe,
  skill: Sparkles,
  memory: Brain,
  code: Code,
  ask: MessageCircleQuestion,
  other: Wrench,
}

/**
 * Mosaico del icono de una operación. Al pasar de «en curso» a «completada»
 * mientras se mira, el check se dibuja; al volver a montarse (scroll,
 * historial) aparece quieto: la animación cuenta lo que acaba de pasar.
 */
function ToolTile({ tone, Icon }: { tone: string; Icon: typeof FileText }) {
  const wasRunning = useRef(tone === 'running')
  const celebrate = tone === 'done' && wasRunning.current
  useEffect(() => { if (tone === 'running') wasRunning.current = true }, [tone])
  return <span className={`act-tile${celebrate ? ' r-check-pop' : ''}`} data-state={tone} aria-hidden="true">
    {tone === 'running' ? <LoaderCircle size={14} className="r-spin" />
      : tone === 'done' && celebrate ? <svg className="r-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
      : tone === 'warn' ? <TriangleAlert size={14} />
      : tone === 'failed' ? <CircleAlert size={14} />
      : <Icon size={14} />}
  </span>
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, ms) / 1000
  return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`
}

/** Lo instantáneo no lleva duración: «0.0 s» no dice nada. */
const shownDuration = (ms: number | undefined): ms is number => ms !== undefined && ms >= 100

function ActivityRow({ item, onResolveApproval }: { item: Exclude<TimelineItem, { type: 'model' }>; onResolveApproval: (id: string, decision: string) => void }) {
  const { t, lang } = useI18n()
  const peerNavigation = usePeerNavigation()
  const active = useContext(ActivityActive)
  const technical = useUIStore((state) => state.showTechnicalActivityNames)
  if (item.type === 'vision' && item.fallback === 'without_images') {
    return <p data-testid="vision-without-images" className="flex items-center gap-2 py-1 text-[12px] text-[var(--warning)]"><TriangleAlert size={12} aria-hidden="true" />{t('vision.withoutImages')}</p>
  }
  if (item.type === 'vision' && item.route === 'conversation') return null
  if (item.type === 'vision') return <InspectionDetails inspectionId="vision" className="my-2 rounded-xl border border-[var(--border)] p-3 text-xs">
    <summary className="cursor-pointer"><ActivityText active={active && visualPending(item)}>{!active && visualPending(item) ? t('activity.interrupted') : item.status === 'queued' ? (lang === 'es' ? 'Análisis visual en espera' : 'Visual analysis queued') : item.status === 'preparing' ? (lang === 'es' ? 'Preparando imágenes…' : 'Preparing images…') : item.status === 'partial' ? (lang === 'es' ? 'Análisis visual parcial · límite de salida' : 'Partial visual analysis · output limit') : item.status === 'running' ? (lang === 'es' ? 'Analizando imágenes…' : 'Analyzing images…') : item.status === 'cancelled' ? (lang === 'es' ? 'Análisis visual cancelado' : 'Visual analysis cancelled') : item.status === 'failed' ? (lang === 'es' ? 'Falló el análisis visual' : 'Visual analysis failed') : (lang === 'es' ? 'Análisis visual' : 'Visual analysis')}</ActivityText></summary>
    {technical && <InspectionDetails inspectionId="vision-technical"><summary>{lang === 'es' ? 'Detalles técnicos' : 'Technical details'}</summary><p>{item.providerName} / {item.modelName || item.modelId}</p><p>{item.question}</p>{item.generation && <pre>{JSON.stringify(item.generation, null, 2)}</pre>}</InspectionDetails>}
    <div className="flex flex-wrap gap-2">{item.images.map(image => <ImageActivity key={image.uri} image={image} />)}</div>
    {item.analysis && <p className="whitespace-pre-wrap">{item.analysis}</p>}
    {item.error && <p role="alert" className="text-[var(--danger)]">{item.error}</p>}
  </InspectionDetails>
  if (item.type === 'tool') {
    const category = toolCategory(item.tool)
    const Icon = ICONS[category]
    const running = active && (item.status === 'requested' || item.status === 'running')
    const failed = item.status === 'failed' || item.status === 'cancelled'
    if (item.presentation?.kind === 'image' && item.presentation.image && item.status === 'completed') {
      return <InspectionDetails inspectionId="tool" className="py-1 text-[13px] text-[var(--text-muted)]">
        <summary className="flex cursor-pointer items-center gap-2"><ImageIcon size={13} /><span>{formatTool(item, lang)}</span>{shownDuration(item.durationMs) && <span className="text-[10px] text-[var(--text-subtle)]">{elapsed(item.durationMs)}</span>}</summary>
        <ImageActivity key={item.presentation.image.uri} image={item.presentation.image} />
      </InspectionDetails>
    }
    let outputPath: string | undefined = item.status === 'completed' ? item.filePath : undefined
    if (item.status === 'completed' && ['fs.write', 'fs.patch'].includes(item.tool)) {
      try { const args = JSON.parse(item.arguments ?? '{}'); if (typeof args.path === 'string') outputPath = args.path } catch { /* truncated arguments */ }
    }
    // Un comando que corrió y salió con código ≠ 0 no es un fallo de la
    // herramienta —una prueba en rojo a propósito sale con 1—: se muestra su
    // código en ámbar. El rojo queda para lo que no llegó a ejecutarse bien.
    const exitCode = item.presentation?.kind === 'command' ? item.presentation.exit_code : undefined
    const exited = failed && !item.error && !item.presentation?.error && typeof exitCode === 'number' && exitCode !== 0
    const instruction = agentInstruction(item)
    const tone = running ? 'running' : exited ? 'warn' : failed ? 'failed' : item.status === 'completed' ? 'done' : 'idle'
    return (
      <InspectionDetails inspectionId="tool" className="act-row group/activity text-[13px] text-[var(--text-muted)]" data-tone={tone}>
        <summary>
          <ToolTile tone={tone} Icon={Icon} />
          <ActivityText active={running} className="act-label">{formatTool(item, lang)}</ActivityText>
          {!active && ['requested', 'running'].includes(item.status) && <span className="text-xs">{t('activity.interrupted')}</span>}
          {exited && <span className="font-mono text-[10px] text-[var(--warning)]">{lang === 'es' ? `salida ${exitCode}` : `exit ${exitCode}`}</span>}
          {outputPath && <span onClick={e => e.stopPropagation()} className="text-[12px] text-[var(--accent-2)] underline"><FileLink href={outputPath}>{t('activity.viewFile')}</FileLink></span>}
          <span className="act-meta">
            {technical && <span className="font-mono text-[10px]">{item.tool}</span>}
            {shownDuration(item.durationMs) && <span className="tabular-nums">{elapsed(item.durationMs)}</span>}
            <ChevronDown size={13} className="transition-transform group-open/activity:rotate-180" />
          </span>
        </summary>
        {instruction && <blockquote data-testid="agent-instruction" className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap border-l-2 border-[var(--accent)]/40 pl-3 text-[12px] leading-relaxed text-[var(--text)] [overflow-wrap:anywhere]">{instruction.text}</blockquote>}
        {item.presentation?.kind === 'command' ? <CommandPresentation presentation={item.presentation} argumentsText={item.arguments} /> : item.presentation?.kind === 'tool' ? <StructuredPresentation presentation={item.presentation} fallback={item.error || item.result || item.arguments} /> : (item.arguments || item.result || item.error) && (
          <pre className="mt-1.5 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg-inset)] p-2 font-mono text-[11px] text-[var(--text-subtle)]">{item.error || item.result || item.arguments}</pre>
        )}
      </InspectionDetails>
    )
  }
  if (item.type === 'approval') {
    const copy = approvalCopy(item, t)
    const pending = item.status === 'pending'
    const resolving = item.status === 'resolving'
    const status = item.status === 'allowed' ? (lang === 'es' ? 'Concedido' : 'Allowed') : item.status === 'denied' ? (lang === 'es' ? 'Denegado' : 'Denied') : item.status === 'expired' ? (lang === 'es' ? 'Expirado' : 'Expired') : ''
    const open = pending || resolving
    return (
      <div className="approval-card my-2 text-[13px]" data-state={open ? 'open' : 'settled'}>
        <div className="flex flex-wrap items-center gap-3 text-[var(--text)]">
          <span className="approval-icon"><ShieldAlert size={17} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            {open && <div className="font-display text-[15px] font-bold tracking-[-0.01em]">{t('approval.heading')}</div>}
            <div className={open ? 'mt-0.5 text-[13px] text-[var(--text-muted)]' : ''} title={item.description}>{copy.title}{copy.tool && <span className="ml-2 font-mono text-[11px] text-[var(--text-subtle)]">{copy.tool}</span>}</div>
          </div>
          {open ? <span className="approval-badge">{t('approval.waiting')}</span> : <span className="text-[12px] text-[var(--text-muted)]">{status}</span>}
        </div>
        {copy.note && <div className="mt-2 text-[12px] text-[var(--warning)]">{copy.note}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-subtle)]">
          <span>{t('approval.riskLabel')} <b className="font-semibold text-[var(--warning)]">{copy.risk}</b></span>
          {item.target && <span className="min-w-0 break-all font-mono">{item.capability === 'session.message' && peerNavigation?.labelFor(item.target) ? t('board.peers.approvalTarget', { label: peerNavigation.labelFor(item.target) ?? item.target }) : item.target}</span>}
        </div>
        {open && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            <ApprovalActions item={item} disabled={resolving} onResolve={onResolveApproval} />
          </div>
        )}
      </div>
    )
  }
  if (item.type === 'agent') return <AgentCard item={item} onResolveApproval={onResolveApproval} />
  if (item.type === 'changeset') return null
  if (item.type === 'question') return <InspectionDetails inspectionId="question" className="rounded-xl border border-[var(--border)] p-3 text-xs" open={item.request.status === 'pending'}><summary className="cursor-pointer">{t(item.request.status === 'pending' ? 'questions.waiting' : item.request.status === 'answered' ? 'questions.answered' : item.request.status === 'skipped' ? 'questions.skipped' : 'questions.expired')}</summary><div className="mt-2 space-y-2">{item.request.questions?.map(q => <div key={q.id}><strong>{q.title}</strong>{item.request.answers?.[q.id] && <p className="mt-1 whitespace-pre-wrap">{item.request.answers[q.id]}</p>}</div>)}</div></InspectionDetails>
  if (item.type === 'system' && item.kind === 'reasoning_dropped') {
    return <p data-testid="reasoning-dropped" className="py-1 text-[12px] text-[var(--text-subtle)]">{t('activity.reasoningDropped', { effort: item.label ?? '' })}</p>
  }
  if (item.type === 'system') return null
  const labels = !active && 'status' in item && item.status === 'running' ? t('activity.interrupted') : item.type === 'context'
      ? (item.status === 'running' ? (lang === 'es' ? 'Compactando contexto automáticamente…' : 'Automatically compacting context…') : item.status === 'failed' ? (lang === 'es' ? 'No se pudo compactar el contexto' : 'Context compaction failed') : item.status === 'cancelled' ? (lang === 'es' ? 'Compactación cancelada' : 'Compaction cancelled') : item.status === 'skipped' ? compactionSkipped(item, t) : (lang === 'es' ? 'Contexto compactado' : 'Context compacted'))
      : item.type === 'verification'
        ? (item.status === 'running' ? (lang === 'es' ? 'Verificando…' : 'Verifying…') : item.status === 'failed' ? (lang === 'es' ? 'La verificación falló' : 'Verification failed') : (lang === 'es' ? 'Verificación completada' : 'Verification completed'))
        : ''
  if (!labels) return null
  if (item.type === 'context') return <div className="py-1 text-[13px] text-[var(--text-muted)]">
    <div className="flex items-center gap-2">{active && item.status === 'running' ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}<ActivityText active={active && item.status === 'running'}>{active && item.status === 'running' && item.reason === 'manual' ? (lang === 'es' ? 'Compactando contexto…' : 'Compacting context…') : labels}</ActivityText>
      {(item.status === 'failed' || item.status === 'cancelled') && item.sessionId && <>
        {/* El turno se detuvo aquí: compactar y seguir en un solo paso, sin escribir «Continúa». */}
        <button className="underline" onClick={() => { void engineApi.contextCompact(item.sessionId!, lang === 'es' ? 'Continúa' : 'Continue').catch(e => toast.error(commandMessage(e))) }}>{lang === 'es' ? 'Compactar y continuar' : 'Compact and continue'}</button>
        <button className="underline" onClick={() => { void engineApi.contextCompact(item.sessionId!).catch(e => toast.error(commandMessage(e))) }}>{lang === 'es' ? 'Solo compactar' : 'Compact only'}</button>
      </>}
    </div>
    {(item.error || item.contextDetails) && <InspectionDetails inspectionId="context" className="mt-1"><summary>{lang === 'es' ? 'Detalles' : 'Details'}</summary>{item.error && <p className="whitespace-pre-wrap">{item.error}</p>}<CompactionDetails details={item.contextDetails} /></InspectionDetails>}
  </div>
  const Icon = item.type === 'verification' ? Check : Sparkles
  return <div className="flex items-center gap-2 py-1 text-[13px] text-[var(--text-muted)]"><Icon size={13} className="text-[var(--text-subtle)]" /><ActivityText active={active && operationIsActive(item)}>{labels}</ActivityText></div>
}

/**
 * Una compactación manual sin efecto dice por qué y con qué números. Sin
 * motivo (un Engine anterior), el texto de siempre.
 */
export function compactionSkipped(item: ContextTimelineItem, t: (key: I18nKey, params?: Record<string, string | number>) => string): string {
  const details = item.contextDetails ?? {}
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toLocaleString() : '?')
  if (item.skipReason === 'empty_history') return t('context.skipped.empty')
  if (item.skipReason === 'only_latest_exchange') return t('context.skipped.latestOnly', { messages: count(details.messages), tokens: count(details.history) })
  if (item.skipReason === 'summary_not_smaller') return t('context.skipped.notSmaller', { tokens: count(details.after) })
  return t('context.skipped.generic')
}

function StructuredValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const { t } = useI18n()
  if (value === undefined) return <span className="text-[var(--text-subtle)]">—</span>
  if (typeof value === 'string') {
    return value.startsWith('artifact://')
      ? <FileLink href={value}><span className="break-all text-[var(--accent)] underline">{value}</span></FileLink>
      : <span className="break-words whitespace-pre-wrap">{value}</span>
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="font-mono">{String(value)}</span>
  }
  if (depth >= 3) {
    const count = Array.isArray(value) ? value.length : Object.keys(value as object).length
    return <span className="text-[var(--text-subtle)]">{Array.isArray(value) ? `[${t('activity.items', { n: count })}]` : `{${t('activity.fields', { n: count })}}`}</span>
  }
  if (Array.isArray(value)) {
    const visible = value.slice(0, 24)
    return <ul className="space-y-1">
      {visible.map((item, index) => <li key={index} className="flex gap-1.5"><span className="text-[var(--text-subtle)]">•</span><span className="min-w-0"><StructuredValue value={item} depth={depth + 1} /></span></li>)}
      {value.length > visible.length && <li className="text-[var(--text-subtle)]">{t('activity.more', { n: value.length - visible.length })}</li>}
    </ul>
  }
  if (typeof value === 'object') {
    const rows = Object.entries(value as Record<string, unknown>)
    const visible = rows.slice(0, 24)
    return <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-2 gap-y-1">
      {visible.map(([key, item]) => <div key={key} className="contents"><dt className="text-[var(--text-subtle)]">{key}</dt><dd className="min-w-0"><StructuredValue value={item} depth={depth + 1} /></dd></div>)}
      {rows.length > visible.length && <div className="col-span-2 text-[var(--text-subtle)]">{t('activity.more', { n: rows.length - visible.length })}</div>}
    </dl>
  }
  return <span className="font-mono">{String(value)}</span>
}

function StructuredPresentation({ presentation, fallback }: {
  presentation: NonNullable<Extract<TimelineItem, { type: 'tool' }>['presentation']>
  fallback?: string
}) {
  const { lang } = useI18n()
  const data = presentation.data
  const entries = data && typeof data === 'object' && !Array.isArray(data)
    ? Object.entries(data as Record<string, unknown>).slice(0, 24)
    : []
  let raw = ''
  if (data !== undefined) {
    try {
      const encoded = JSON.stringify(data, null, 2)
      raw = typeof encoded === 'string' ? encoded.slice(0, 64_000) : ''
    } catch { /* protocol data should be JSON, but rendering must stay total */ }
  }
  return <div className="mt-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] text-[11px] text-[var(--text-muted)]">
    {entries.length > 0 ? <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1.5 p-2.5">
      {entries.map(([key, value]) => <div key={key} className="contents">
        <dt className="font-medium text-[var(--text-subtle)]">{key}</dt>
        <dd className="min-w-0"><StructuredValue value={value} /></dd>
      </div>)}
    </dl> : data !== undefined ? <div className="p-2.5"><StructuredValue value={data} /></div> : fallback ? <pre className="max-h-44 overflow-auto whitespace-pre-wrap p-2.5 font-mono">{fallback}</pre> : <div className="p-2.5 text-[var(--text-subtle)]">{lang === 'es' ? 'Sin datos' : 'No data'}</div>}
    {presentation.artifacts && presentation.artifacts.length > 0 && <div className="border-t border-[var(--border)] p-2.5"><span className="mr-2 text-[var(--text-subtle)]">{lang === 'es' ? 'Artefactos' : 'Artifacts'}:</span>{presentation.artifacts.map((artifact) => <FileLink key={artifact} href={artifact}><span className="mr-2 break-all text-[var(--accent)] underline">{artifact}</span></FileLink>)}</div>}
    {presentation.error?.message && <div className="border-t border-red-400/20 p-2.5 text-[var(--danger)]">{presentation.error.message}</div>}
    {raw && <InspectionDetails inspectionId="json" className="border-t border-[var(--border)] px-2.5 py-1.5 text-[10px] text-[var(--text-subtle)]"><summary className="cursor-pointer">JSON</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono">{raw}</pre></InspectionDetails>}
  </div>
}

function CommandPresentation({ presentation, argumentsText }: { presentation: NonNullable<Extract<TimelineItem, { type: 'tool' }>['presentation']>; argumentsText?: string }) {
  const { lang } = useI18n()
  const argv = Array.isArray(presentation.command) ? presentation.command : undefined
  const command = typeof presentation.command === 'string' ? presentation.command : undefined
  const displayCommand = argv ? `argv ${JSON.stringify(argv)}` : command
  const copy = () => {
    if (displayCommand) void copyText(argv ? JSON.stringify(argv) : displayCommand)
  }
  const exitCode = presentation.exit_code
  const failed = presentation.status === 'failed' || (typeof exitCode === 'number' && exitCode !== 0)
  return <div className="term-card mt-1.5">
    <div className="term-card-head">
      <SquareTerminal size={12} aria-hidden="true" className="text-[var(--accent-2)]" />
      <span className="font-mono">{presentation.cwd ? `${presentation.cwd}` : 'shell'}</span>
      {typeof exitCode === 'number' && <span className={failed ? 'text-[var(--danger)]' : 'text-[var(--success)]'}>{lang === 'es' ? `salida ${exitCode}` : `exit ${exitCode}`}</span>}
      {presentation.stderr_warning && <span className="text-[var(--warning)]">{lang === 'es' ? 'stderr con código 0' : 'stderr with exit 0'}</span>}
      {presentation.truncated && <span className="text-[var(--warning)]">{lang === 'es' ? 'salida visible truncada' : 'visible output truncated'}</span>}
      {presentation.capture_truncated && <span className="text-[var(--danger)]">{lang === 'es' ? 'captura completa limitada a 50 MiB' : 'full capture limited to 50 MiB'}</span>}
      <button type="button" onClick={copy} disabled={!displayCommand} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"><Copy size={11} />{lang === 'es' ? 'Copiar' : 'Copy'}</button>
    </div>
    {displayCommand && <pre className="overflow-auto whitespace-pre-wrap px-2.5 py-2 font-mono text-[11px] text-[var(--text)]"><span className="text-[var(--accent-2)]">{presentation.cwd?.match(/[A-Za-z]:/) ? 'PS> ' : '$ '}</span>{displayCommand}</pre>}
    {presentation.stdout && <StreamOutput label="stdout" content={presentation.stdout} />}
    {presentation.stderr && <StreamOutput label="stderr" content={presentation.stderr} warning />}
    {!presentation.stdout && !presentation.stderr && <div className="border-t border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--text-subtle)]">{lang === 'es' ? 'Sin salida' : 'No output'}</div>}
    {presentation.error?.message && <div className="border-t border-red-400/20 px-2.5 py-2 text-[11px] text-[var(--danger)]"><span className="mr-1 font-mono">{presentation.error.code ?? 'error'}:</span>{presentation.error.message}</div>}
    {presentation.artifacts && presentation.artifacts.length > 0 && <div className="border-t border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]"><span className="mr-2 text-[var(--text-subtle)]">{lang === 'es' ? 'Artefactos' : 'Artifacts'}:</span>{presentation.artifacts.map((artifact) => <FileLink key={artifact} href={artifact}><span className="mr-2 underline">{artifact}</span></FileLink>)}</div>}
    {argumentsText && <InspectionDetails inspectionId="command-technical" className="border-t border-[var(--border)] px-2.5 py-1.5 text-[10px] text-[var(--text-subtle)]"><summary className="cursor-pointer">{lang === 'es' ? 'Detalles técnicos' : 'Technical details'}</summary><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{argumentsText}</pre></InspectionDetails>}
  </div>
}

type AgentItem = Extract<TimelineItem, { type: 'agent' }>

/**
 * Tarjeta de un subagente. Su actividad tiene un scroll propio (32rem): sigue
 * el final mientras el lector esté abajo, incluido el crecimiento de un
 * mensaje ya existente, y se pausa al subir, solo en esta tarjeta. Un agente
 * ya terminado se abre desde el principio, para leerlo; uno en marcha, por
 * el final. Nunca mueve la conversación exterior ni otras tarjetas.
 */
function AgentCard({ item, onResolveApproval }: { item: AgentItem; onResolveApproval: (id: string, decision: string) => void }) {
  const { lang, t } = useI18n()
  const active = useContext(ActivityActive)
  const agentSession = useContext(TurnSessionContext)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [showJump, setShowJump] = useState(false)

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return
    // The lazy body restores before this parent's layout effect attaches.
    if (node.dataset.inspectionFollowing !== undefined) {
      followingRef.current = node.dataset.inspectionFollowing === 'true'
      setShowJump(!followingRef.current)
    }
    const restore = (event: Event) => {
      followingRef.current = (event as CustomEvent<{ following: boolean }>).detail.following
      node.dataset.inspectionFollowing = String(followingRef.current)
      setShowJump(!followingRef.current)
    }
    node.addEventListener('activity-inspection-restore', restore)
    return () => node.removeEventListener('activity-inspection-restore', restore)
  }, [open])

  function toEnd() {
    const el = scrollRef.current
    if (el) { el.scrollTop = el.scrollHeight; el.dataset.inspectionFollowing = 'true' }
  }

  function onToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    const next = event.currentTarget.open
    // La primera apertura decide: en marcha sigue el final; terminado, se lee.
    if (next && followingRef.current === null) followingRef.current = active && item.status === 'running'
    setOpen(next)
  }

  useLayoutEffect(() => {
    if (open && followingRef.current) toEnd()
  }, [open, item.items, item.summary, item.status])

  useEffect(() => {
    const content = contentRef.current
    if (!open || !content || typeof ResizeObserver === 'undefined') return
    let frame = 0
    // Markdown, imágenes y bloques que cambian de alto sin un evento nuevo.
    const observer = new ResizeObserver(() => {
      if (!followingRef.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { if (followingRef.current) toEnd() })
    })
    observer.observe(content)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [open])

  function trackScroll() {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 24
    followingRef.current = atBottom
    el.dataset.inspectionFollowing = String(atBottom)
    setShowJump(!atBottom)
  }

  function jumpToEnd() {
    followingRef.current = true
    toEnd()
    setShowJump(false)
  }

  return (
    <InspectionDetails inspectionId="agent" data-testid="agent-card" className="act-row agent-row group/agent relative my-1" onToggle={onToggle}>
      <summary className="text-sm text-[var(--text)]">
        <span className="act-tile" data-state={active && item.status === 'running' ? 'running' : item.status === 'completed' ? 'done' : item.status === 'running' ? 'idle' : 'failed'} style={{ color: 'var(--agent)' }} aria-hidden="true">
          {active && item.status === 'running' ? <LoaderCircle size={14} className="r-spin" /> : <Bot size={14} />}
        </span>
        <span className="font-semibold">{item.agent}</span>
        {item.objective && <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-muted)]" title={item.objective}>{item.objective}</span>}
        <ActivityText active={active && item.status === 'running'} className="act-meta text-[12px]">{!active && item.status === 'running' ? t('activity.interrupted') : item.status === 'running' ? (lang === 'es' ? 'Trabajando' : 'Working') : item.status === 'completed' ? (lang === 'es' ? 'Completado' : 'Completed') : (lang === 'es' ? 'Interrumpido o fallido' : 'Stopped or failed')}</ActivityText>
        {item.agentId && agentSession && <button type="button" className="btn btn-ghost btn-xs" onClick={event => {
          event.preventDefault(); event.stopPropagation()
          useAgentFocusStore.getState().focus(agentSession, item.agentId)
          useSessionDockStore.getState().reveal(agentSession, 'agents')
        }}>{t('activity.agentInPanel')}</button>}
        <span className="sr-only">{lang === 'es' ? 'Ver actividad' : 'View activity'}</span><ChevronDown size={13} className="text-[var(--text-subtle)] transition-transform group-open/agent:rotate-180" />
      </summary>
      <div ref={scrollRef} onScroll={trackScroll} data-testid="agent-activity" data-inspection-scroll className="mx-3 mb-3 mt-1 max-h-[32rem] overflow-auto">
        <div ref={contentRef} className="space-y-2">
        {(item.cwd || item.profile) && <p className="break-all font-mono text-xs text-[var(--text-subtle)]">{item.profile} · {item.cwd}</p>}
        <ActivityActive.Provider value={active && item.status === 'running'}>{(item.items ?? []).map(child => <InspectionItem key={child.id} id={child.id}>{child.type === 'model'
          ? child.content ? <Markdown>{child.content}</Markdown> : null
          : <ActivityRow item={child} onResolveApproval={onResolveApproval} />}</InspectionItem>)}</ActivityActive.Provider>
        {item.summary && !(item.items ?? []).some(child => child.type === 'model' && child.content === item.summary) && <Markdown>{item.summary}</Markdown>}
        {!item.items?.length && !item.summary && <p className="text-xs text-[var(--text-muted)]">{active && item.status === 'running' ? (lang === 'es' ? 'Esperando actividad del agente…' : 'Waiting for agent activity…') : t('activity.noDetails')}</p>}
        </div>
      </div>
      {open && showJump && <button type="button" onClick={jumpToEnd} className="absolute right-5 bottom-4 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-muted)] shadow hover:text-[var(--text)]">{lang === 'es' ? 'Ir al final' : 'Jump to end'}</button>}
    </InspectionDetails>
  )
}

function StreamOutput({ label, content, warning = false }: { label: string; content: string; warning?: boolean }) {
  const { lang } = useI18n()
  const outputRef = useRef<HTMLPreElement>(null)
  const followingRef = useRef(true)
  const [showJump, setShowJump] = useState(false)

  useLayoutEffect(() => {
    const node = outputRef.current
    if (!node) return
    const restore = (event: Event) => {
      followingRef.current = (event as CustomEvent<{ following: boolean }>).detail.following
      node.dataset.inspectionFollowing = String(followingRef.current)
      setShowJump(!followingRef.current)
    }
    node.addEventListener('activity-inspection-restore', restore)
    return () => node.removeEventListener('activity-inspection-restore', restore)
  }, [])

  useEffect(() => {
    const output = outputRef.current
    if (!output || !followingRef.current) return
    output.scrollTop = output.scrollHeight
  }, [content])

  function trackScroll() {
    const output = outputRef.current
    if (!output) return
    const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight <= 24
    followingRef.current = atBottom
    output.dataset.inspectionFollowing = String(atBottom)
    setShowJump(!atBottom)
  }

  function jumpToEnd() {
    const output = outputRef.current
    if (!output) return
    output.scrollTop = output.scrollHeight
    followingRef.current = true
    output.dataset.inspectionFollowing = 'true'
    setShowJump(false)
  }

  return <div className={`relative border-t px-2.5 py-2 ${warning ? 'border-amber-400/20' : 'border-[var(--border)]'}`}>
    <div className={`mb-1 text-[10px] uppercase tracking-wide ${warning ? 'text-[var(--warning)]' : 'text-[var(--text-subtle)]'}`}>{label}</div>
    <pre ref={outputRef} onScroll={trackScroll} data-inspection-scroll className={`max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] ${warning ? 'text-amber-100/80' : 'text-[var(--text-muted)]'}`}>{content}</pre>
    {showJump && <button type="button" onClick={jumpToEnd} className="absolute right-4 bottom-3 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-muted)] shadow hover:text-[var(--text)]">{lang === 'es' ? 'Ir al final' : 'Jump to end'}</button>}
  </div>
}

/** Sesión de una ejecución programada: sus aprobaciones ofrecen «Permitir para esta tarea». */
const ScheduledRunContext = createContext<string | null>(null)

function ApprovalActions({ item, disabled, onResolve }: { item: Extract<TimelineItem, { type: 'approval' }>; disabled: boolean; onResolve: (id: string, decision: string) => void }) {
  const { lang } = useI18n()
  const runSession = useContext(ScheduledRunContext)
  const [granting, setGranting] = useState(false)
  const choices = [
    ['deny', lang === 'es' ? 'Denegar' : 'Deny'],
    ['allow_once', lang === 'es' ? 'Permitir una vez' : 'Allow once'],
    ['allow_session', lang === 'es' ? 'Permitir en este chat' : 'Allow in this chat'],
    ['allow_project', item.grantScope === 'chats'
      ? (lang === 'es' ? 'Siempre en los chats' : 'Always in chats')
      : (lang === 'es' ? 'Siempre en este proyecto' : 'Always in this project')],
  ]
  // «Siempre…» solo si el Engine lo ofrece: uno anterior a permisos v3 no lo entiende.
  const offered = choices.filter(([decision]) => item.choices ? item.choices.includes(decision) : decision !== 'allow_project')
  const buttonClass = (decision: string) => decision === 'allow_once' ? 'btn btn-primary' : decision === 'deny' ? 'btn btn-ghost' : 'btn btn-secondary'
  // La tarea suma el permiso y la ejecución sigue: las próximas no preguntan.
  const allowForTask = async () => {
    if (!runSession) return
    setGranting(true)
    try {
      await engineApi.scheduleGrant({ sessionId: runSession, capability: item.capability, target: item.target ?? null })
      onResolve(item.approvalId, 'allow_session')
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setGranting(false)
    }
  }
  return <>
    {offered.map(([decision, label]) => <button key={decision} type="button" disabled={disabled} onClick={() => onResolve(item.approvalId, decision)} className={buttonClass(decision)}>{label}</button>)}
    {runSession && item.reusable !== false && offered.some(([decision]) => decision === 'allow_session') && (
      <button type="button" disabled={disabled || granting} onClick={() => void allowForTask()} className={buttonClass('allow_task')}>
        {lang === 'es' ? 'Permitir para esta tarea' : 'Allow for this task'}
      </button>
    )}
  </>
}

const visualPending = (item: VisionTimelineItem) => ['queued', 'preparing', 'running'].includes(item.status)

function VisualProgress({ items, status, onResolveApproval, showProgress = true }: {
  items: VisionTimelineItem[]; status: TurnTimeline['status']; onResolveApproval: Props['onResolveApproval']; showProgress?: boolean
}) {
  const { lang } = useI18n()
  const technical = useUIStore(state => state.showTechnicalActivityNames)
  const es = lang === 'es'
  const active = ['running', 'approval', 'cancelling'].includes(status)
  const pending = items.filter(visualPending)
  const issues = items.filter(item => ['partial', 'failed', 'cancelled'].includes(item.status) || (!active && visualPending(item)))
  const total = items.reduce((count, item) => count + Math.max(1, item.images.length), 0)
  const finished = items.filter(item => !visualPending(item)).reduce((count, item) => count + Math.max(1, item.images.length), 0)
  return <>
    {showProgress && active && pending.length > 0 && <div role="status" aria-live="polite" className="flex items-center gap-2 py-1 text-[13px] text-[var(--text-muted)]">
      <LoaderCircle size={13} className="animate-spin text-[var(--accent-2)] motion-reduce:animate-none" />
      <ActivityText active={active}>{status === 'cancelling' ? (es ? 'Cancelando análisis' : 'Cancelling analysis') : (es ? 'Analizando imágenes' : 'Analyzing images')} · {finished} {es ? 'de' : 'of'} {total}</ActivityText>
    </div>}
    {issues.length > 0 && <InspectionDetails inspectionId="vision-issues" data-activity-item="vision-issues" className="py-1 text-xs text-[var(--warning)]">
      <summary className="cursor-pointer">{es ? 'Revisión de imágenes con incidencias' : 'Image review issues'} · {issues.length}</summary>
      <div className="mt-2 space-y-3">{issues.map(item => <div key={item.id}>
        <p>{item.status === 'partial' ? (es ? 'Análisis parcial · límite de salida' : 'Partial analysis · output limit') : item.status === 'cancelled' ? (es ? 'Análisis cancelado' : 'Analysis cancelled') : item.status === 'failed' ? (es ? 'No se pudo analizar la imagen' : 'Image analysis failed') : (es ? 'Análisis interrumpido' : 'Analysis interrupted')}</p>
        <div className="mt-1 flex flex-wrap gap-2">{item.images.map(image => <ImageActivity key={image.uri} image={image} />)}</div>
        {!item.images.length && <p className="text-[var(--text-muted)]">{es ? 'Referencia de imagen no disponible' : 'Image reference unavailable'}</p>}
      </div>)}</div>
    </InspectionDetails>}
    {technical && items.length > 0 && <InspectionDetails inspectionId="vision-all" data-activity-item="vision-technical" className="py-1 text-xs text-[var(--text-subtle)]">
      <summary className="cursor-pointer">{es ? 'Detalles técnicos de visión' : 'Vision technical details'} · {items.length}</summary>
      {items.map(item => <InspectionItem key={item.id} id={item.id}><ActivityRow item={item} onResolveApproval={onResolveApproval} /></InspectionItem>)}
    </InspectionDetails>}
  </>
}

/**
 * Un turno en la conversación, idéntico en Normal y Boards: mensaje del
 * usuario, actividad intermedia, la respuesta final canónica (`TurnResult`,
 * una sola vez) y una fila compacta de metadatos/acciones (`TurnMeta`) que no
 * repite el cuerpo.
 */
export default function TurnTimelineView(props: Props) {
  const { timeline } = props
  const runSession = timeline.origin?.kind === 'schedule' ? timeline.sessionId : null
  return (
    <ScheduledRunContext.Provider value={runSession}>
      <TurnSessionContext.Provider value={timeline.sessionId}>
        <TurnTimelineBody {...props} />
      </TurnSessionContext.Provider>
    </ScheduledRunContext.Provider>
  )
}

/** Lo que escribiste mientras Rinari trabajaba, en el punto donde lo leyó. */
function SteerBubble({ item }: { item: SteerTimelineItem }) {
  const { t } = useI18n()
  return (
    <div data-testid="steer-message" data-status={item.status} className="flex w-full min-w-0 flex-col items-end gap-0.5 py-1.5">
      <div className="w-fit min-w-0 max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)]/15 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--text)]">
        {item.content}
      </div>
      <span className="text-[10px] text-[var(--text-subtle)]">
        {t(item.status === 'pending' ? 'steer.pending' : 'steer.applied')}
      </span>
    </div>
  )
}

function TurnTimelineBody({ timeline, user, now, onResolveApproval, planActions, onReviewChanges, surface = 'chat' }: Props) {
  const { t } = useI18n()
  const home = useUIStore(s => s.flowHomeId)
  const technical = useUIStore(s => s.showTechnicalActivityNames)
  const projection = useMemo(() => projectActivity(timeline), [timeline.items, timeline.status])
  const state = useMemo(() => activityState(timeline), [timeline.items, timeline.status])
  const working = ['preparing', 'recovering', 'retrying', 'action', 'thinking', 'responding'].includes(state.kind)
    || state.kind === 'waiting' && state.parallel > 0
  const active = turnIsActive(timeline.status)
  // En un panel, «pensando» (sin acciones ni texto aún) ya lo dice la cabecera
  // del panel con la cara de Rinari: la fila viva aparece cuando hay algo que
  // contar (una acción, la respuesta, un reintento, la cancelación).
  const paneThinking = surface === 'pane' && state.kind === 'thinking' && timeline.status !== 'cancelling'
  const showHeader = !paneThinking && (!active || timeline.items.length > 0 || now - timeline.startedAt >= 300 || timeline.status === 'cancelling')
  const emphasis = Boolean(projection.final) && (projection.actions >= 3 || (turnDuration(timeline, now) ?? 0) >= 10_000)
  return (
    <ActivityMotion.Provider value={working}><ActivityActive.Provider value={active}><ActivityTransition identity={`${active}:${projection.final?.id ?? ''}:${projection.segments.length}`}>
      {user ? <MessageBubble message={user.origin || !timeline.origin ? user : { ...user, origin: timeline.origin }} /> : timeline.userMessage ? <MessageBubble message={{ id: `user-${timeline.turnId}`, role: 'user', content: timeline.userMessage, createdAt: timeline.startedAt, turnId: timeline.turnId, origin: timeline.origin }} /> : null}
      {active && showHeader && <div data-live-activity className="turn-head text-[13px] text-[var(--text-muted)]">
        <RinariAvatar state={rinariStateForTurn(state.kind)} size={38} />
        <div className="min-w-0 flex-1">
          <div className="turn-head-name">{t('rinari.name')}</div>
          <ActivityHeader timeline={timeline} now={now} />
        </div>
      </div>}
      {projection.segments.map((segment, index) => {
        const previous = index < projection.segments.length - 1
        const items = renderableActivity(segment.items, technical, active)
        const issues = activityIssues(segment.items, active)
        const stateKey = activityKey(home, timeline.sessionId, timeline.turnId, segment.id)
        const content = items.length ? <ActivityDetails items={items} status={timeline.status} onResolveApproval={onResolveApproval} /> : undefined
        return <InspectionScope.Provider key={segment.id} value={stateKey}><div className="space-y-2">
          {segment.steer && <SteerBubble item={segment.steer} />}
          {active ? content : (content || !previous) && <ActivityDisclosure
            stateKey={childInspectionKey(stateKey, 'summary')}
            header={previous ? <ActivityHeader timeline={timeline} now={now} previous /> : <span className="turn-head"><RinariAvatar state={rinariStateForTurn(timeline.status)} size={30} /><ActivityHeader timeline={timeline} now={now} /></span>}
            inspectLabel={issues ? t('activity.incidents', { n: issues }) : undefined}
          >{content}</ActivityDisclosure>}
        </div></InspectionScope.Provider>
      })}
      {projection.approvals.map(({ item, agent }) => <div key={item.approvalId}>
        {agent && <p className="text-xs text-[var(--text-muted)]">{agent}</p>}
        <ActivityRow item={item} onResolveApproval={onResolveApproval} />
      </div>)}
      {projection.notices.map(item => item.type !== 'model' && <ActivityRow key={item.id} item={item} onResolveApproval={onResolveApproval} />)}
      {projection.memories.map(item => <MemoryActivityCard key={item.id} item={item} />)}
      {projection.skills.map(item => <SkillProposalCard key={item.id} item={item} />)}
      {projection.recoveries.map(item => item.type !== 'model' && <InspectionScope.Provider key={item.id} value={activityKey(home, timeline.sessionId, timeline.turnId, item.id)}><ActivityRow item={item} onResolveApproval={onResolveApproval} /></InspectionScope.Provider>)}
      <TurnResult timeline={timeline} planActions={planActions} provisional={!active ? projection.provisional : undefined} />
      <TurnMeta timeline={timeline} user={user} actions={projection.actions} emphasis={emphasis} durationInHeader={showHeader} onReviewChanges={onReviewChanges} />
    </ActivityTransition></ActivityActive.Provider></ActivityMotion.Provider>
  )
}

function activityIssues(items: TimelineItem[], active: boolean): number {
  return items.reduce((count, item) => count + (item.type === 'agent' ? activityIssues(item.items ?? [], active) : 0)
    + ('status' in item && (['failed', 'partial', 'cancelled'].includes(item.status ?? '') || item.type === 'vision' && !active && visualPending(item)) ? 1 : item.type === 'tool' && item.presentation?.stderr_warning ? 1 : 0), 0)
}

function renderableActivity(items: TimelineItem[], technical: boolean, active: boolean) {
  return items.filter(item => item.type !== 'vision' || technical || ['partial', 'failed', 'cancelled'].includes(item.status) || (!active && visualPending(item)))
}

const ActivityDetails = memo(function ActivityDetails({ items, status, onResolveApproval }: {
  items: TimelineItem[]; status: TurnTimeline['status']; onResolveApproval: Props['onResolveApproval']
}) {
  const blocks = useMemo(() => activityBlocks(items), [items])
  const live = turnIsActive(status)
  return <div className="turn-rail space-y-2" data-live={live}>{blocks.map(block => block.type === 'text'
    ? <div key={block.id} data-activity-item={block.id} className="relative py-0.5 text-[14px] leading-relaxed text-[var(--text)]">
        <span className="turn-node" data-state="text" aria-hidden="true" style={{ top: 9, width: 6, height: 6, left: -16 }} />
        <Markdown>{block.item.content}</Markdown>
        {block.item.modelChange && <ModelChangeNotice change={block.item.modelChange} />}
      </div>
    : <div key={block.id} className="relative"><span className="turn-node" data-state={nodeState(block.items, live)} aria-hidden="true" /><OperationGroup items={block.items} status={status} onResolveApproval={onResolveApproval} /></div>)}</div>
})

/** Color del nodo de un grupo en el riel: lo peor que haya pasado, o en curso. */
function nodeState(items: TimelineItem[], live: boolean): string {
  if (items.some(item => 'status' in item && ['failed', 'cancelled'].includes(item.status ?? ''))) return 'failed'
  if (live && items.some(operationIsActive)) return 'running'
  if (items.some(item => item.type === 'agent')) return 'agent'
  return 'done'
}

function OperationGroup({ items, status, onResolveApproval }: {
  items: Exclude<TimelineItem, { type: 'model' }>[]; status: TurnTimeline['status']; onResolveApproval: Props['onResolveApproval']
}) {
  const { t } = useI18n()
  const scope = useContext(InspectionScope)
  const active = turnIsActive(status)
  const first = items[0]
  const firstDetail = childInspectionKey(childInspectionKey(scope, first.id), first.type)
  const firstOpen = useActivityDisclosure(state => state.entries[firstDetail]?.open ?? false)
  const issues = activityIssues(items, active)
  const categories = [...new Set(items.map(item => item.type === 'tool' ? toolCategory(item.tool) : item.type))]
  const label = categories.map(category => t(`activity.group.${category}` as I18nKey)).join(' · ')
  const images = items.filter((item): item is VisionTimelineItem => item.type === 'vision')
  const content = <>{items.filter(item => item.type !== 'vision').map(item => <InspectionItem key={item.id} id={item.id}>
    <ActivityRow item={item} onResolveApproval={onResolveApproval} />
  </InspectionItem>)}<VisualProgress items={images} status={status} onResolveApproval={onResolveApproval} showProgress={false} /></>
  // Keep a group wrapper from its very first operation. Growing the run must
  // never replace its identity or lose the inspection of that first operation.
  const key = childInspectionKey(scope, 'group:' + items[0].id)
  return <div data-operation-group={items[0].id}>
    {items.length === 1 || images.length === items.length ? content : <ActivityDisclosure stateKey={key} operations defaultOpen={firstOpen}
      header={<ActivityText active={active && items.some(operationIsActive)}>{label} · {items.length}</ActivityText>}
      inspectLabel={issues ? t('activity.incidents', { n: issues }) : undefined}
    >{content}</ActivityDisclosure>}
  </div>
}
