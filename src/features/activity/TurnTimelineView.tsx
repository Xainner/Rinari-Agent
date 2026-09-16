import {
  Bot,
  Check,
  Copy,
  ChevronDown,
  CircleAlert,
  FileSearch,
  FileText,
  Image as ImageIcon,
  GitBranch,
  ListTree,
  LoaderCircle,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  SquareTerminal,
  TestTube2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import type { ChatMessage } from '../../types'
import Markdown from '../../components/Markdown'
import { FileLink } from '../files/FileWorkspace'
import MessageBubble from '../../components/MessageBubble'
import { usePeerNavigation } from '../board/PeerNavigationContext'
import { useResultVisibility } from '../board/useResultVisibility'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { commandMessage, engineApi, type TurnChangedFile, type TurnUndoPreview } from '../../services/engine'
import { formatTool, toolCategory } from './formatActivity'
import { ImageActivity } from './ImageActivity'
import type { TimelineItem, TurnTimeline, VisionTimelineItem } from './types'

type DisplayItem = TimelineItem | { id: string; type: 'tool-group'; items: Extract<TimelineItem, { type: 'tool' }>[] }

interface Props {
  timeline: TurnTimeline
  user?: ChatMessage
  now: number
  onResolveApproval: (id: string, decision: string) => void
  onContinue?: () => void
  planActions?: ReactNode
}

const ICONS = {
  image: ImageIcon,
  read: FileText,
  search: FileSearch,
  list: ListTree,
  edit: Pencil,
  test: TestTube2,
  git: GitBranch,
  command: SquareTerminal,
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, ms) / 1000
  return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`
}

function groupAdjacent(items: TimelineItem[]): DisplayItem[] {
  const output: DisplayItem[] = []
  for (const item of items) {
    const category = item.type === 'tool' ? toolCategory(item.tool) : null
    const groupable = category === 'read' || category === 'search' || category === 'list' || category === 'command'
    const previous = output.at(-1)
    if (item.type === 'tool' && groupable && previous?.type === 'tool-group') {
      const last = previous.items.at(-1)!
      if (last.modelCallId === item.modelCallId && toolCategory(last.tool) === category && item.occurredAt - last.occurredAt <= 2000) {
        previous.items.push(item)
        continue
      }
    }
    if (item.type === 'tool' && groupable) {
      const prior = output.at(-1)
      if (prior?.type === 'tool') {
        const priorCategory = toolCategory(prior.tool)
        if (priorCategory === category && prior.modelCallId === item.modelCallId && item.occurredAt - prior.occurredAt <= 2000) {
          output.splice(-1, 1, { id: `group:${prior.id}`, type: 'tool-group', items: [prior, item] })
          continue
        }
      }
    }
    output.push(item)
  }
  return output
}

function ToolGroupRow({ items, onResolveApproval }: { items: Extract<TimelineItem, { type: 'tool' }>[]; onResolveApproval: (id: string, decision: string) => void }) {
  const { lang } = useI18n()
  const category = toolCategory(items[0].tool)
  const Icon = ICONS[category]
  const files = new Set(items.flatMap(item => item.presentation?.file_paths ?? []))
  const fileCount = files.size ? ` · ${files.size} ${lang === 'es' ? 'archivos' : 'files'}` : ''
  const label = lang === 'es'
    ? category === 'read' ? `${items.length} lecturas${fileCount}` : category === 'search' ? `Hizo ${items.length} búsquedas` : category === 'command' ? `Ejecutó ${items.length} comandos` : `Listó archivos ${items.length} veces`
    : category === 'read' ? `${items.length} reads${fileCount}` : category === 'search' ? `Ran ${items.length} searches` : category === 'command' ? `Ran ${items.length} commands` : `Listed files ${items.length} times`
  return (
    <details className="group/activity py-1 text-[13px] text-[var(--text-muted)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50">
        <Icon size={13} className="text-[var(--text-subtle)]" />
        <span>{label}</span>
        <ChevronDown size={12} className="ml-auto transition-transform group-open/activity:rotate-180" />
      </summary>
      <div className="mt-1 space-y-0.5 border-l border-[var(--border)] pl-4">
        {items.map((item) => category === 'command'
          ? <ActivityRow key={item.id} item={item} onResolveApproval={onResolveApproval} />
          : <div key={item.id} className="text-[11px] text-[var(--text-subtle)]">{formatTool(item, lang)}</div>)}
      </div>
    </details>
  )
}

function ActivityRow({ item, onResolveApproval }: { item: Exclude<TimelineItem, { type: 'model' }>; onResolveApproval: (id: string, decision: string) => void }) {
  const { t, lang } = useI18n()
  const peerNavigation = usePeerNavigation()
  const technical = useUIStore((state) => state.showTechnicalActivityNames)
  if (item.type === 'vision' && item.route === 'conversation') return null
  if (item.type === 'vision') return <details className="my-2 rounded-xl border border-[var(--border)] p-3 text-xs">
    <summary className="cursor-pointer">{item.status === 'queued' ? (lang === 'es' ? 'Análisis visual en espera' : 'Visual analysis queued') : item.status === 'preparing' ? (lang === 'es' ? 'Preparando imágenes…' : 'Preparing images…') : item.status === 'partial' ? (lang === 'es' ? 'Análisis visual parcial · límite de salida' : 'Partial visual analysis · output limit') : item.status === 'running' ? (lang === 'es' ? 'Analizando imágenes…' : 'Analyzing images…') : item.status === 'cancelled' ? (lang === 'es' ? 'Análisis visual cancelado' : 'Visual analysis cancelled') : item.status === 'failed' ? (lang === 'es' ? 'Falló el análisis visual' : 'Visual analysis failed') : (lang === 'es' ? 'Análisis visual' : 'Visual analysis')}</summary>
    {technical && <details><summary>{lang === 'es' ? 'Detalles técnicos' : 'Technical details'}</summary><p>{item.providerName} / {item.modelName || item.modelId}</p><p>{item.question}</p>{item.generation && <pre>{JSON.stringify(item.generation, null, 2)}</pre>}</details>}
    <div className="flex flex-wrap gap-2">{item.images.map(image => <ImageActivity key={image.uri} image={image} />)}</div>
    {item.analysis && <p className="whitespace-pre-wrap">{item.analysis}</p>}
    {item.error && <p role="alert" className="text-red-400">{item.error}</p>}
  </details>
  if (item.type === 'tool') {
    const category = toolCategory(item.tool)
    const Icon = ICONS[category]
    const running = item.status === 'requested' || item.status === 'running'
    const failed = item.status === 'failed' || item.status === 'cancelled'
    if (item.presentation?.kind === 'image' && item.presentation.image && item.status === 'completed') {
      return <div className="py-1 text-[13px] text-[var(--text-muted)]">
        <div className="flex items-center gap-2"><ImageIcon size={13} /><span>{formatTool(item, lang)}</span>{item.durationMs !== undefined && <span className="text-[10px] text-[var(--text-subtle)]">{elapsed(item.durationMs)}</span>}</div>
        <ImageActivity key={item.presentation.image.uri} image={item.presentation.image} />
      </div>
    }
    let outputPath: string | undefined = item.status === 'completed' ? item.filePath : undefined
    if (item.status === 'completed' && ['fs.write', 'fs.patch'].includes(item.tool)) {
      try { const args = JSON.parse(item.arguments ?? '{}'); if (typeof args.path === 'string') outputPath = args.path } catch { /* truncated arguments */ }
    }
    return (
      <details className="group/activity py-1 text-[13px] text-[var(--text-muted)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50">
          {running ? <LoaderCircle size={13} className="animate-spin text-[var(--accent-2)] motion-reduce:animate-none" /> : failed ? <CircleAlert size={13} className="text-red-400" /> : <Icon size={13} className="text-[var(--text-subtle)]" />}
          <span>{formatTool(item, lang)}</span>
          {outputPath && <span onClick={e => e.stopPropagation()} className="text-[var(--accent)] underline"><FileLink href={outputPath}>Ver archivo</FileLink></span>}
          {technical && <span className="font-mono text-[10px] text-[var(--text-subtle)]">{item.tool}</span>}
          {item.durationMs !== undefined && <span className="ml-auto text-[10px] tabular-nums text-[var(--text-subtle)]">{elapsed(item.durationMs)}</span>}
          <ChevronDown size={12} className="transition-transform group-open/activity:rotate-180" />
        </summary>
        {item.presentation?.kind === 'command' ? <CommandPresentation presentation={item.presentation} argumentsText={item.arguments} /> : item.presentation?.kind === 'tool' ? <StructuredPresentation presentation={item.presentation} fallback={item.error || item.result || item.arguments} /> : (item.arguments || item.result || item.error) && (
          <pre className="mt-1.5 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg-subtle)] p-2 font-mono text-[11px] text-[var(--text-subtle)]">{item.error || item.result || item.arguments}</pre>
        )}
      </details>
    )
  }
  if (item.type === 'approval') {
    const pending = item.status === 'pending'
    const resolving = item.status === 'resolving'
    const status = item.status === 'allowed' ? (lang === 'es' ? 'Concedido' : 'Allowed') : item.status === 'denied' ? (lang === 'es' ? 'Denegado' : 'Denied') : item.status === 'expired' ? (lang === 'es' ? 'Expirado' : 'Expired') : ''
    return (
      <div className="my-2 border-l-2 border-amber-400/50 py-1 pl-3 text-[13px]">
        <div className="flex items-center gap-2 text-[var(--text)]"><ShieldAlert size={14} className="text-amber-400" />{item.description || item.capability}<span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">{item.risk}</span></div>
        {item.target && <div className="mt-1 font-mono text-[11px] text-[var(--text-subtle)]">{item.capability === 'session.message' && peerNavigation?.labelFor(item.target) ? t('board.peers.approvalTarget', { label: peerNavigation.labelFor(item.target) ?? item.target }) : item.target}</div>}
        {(pending || resolving) ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <ApprovalActions item={item} disabled={resolving} onResolve={onResolveApproval} />
          </div>
        ) : <div className="mt-1 text-[11px] text-[var(--text-muted)]">{status}</div>}
      </div>
    )
  }
  if (item.type === 'agent') return (
    <details className="group/agent my-2 rounded-xl border border-[var(--border)] p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-[var(--text)]">
        {item.status === 'running' ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" /> : <Bot size={15} />}
        <span>{item.agent}</span>
        <span className="text-xs text-[var(--text-muted)]">{item.status === 'running' ? (lang === 'es' ? 'Trabajando' : 'Working') : item.status === 'completed' ? (lang === 'es' ? 'Completado' : 'Completed') : (lang === 'es' ? 'Interrumpido o fallido' : 'Stopped or failed')}</span>
        <span className="ml-auto text-xs">{lang === 'es' ? 'Ver actividad' : 'View activity'}</span><ChevronDown size={13} />
      </summary>
      <div className="mt-3 max-h-[32rem] space-y-2 overflow-auto">
        {item.objective && <p className="text-sm text-[var(--text-muted)]">{item.objective}</p>}
        {(item.cwd || item.profile) && <p className="break-all font-mono text-xs text-[var(--text-subtle)]">{item.profile} · {item.cwd}</p>}
        {(item.items ?? []).map(child => child.type === 'model'
          ? child.content ? <Markdown key={child.id}>{child.content}</Markdown> : null
          : <ActivityRow key={child.id} item={child} onResolveApproval={onResolveApproval} />)}
        {item.summary && !(item.items ?? []).some(child => child.type === 'model' && child.content === item.summary) && <Markdown>{item.summary}</Markdown>}
        {!item.items?.length && !item.summary && <p className="text-xs text-[var(--text-muted)]">{lang === 'es' ? 'Esperando actividad del agente…' : 'Waiting for agent activity…'}</p>}
      </div>
    </details>
  )
  if (item.type === 'changeset') return <ChangeSetRow item={item} turnActive={false} />
  if (item.type === 'question') return <details className="rounded-xl border border-[var(--border)] p-3 text-xs" open={item.request.status === 'pending'}><summary className="cursor-pointer">{item.request.status === 'pending' ? 'Esperando tu respuesta' : item.request.status === 'answered' ? 'Preguntas respondidas' : item.request.status === 'skipped' ? 'Preguntas omitidas' : 'Preguntas expiradas'}</summary><div className="mt-2 space-y-2">{item.request.questions?.map(q => <div key={q.id}><strong>{q.title}</strong>{item.request.answers?.[q.id] && <p className="mt-1 whitespace-pre-wrap">{item.request.answers[q.id]}</p>}</div>)}</div></details>
  if (item.type === 'system') return null
  const labels = item.type === 'context'
      ? (item.status === 'running' ? (lang === 'es' ? 'Compactando contexto automáticamente…' : 'Automatically compacting context…') : item.status === 'failed' ? (lang === 'es' ? 'No se pudo compactar el contexto' : 'Context compaction failed') : item.status === 'cancelled' ? (lang === 'es' ? 'Compactación cancelada' : 'Compaction cancelled') : item.status === 'skipped' ? (lang === 'es' ? 'No fue necesario compactar' : 'Compaction was not needed') : (lang === 'es' ? 'Contexto compactado' : 'Context compacted'))
      : item.type === 'verification'
        ? (item.status === 'running' ? (lang === 'es' ? 'Verificando…' : 'Verifying…') : item.status === 'failed' ? (lang === 'es' ? 'La verificación falló' : 'Verification failed') : (lang === 'es' ? 'Verificación completada' : 'Verification completed'))
        : ''
  if (!labels) return null
  if (item.type === 'context') return <div className="py-1 text-[13px] text-[var(--text-muted)]">
    <div className="flex items-center gap-2">{item.status === 'running' ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}{item.status === 'running' && item.reason === 'manual' ? (lang === 'es' ? 'Compactando contexto…' : 'Compacting context…') : labels}
      {(item.status === 'failed' || item.status === 'cancelled') && item.sessionId && <button className="underline" onClick={() => { void engineApi.contextCompact(item.sessionId!).catch(e => toast.error(commandMessage(e))) }}>{lang === 'es' ? 'Reintentar compactación' : 'Retry compaction'}</button>}
    </div>
    {(item.error || item.contextDetails) && <details className="mt-1"><summary>{lang === 'es' ? 'Detalles' : 'Details'}</summary>{item.error && <p className="whitespace-pre-wrap">{item.error}</p>}<StructuredValue value={item.contextDetails} /></details>}
  </div>
  const Icon = item.type === 'verification' ? Check : Sparkles
  return <div className="flex items-center gap-2 py-1 text-[13px] text-[var(--text-muted)]"><Icon size={13} className="text-[var(--text-subtle)]" />{labels}</div>
}

function StructuredValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
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
    return <span className="text-[var(--text-subtle)]">{Array.isArray(value) ? `[${count} items]` : `{${count} fields}`}</span>
  }
  if (Array.isArray(value)) {
    const visible = value.slice(0, 24)
    return <ul className="space-y-1">
      {visible.map((item, index) => <li key={index} className="flex gap-1.5"><span className="text-[var(--text-subtle)]">•</span><span className="min-w-0"><StructuredValue value={item} depth={depth + 1} /></span></li>)}
      {value.length > visible.length && <li className="text-[var(--text-subtle)]">… {value.length - visible.length} more</li>}
    </ul>
  }
  if (typeof value === 'object') {
    const rows = Object.entries(value as Record<string, unknown>)
    const visible = rows.slice(0, 24)
    return <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-2 gap-y-1">
      {visible.map(([key, item]) => <div key={key} className="contents"><dt className="text-[var(--text-subtle)]">{key}</dt><dd className="min-w-0"><StructuredValue value={item} depth={depth + 1} /></dd></div>)}
      {rows.length > visible.length && <div className="col-span-2 text-[var(--text-subtle)]">… {rows.length - visible.length} more</div>}
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
    {presentation.error?.message && <div className="border-t border-red-400/20 p-2.5 text-red-300">{presentation.error.message}</div>}
    {raw && <details className="border-t border-[var(--border)] px-2.5 py-1.5 text-[10px] text-[var(--text-subtle)]"><summary className="cursor-pointer">JSON</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono">{raw}</pre></details>}
  </div>
}

function CommandPresentation({ presentation, argumentsText }: { presentation: NonNullable<Extract<TimelineItem, { type: 'tool' }>['presentation']>; argumentsText?: string }) {
  const { lang } = useI18n()
  const argv = Array.isArray(presentation.command) ? presentation.command : undefined
  const command = typeof presentation.command === 'string' ? presentation.command : undefined
  const displayCommand = argv ? `argv ${JSON.stringify(argv)}` : command
  const copy = () => {
    if (displayCommand) void navigator.clipboard?.writeText(argv ? JSON.stringify(argv) : displayCommand)
  }
  const exitCode = presentation.exit_code
  const failed = presentation.status === 'failed' || (typeof exitCode === 'number' && exitCode !== 0)
  return <div className="mt-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
    <div className="flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-1.5 text-[10px] text-[var(--text-subtle)]">
      <span className="font-mono">{presentation.cwd ? `${presentation.cwd}` : 'shell'}</span>
      {typeof exitCode === 'number' && <span className={failed ? 'text-red-400' : 'text-emerald-400'}>{lang === 'es' ? `salida ${exitCode}` : `exit ${exitCode}`}</span>}
      {presentation.stderr_warning && <span className="text-amber-300">{lang === 'es' ? 'stderr con código 0' : 'stderr with exit 0'}</span>}
      {presentation.truncated && <span className="text-amber-300">{lang === 'es' ? 'salida visible truncada' : 'visible output truncated'}</span>}
      {presentation.capture_truncated && <span className="text-red-300">{lang === 'es' ? 'captura completa limitada a 50 MiB' : 'full capture limited to 50 MiB'}</span>}
      <button type="button" onClick={copy} disabled={!displayCommand} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"><Copy size={11} />{lang === 'es' ? 'Copiar' : 'Copy'}</button>
    </div>
    {displayCommand && <pre className="overflow-auto whitespace-pre-wrap px-2.5 py-2 font-mono text-[11px] text-[var(--text)]"><span className="text-[var(--accent-2)]">{presentation.cwd?.match(/[A-Za-z]:/) ? 'PS> ' : '$ '}</span>{displayCommand}</pre>}
    {presentation.stdout && <StreamOutput label="stdout" content={presentation.stdout} />}
    {presentation.stderr && <StreamOutput label="stderr" content={presentation.stderr} warning />}
    {!presentation.stdout && !presentation.stderr && <div className="border-t border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--text-subtle)]">{lang === 'es' ? 'Sin salida' : 'No output'}</div>}
    {presentation.error?.message && <div className="border-t border-red-400/20 px-2.5 py-2 text-[11px] text-red-300"><span className="mr-1 font-mono">{presentation.error.code ?? 'error'}:</span>{presentation.error.message}</div>}
    {presentation.artifacts && presentation.artifacts.length > 0 && <div className="border-t border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]"><span className="mr-2 text-[var(--text-subtle)]">{lang === 'es' ? 'Artefactos' : 'Artifacts'}:</span>{presentation.artifacts.map((artifact) => <FileLink key={artifact} href={artifact}><span className="mr-2 underline">{artifact}</span></FileLink>)}</div>}
    {argumentsText && <details className="border-t border-[var(--border)] px-2.5 py-1.5 text-[10px] text-[var(--text-subtle)]"><summary className="cursor-pointer">{lang === 'es' ? 'Detalles técnicos' : 'Technical details'}</summary><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{argumentsText}</pre></details>}
  </div>
}

function StreamOutput({ label, content, warning = false }: { label: string; content: string; warning?: boolean }) {
  const { lang } = useI18n()
  const outputRef = useRef<HTMLPreElement>(null)
  const followingRef = useRef(true)
  const [showJump, setShowJump] = useState(false)

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
    setShowJump(!atBottom)
  }

  function jumpToEnd() {
    const output = outputRef.current
    if (!output) return
    output.scrollTop = output.scrollHeight
    followingRef.current = true
    setShowJump(false)
  }

  return <div className={`relative border-t px-2.5 py-2 ${warning ? 'border-amber-400/20' : 'border-[var(--border)]'}`}>
    <div className={`mb-1 text-[10px] uppercase tracking-wide ${warning ? 'text-amber-300' : 'text-[var(--text-subtle)]'}`}>{label}</div>
    <pre ref={outputRef} onScroll={trackScroll} className={`max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] ${warning ? 'text-amber-100/80' : 'text-[var(--text-muted)]'}`}>{content}</pre>
    {showJump && <button type="button" onClick={jumpToEnd} className="absolute right-4 bottom-3 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-muted)] shadow hover:text-[var(--text)]">{lang === 'es' ? 'Ir al final' : 'Jump to end'}</button>}
  </div>
}

function ApprovalActions({ item, disabled, onResolve }: { item: Extract<TimelineItem, { type: 'approval' }>; disabled: boolean; onResolve: (id: string, decision: string) => void }) {
  const { lang } = useI18n()
  const choices = [
    ['deny', lang === 'es' ? 'Denegar' : 'Deny'],
    ['allow_once', lang === 'es' ? 'Permitir una vez' : 'Allow once'],
    ['allow_session', lang === 'es' ? 'Permitir en este chat' : 'Allow in this chat'],
  ]
  return choices.filter(([decision]) => !item.choices || item.choices.includes(decision)).map(([decision, label]) => <button key={decision} type="button" disabled={disabled} onClick={() => onResolve(item.approvalId, decision)} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--text)] disabled:opacity-50">{label}</button>)
}

function ChangeSetRow({ item, turnActive }: { item: Extract<TimelineItem, { type: 'changeset' }>; turnActive: boolean }) {
  const { lang } = useI18n()
  const [reviewing, setReviewing] = useState(false)
  const [files, setFiles] = useState<TurnChangedFile[]>(item.files)
  const [preview, setPreview] = useState<TurnUndoPreview | null>(null)
  const [working, setWorking] = useState(false)
  if (item.files.length === 0 && item.warnings.length === 0) return null

  async function review() {
    try {
      const result = await engineApi.reviewTurnChanges(item.turnId)
      setFiles(result.files)
    } catch {
      // The event already contains the persisted public diff; keep it available
      // when an older bridge lacks the review command.
      setFiles(item.files)
    }
    setReviewing((open) => !open)
  }

  async function prepareUndo() {
    setWorking(true)
    try {
      setPreview(await engineApi.previewTurnUndo(item.turnId))
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function undo(safeOnly: boolean) {
    setWorking(true)
    try {
      const result = await engineApi.undoTurnChanges(
        item.turnId,
        undefined,
        safeOnly,
      )
      toast.success(lang === 'es'
        ? `Deshacer: ${result.applied.length} archivo(s) restaurado(s)`
        : `Undo: ${result.applied.length} file(s) restored`)
      window.dispatchEvent(new Event('rinari-workspace-refresh'))
      setPreview(null)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setWorking(false)
    }
  }

  const status = item.status === 'undone'
    ? (lang === 'es' ? 'Deshecho' : 'Undone')
    : item.status === 'partially_undone'
      ? (lang === 'es' ? 'Deshecho parcialmente' : 'Partially undone')
      : item.status === 'conflicted'
        ? (lang === 'es' ? 'Con conflictos' : 'Conflicted')
        : null
  return (
    <div className="my-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch size={14} className="text-[var(--accent-2)]" />
        <span className="font-medium text-[var(--text)]">{files.length} {lang === 'es' ? 'archivo(s) de este turno' : 'file(s) from this turn'}</span>
        <span className="font-mono text-[11px] text-emerald-400">+{item.additions}</span>
        <span className="font-mono text-[11px] text-red-400">-{item.deletions}</span>
        {status && <span className="text-[var(--text-subtle)]">· {status}</span>}
      </div>
      {(!item.attributionComplete || item.warnings.length > 0) && (
        <div className="mt-2 flex gap-2 text-amber-300"><ShieldAlert size={13} className="mt-0.5 shrink-0" /><span>{lang === 'es' ? 'La atribución es parcial; algunos cambios no se pueden deshacer con seguridad.' : 'Attribution is partial; some changes cannot be safely undone.'}</span></div>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void review()} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[var(--text-muted)] hover:text-[var(--text)]">{lang === 'es' ? 'Revisar' : 'Review'}</button>
        <button type="button" disabled={working || turnActive || item.status !== 'active' || files.length === 0} onClick={() => void prepareUndo()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40"><RotateCcw size={12} />{lang === 'es' ? 'Deshacer' : 'Undo'}</button>
      </div>
      {reviewing && <div className="mt-3 space-y-2">{files.map((file) => <details key={file.absolute_path} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2"><summary className="cursor-pointer text-[var(--text-muted)]"><span className="mr-2 uppercase text-[10px] text-[var(--text-subtle)]">{file.kind}</span>{file.path}{file.sensitive && <span className="ml-2 text-amber-300">{lang === 'es' ? 'sensible' : 'sensitive'}</span>}</summary>{file.diff != null && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre font-mono text-[11px] text-[var(--text-subtle)]">{file.diff}</pre>}{file.diff == null && <p className="mt-2 text-[var(--text-subtle)]">{lang === 'es' ? 'Contenido no disponible para revisión.' : 'Content unavailable for review.'}</p>}</details>)}</div>}
      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === 'es' ? 'Deshacer cambios de este turno' : 'Undo this turn’s changes'}</AlertDialogTitle>
            <AlertDialogDescription>{preview?.conflicts.length
              ? (lang === 'es' ? `${preview.conflicts.length} ruta(s) cambiaron después del turno. El undo total está bloqueado.` : `${preview.conflicts.length} path(s) changed after the turn. Full undo is blocked.`)
              : (lang === 'es' ? 'Se restaurarán únicamente los archivos atribuidos con seguridad a este turno.' : 'Only files safely attributed to this turn will be restored.')}</AlertDialogDescription>
          </AlertDialogHeader>
          {preview && preview.conflicts.length > 0 && <ul className="max-h-40 overflow-auto text-xs text-amber-300">{preview.conflicts.map((conflict) => <li key={conflict.absolute_path}>{conflict.path} · {conflict.reason}</li>)}</ul>}
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === 'es' ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction disabled={working || (preview?.operations.length ?? 0) === 0} onClick={() => void undo(Boolean(preview?.conflicts.length))}>{preview?.conflicts.length ? (lang === 'es' ? 'Deshacer solo los seguros' : 'Undo safe files only') : (lang === 'es' ? 'Deshacer' : 'Undo')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const visualPending = (item: VisionTimelineItem) => ['queued', 'preparing', 'running'].includes(item.status)

function VisualProgress({ items, status, onResolveApproval }: {
  items: VisionTimelineItem[]; status: TurnTimeline['status']; onResolveApproval: Props['onResolveApproval']
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
    {active && pending.length > 0 && <div role="status" aria-live="polite" className="flex items-center gap-2 py-1 text-[13px] text-[var(--text-muted)]">
      <LoaderCircle size={13} className="animate-spin text-[var(--accent-2)] motion-reduce:animate-none" />
      <span>{status === 'cancelling' ? (es ? 'Cancelando análisis' : 'Cancelling analysis') : (es ? 'Analizando imágenes' : 'Analyzing images')} · {finished} {es ? 'de' : 'of'} {total}</span>
    </div>}
    {issues.length > 0 && <details className="py-1 text-xs text-amber-300">
      <summary className="cursor-pointer">{es ? 'Revisión de imágenes con incidencias' : 'Image review issues'} · {issues.length}</summary>
      <div className="mt-2 space-y-3">{issues.map(item => <div key={item.id}>
        <p>{item.status === 'partial' ? (es ? 'Análisis parcial · límite de salida' : 'Partial analysis · output limit') : item.status === 'cancelled' ? (es ? 'Análisis cancelado' : 'Analysis cancelled') : item.status === 'failed' ? (es ? 'No se pudo analizar la imagen' : 'Image analysis failed') : (es ? 'Análisis interrumpido' : 'Analysis interrupted')}</p>
        <div className="mt-1 flex flex-wrap gap-2">{item.images.map(image => <ImageActivity key={image.uri} image={image} />)}</div>
        {!item.images.length && <p className="text-[var(--text-muted)]">{es ? 'Referencia de imagen no disponible' : 'Image reference unavailable'}</p>}
      </div>)}</div>
    </details>}
    {technical && items.length > 0 && <details className="py-1 text-xs text-[var(--text-subtle)]">
      <summary className="cursor-pointer">{es ? 'Detalles técnicos de visión' : 'Vision technical details'} · {items.length}</summary>
      {items.map(item => <ActivityRow key={item.id} item={item} onResolveApproval={onResolveApproval} />)}
    </details>}
  </>
}

/**
 * Marca visible del bloque final/error de un turno terminado: la lectura
 * automática (§8.6) exige que esté en viewport con la ventana atendida.
 */
function ResultReadSentinel({ turnId, terminal }: { turnId: string; terminal: boolean }) {
  const ref = useResultVisibility(turnId, terminal)
  return <div ref={ref} aria-hidden="true" data-testid="result-read-sentinel" data-turn-id={turnId} className="h-px w-full" />
}

export default function TurnTimelineView({ timeline, user, now, onResolveApproval, planActions }: Props) {
  const { lang } = useI18n()
  const final = [...timeline.items].reverse().find((item) => item.type === 'model' && item.outputKind === 'final' && item.content)
  const changeSets = timeline.items.filter((item) => item.type === 'changeset')
  const visualItems = timeline.items.filter((item): item is VisionTimelineItem => item.type === 'vision' && item.route !== 'conversation')
  const visualRunning = ['running', 'approval', 'cancelling'].includes(timeline.status) && visualItems.some(visualPending)
  const visible = timeline.items.filter((item) => item !== final && item.type !== 'changeset' && item.type !== 'vision' && (item.type !== 'model' || Boolean(item.content)))
  const displayItems = groupAdjacent(visible)
  const significant = visible.filter((item) => item.type !== 'model' && item.type !== 'system')
  const lastActivity = visible.at(-1)?.occurredAt ?? timeline.startedAt
  const actionRunning = visible.some((item) =>
    item.type === 'tool' && (item.status === 'requested' || item.status === 'running') ||
    item.type === 'context' && item.status === 'running' ||
    item.type === 'verification' && item.status === 'running' ||
    item.type === 'agent' && item.status === 'running',
  )
  const initialWait = visible.length === 0 && now - timeline.startedAt >= 300
  const betweenSteps = visible.length > 0 && now - lastActivity >= 1000
  const waiting = !visualRunning && (timeline.status === 'cancelling' || (!actionRunning && (timeline.status === 'running' || timeline.status === 'approval') && (initialWait || betweenSteps)))
  const terminalExceptional = ['failed', 'cancelled', 'stopped'].includes(timeline.status)
  const duration = (timeline.completedAt ?? now) - timeline.startedAt
  const showSummary = Boolean(final) && (significant.length >= 3 || duration >= 10_000 || terminalExceptional)
  const statusLabel = lang === 'es'
    ? ({ completed: 'completado', failed: 'falló', cancelled: 'cancelado', stopped: 'detenido' } as Record<string, string>)[timeline.status] ?? timeline.status
    : timeline.status
  return (
    <div className="space-y-3">
      {user ? <MessageBubble message={user.origin || !timeline.origin ? user : { ...user, origin: timeline.origin }} /> : timeline.userMessage ? <MessageBubble message={{ id: `user-${timeline.turnId}`, role: 'user', content: timeline.userMessage, createdAt: timeline.startedAt, turnId: timeline.turnId, origin: timeline.origin }} /> : null}
      <div className="space-y-1 pl-0.5">
        {displayItems.map((item) => item.type === 'tool-group' ? <ToolGroupRow key={item.id} items={item.items} onResolveApproval={onResolveApproval} /> : item.type === 'model' ? (
          <div key={item.id} className="py-1 text-[13px] leading-relaxed text-[var(--text-muted)]"><Markdown>{item.content}</Markdown></div>
        ) : <ActivityRow key={item.id} item={item} onResolveApproval={onResolveApproval} />)}
        <VisualProgress items={visualItems} status={timeline.status} onResolveApproval={onResolveApproval} />
        {waiting && timeline.status !== 'approval' && !timeline.items.some(item => item.type === 'question' && item.request.status === 'pending') && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 py-1 text-[13px] text-[var(--text-muted)]">
            <LoaderCircle size={13} className="animate-spin text-[var(--accent-2)] motion-reduce:animate-none" />
            <span>{timeline.status === 'cancelling' ? (lang === 'es' ? 'Cancelando…' : 'Cancelling…') : (lang === 'es' ? 'Pensando…' : 'Thinking…')}</span>
            <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">{elapsed(duration)}</span>
          </div>
        )}
        {timeline.status === 'failed' && <div role="alert" className="flex items-center gap-2 py-1 text-[13px] text-red-400"><CircleAlert size={13} />{timeline.error || (lang === 'es' ? 'El turno falló' : 'Turn failed')}</div>}
      </div>
      {final?.type === 'model' && (timeline.mode === 'plan' ? <section aria-label="Plan propuesto" className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ListTree size={16} />Plan propuesto</div><Markdown>{final.content}</Markdown>{planActions}</section> : <MessageBubble message={{ id: final.id, role: 'assistant', content: final.content, createdAt: final.occurredAt, turnId: timeline.turnId }} />)}
      {changeSets.map((item) => <ChangeSetRow key={item.id} item={item} turnActive={['running', 'approval', 'cancelling'].includes(timeline.status)} />)}
      <ResultReadSentinel turnId={timeline.turnId} terminal={['completed', 'failed', 'stopped', 'cancelled'].includes(timeline.status)} />
      {showSummary && <div className="flex items-center gap-2 text-[10px] text-[var(--text-subtle)]"><span>{elapsed(duration)}</span><span>·</span><span>{significant.length} {lang === 'es' ? 'acciones' : 'actions'}</span><span>·</span><span>{statusLabel}</span></div>}
      {timeline.status === 'failed' && timeline.errorDetails?.history_preserved === true && <p className="text-xs text-[var(--text-muted)]">{lang === 'es' ? 'El trabajo previo está conservado. Puedes enviar un nuevo mensaje; las acciones de resultado desconocido requieren comprobar su estado.' : 'Previous work is preserved. You can send a new message; unknown action outcomes require checking their state.'}</p>}
      {timeline.status === 'failed' && timeline.errorDetails && <details className="text-xs text-[var(--text-subtle)]"><summary>{lang === 'es' ? 'Diagnóstico de la interrupción' : 'Interruption diagnostics'}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(Object.fromEntries(Object.entries(timeline.errorDetails).filter(([key]) => key !== 'partial_text')), null, 2)}</pre></details>}
    </div>
  )
}
