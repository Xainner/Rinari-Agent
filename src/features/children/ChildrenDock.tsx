import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, FileText, Folder, GitBranch, GitMerge, Hand, LoaderCircle, Trash2, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type ChildSession } from '../../services/engine'
import { useOptionalEngineCommands, useOptionalEngineData } from '../engine/EngineContext'
import { useChildrenStore, visibleChild } from './childrenStore'
import { useConfirm } from '../../components/ui/useConfirm'
import { bornAt } from '../projects/workspaceModel'

/** Una hija nacida hace menos de esto entra con movimiento; las que ya estaban, quietas. */
const FRESH_MS = 15_000

const EMPTY: ChildSession[] = []

/**
 * The child sessions this conversation opened (plan-sesiones-hijas 5.3 and
 * 5.5), above the composer: one card each while it works, then its report
 * with «Abrir» and, when it worked on its own branch, «Integrar rama» and
 * «Descartar». Merging is always the owner's button.
 */
export function ChildrenDock({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const children = useChildrenStore((state) => state.byParent[sessionId] ?? EMPTY)
  const loaded = useChildrenStore((state) => state.loaded[sessionId])
  const hidden = useChildrenStore((state) => state.hidden)
  const setChildren = useChildrenStore((state) => state.setChildren)

  useEffect(() => {
    if (!sessionId || loaded) return
    let cancelled = false
    engineApi.sessionChildrenList(sessionId)
      .then((result) => { if (!cancelled) setChildren(sessionId, result.children) })
      .catch(() => { if (!cancelled) setChildren(sessionId, []) })
    return () => { cancelled = true }
  }, [sessionId, loaded, setChildren])

  const shown = children.filter((child) => visibleChild(child, hidden))
  if (shown.length === 0) return null
  return (
    <section className="children-dock" data-testid="children-dock" aria-label={t('children.title')}>
      {shown.map((child) => <ChildCard key={child.child_session_id} child={child} />)}
    </section>
  )
}

function ChildCard({ child }: { child: ChildSession }) {
  const { t } = useI18n()
  const commands = useOptionalEngineCommands()
  const data = useOptionalEngineData()
  const hide = useChildrenStore((state) => state.hide)
  const upsert = useChildrenStore((state) => state.upsert)
  const [busy, setBusy] = useState(false)
  const [conflicts, setConflicts] = useState<string[] | null>(null)
  const title = data?.sessionsById[child.child_session_id]?.title || child.title || t('children.untitled')
  const working = child.state === 'working' || child.state === 'waiting'
  const files = child.report?.files ?? []
  const decide = Boolean(child.branch) && !child.resolution && !working
  const open = () => { void commands?.selectSession(child.child_session_id) }
  const confirm = useConfirm()
  // Entra solo la que acaba de nacer; al volver a la madre, las tarjetas aparecen quietas.
  const [entering] = useState(() => {
    const born = bornAt(child.child_session_id)
    return born !== null && Date.now() - born < FRESH_MS
  })
  // El check se dibuja si esta tarjeta la vio pasar de trabajando a terminada.
  const previous = useRef(child.state)
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    const was = previous.current
    previous.current = child.state
    if ((was === 'working' || was === 'waiting') && child.state === 'completed') setCelebrate(true)
  }, [child.state])

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

  const tone = working ? (child.state === 'waiting' ? 'warning' : 'accent') : child.state === 'completed' ? 'success' : child.state === 'failed' ? 'danger' : undefined
  return (
    <article
      className="child-card"
      data-testid="child-card"
      data-state={child.state}
      data-child-id={child.child_session_id}
      data-resolution={child.resolution ?? undefined}
      data-entering={entering || undefined}
    >
      <header className="child-card-head">
        <span className="child-card-tile" data-state={child.state} aria-hidden="true">
          {child.state === 'working'
            ? <span className="child-card-spin" />
            : child.state === 'waiting'
              ? <Hand size={13} />
              : child.state === 'completed'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={celebrate ? 'r-check' : undefined}><path d="M5 12.5l4.2 4.2L19 7" /></svg>
                : <X size={13} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="child-card-kicker">{t('children.untitled')}</p>
          <p className="child-card-title" title={title}>{title}</p>
        </div>
        <span className="r-chip child-card-state" data-tone={tone}>{t(`children.state.${child.state}`)}</span>
        {!working && (
          <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label={t('children.hide')} title={t('children.hide')} onClick={() => hide(child.child_session_id)}>
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </header>
      {child.report?.summary && !working && <p className="child-card-summary">{child.report.summary}</p>}
      {child.report?.error && !working && <p className="child-card-error">{child.report.error}</p>}
      <p className="child-card-meta">
        {child.branch
          ? <span className="child-card-chip is-branch" title={child.worktree_path ?? undefined}><GitBranch size={11} aria-hidden="true" /><code>{child.branch}</code></span>
          : <span className="child-card-chip"><Folder size={11} aria-hidden="true" />{t('children.sameFolder')}</span>}
        {files.length > 0 && <span className="child-card-chip" title={files.join('\n')}><FileText size={11} aria-hidden="true" />{t('children.files', { n: files.length })}</span>}
        {child.resolution && <span className="r-chip" data-tone={child.resolution === 'integrated' ? 'success' : undefined}>{t(`children.resolution.${child.resolution}`)}</span>}
      </p>
      {conflicts && (
        <div role="alert" className="child-card-conflicts">
          <p className="child-card-conflicts-title"><TriangleAlert size={12} aria-hidden="true" /> {t('children.conflicts')}</p>
          <ul>{conflicts.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
          <p className="child-card-conflicts-hint">{t('children.conflictsHint')}</p>
        </div>
      )}
      <div className="child-card-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={open}>
          {t('children.open')} <ArrowUpRight size={12} aria-hidden="true" />
        </button>
        {decide && (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void integrate()}>
              {busy ? <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <GitMerge size={12} aria-hidden="true" />} {t('children.integrate')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm child-card-discard" disabled={busy} onClick={() => void discard()}>
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
      {confirm.dialog}
    </article>
  )
}
