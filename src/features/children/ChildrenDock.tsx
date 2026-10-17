import { useEffect, useState } from 'react'
import { ArrowUpRight, ChevronDown, FileText, GitBranch, GitBranchPlus, GitMerge, Hand, LoaderCircle, Trash2, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type ChildSession } from '../../services/engine'
import { useOptionalEngineCommands, useOptionalEngineData } from '../engine/EngineContext'
import { useChildrenStore } from './childrenStore'
import { useConfirm } from '../../components/ui/useConfirm'
import { bornAt } from '../projects/workspaceModel'
import { cn } from '../../lib/utils'

/** Una hija nacida hace menos de esto entra con movimiento; las que ya estaban, quietas. */
const FRESH_MS = 15_000

const EMPTY: ChildSession[] = []

/**
 * The child sessions this conversation opened (plan-sesiones-hijas 5.5),
 * loaded the first time the mother is shown and kept current by
 * `session.child.updated`. The chat places each one where it was opened.
 */
export function useSessionChildren(sessionId: string): ChildSession[] {
  const children = useChildrenStore((state) => state.byParent[sessionId] ?? EMPTY)
  const loaded = useChildrenStore((state) => state.loaded[sessionId])
  const setChildren = useChildrenStore((state) => state.setChildren)
  useEffect(() => {
    if (!sessionId || loaded) return
    let cancelled = false
    engineApi.sessionChildrenList(sessionId)
      .then((result) => { if (!cancelled) setChildren(sessionId, result.children) })
      .catch(() => { if (!cancelled) setChildren(sessionId, []) })
    return () => { cancelled = true }
  }, [sessionId, loaded, setChildren])
  return children
}

/**
 * One child in the mother's chat, like a session row: its title and state,
 * «Abrir», and its report under it once it answers. When it worked on its
 * own branch, «Integrar rama» and «Descartar» (merging is always the
 * owner's button).
 */
/**
 * The child is not a row in the mother's chat (the owner finds it in the
 * sidebar and hears its report from the mother). Only a child that worked on
 * its own branch waits here, above the composer, for «Integrar rama» or
 * «Descartar»: merging is always the owner's button.
 */
export function ChildDecisions({ sessionId }: { sessionId: string }) {
  const children = useSessionChildren(sessionId)
  const pending = children.filter((child) => child.branch && !child.resolution && child.state !== 'working' && child.state !== 'waiting')
  if (pending.length === 0) return null
  return (
    <section className="children-dock" data-testid="children-dock">
      {pending.map((child) => <ChildRow key={child.child_session_id} child={child} />)}
    </section>
  )
}

export function ChildRow({ child }: { child: ChildSession }) {
  const { t } = useI18n()
  const commands = useOptionalEngineCommands()
  const data = useOptionalEngineData()
  const upsert = useChildrenStore((state) => state.upsert)
  const [busy, setBusy] = useState(false)
  const [conflicts, setConflicts] = useState<string[] | null>(null)
  const title = data?.sessionsById[child.child_session_id]?.title || child.title || t('children.untitled')
  const working = child.state === 'working' || child.state === 'waiting'
  const files = child.report?.files ?? []
  const decide = Boolean(child.branch) && !child.resolution && !working
  const open = () => { void commands?.selectSession(child.child_session_id) }
  const confirm = useConfirm()
  // Entra solo la que acaba de nacer; al volver a la madre, las filas aparecen quietas.
  const [entering] = useState(() => {
    const born = bornAt(child.child_session_id)
    return born !== null && Date.now() - born < FRESH_MS
  })
  const [expanded, setExpanded] = useState(false)

  const integrate = async () => {
    setBusy(true)
    setConflicts(null)
    try {
      const result = await engineApi.sessionChildIntegrate(child.child_session_id)
      if (result.integrated) {
        upsert({ ...child, resolution: 'integrated' })
        toast.success(t('children.integrated', { title }))
      } else {
        setConflicts(result.conflicts.length ? result.conflicts : [result.message ?? ''])
      }
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const discard = async () => {
    const sure = await confirm.ask({
      title: t('children.discardTitle'),
      body: t('children.discardConfirm', { branch: child.branch ?? '' }),
      confirmLabel: t('children.discard'),
      cancelLabel: t('common.cancel'),
    })
    if (!sure) return
    setBusy(true)
    try {
      await engineApi.sessionChildDiscard(child.child_session_id)
      upsert({ ...child, resolution: 'discarded' })
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const sameFolder = async () => {
    try {
      await engineApi.sessionChildrenIsolation(child.parent_session_id, 'same')
      toast(t('children.sameFolderSet'))
    } catch (error) {
      toast.error(commandMessage(error))
    }
  }

  const summary = !working ? child.report?.summary : undefined
  const fullText = child.report?.text ?? summary ?? ''
  const long = fullText.length > (summary?.length ?? 0) || fullText.length > 140
  return (
    <article
      className="child-row"
      data-testid="child-card"
      data-state={child.state}
      data-child-id={child.child_session_id}
      data-resolution={child.resolution ?? undefined}
      data-entering={entering || undefined}
    >
      <div className="child-row-head">
        <span className="act-tile child-row-icon" data-state={child.state === 'working' ? 'running' : child.state === 'waiting' ? 'warn' : child.state === 'failed' ? 'failed' : undefined} aria-hidden="true">
          {child.state === 'working'
            ? <span className="child-row-spin" />
            : child.state === 'waiting'
              ? <Hand size={13} />
              : child.state === 'failed'
                ? <X size={13} />
                : <GitBranchPlus size={13} />}
        </span>
        <button type="button" className="child-row-title" onClick={open} title={t('children.open')}>
          <span className="child-row-name">{title}</span>
          <span className={cn('child-row-state', working && 'activity-text-shimmer')}>{t(`children.state.${child.state}`)}</span>
        </button>
        {child.branch && <span className="child-chip is-branch" title={child.worktree_path ?? undefined}><GitBranch size={11} aria-hidden="true" /><code>{child.branch}</code></span>}
        {files.length > 0 && <span className="child-chip" title={files.join('\n')}><FileText size={11} aria-hidden="true" />{t('children.files', { n: files.length })}</span>}
        {child.resolution && <span className="r-chip" data-tone={child.resolution === 'integrated' ? 'success' : undefined}>{t(`children.resolution.${child.resolution}`)}</span>}
        <button type="button" className="btn btn-quiet btn-xs child-row-open" onClick={open}>
          {t('children.open')} <ArrowUpRight size={12} aria-hidden="true" />
        </button>
      </div>
      {summary && (
        <div className="child-row-report">
          <p className={`child-row-summary${expanded ? ' is-expanded' : ''}`}>{expanded ? fullText : summary}</p>
          {long && (
            <button type="button" className="child-row-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? t('followups.less') : t('followups.readAll')} <ChevronDown size={11} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {child.report?.error && !working && <p className="child-row-error">{child.report.error}</p>}
      {conflicts && (
        <div role="alert" className="child-row-conflicts">
          <p className="child-row-conflicts-title"><TriangleAlert size={12} aria-hidden="true" /> {t('children.conflicts')}</p>
          <ul>{conflicts.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
          <p className="child-row-conflicts-hint">{t('children.conflictsHint')}</p>
        </div>
      )}
      {(decide || (working && child.branch)) && (
        <div className="child-row-actions">
          {decide && (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void integrate()}>
                {busy ? <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <GitMerge size={12} aria-hidden="true" />} {t('children.integrate')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm child-row-discard" disabled={busy} onClick={() => void discard()}>
                <Trash2 size={12} aria-hidden="true" /> {t('children.discard')}
              </button>
            </>
          )}
          {working && child.branch && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void sameFolder()} title={t('children.sameFolderHint')}>
              {t('children.useSameFolder')}
            </button>
          )}
        </div>
      )}
      {confirm.dialog}
    </article>
  )
}
