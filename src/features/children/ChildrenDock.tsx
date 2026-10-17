import { useEffect, useState } from 'react'
import { ArrowUpRight, CircleCheck, CircleX, GitBranch, GitMerge, LoaderCircle, MessagesSquare, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type ChildSession } from '../../services/engine'
import { useOptionalEngineCommands, useOptionalEngineData } from '../engine/EngineContext'
import { useChildrenStore, visibleChild } from './childrenStore'

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
    if (!window.confirm(t('children.discardConfirm', { branch: child.branch ?? '' }))) return
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

  const StateIcon = working ? LoaderCircle : child.state === 'completed' ? CircleCheck : CircleX
  return (
    <article className="child-card" data-testid="child-card" data-state={child.state} data-child-id={child.child_session_id} data-resolution={child.resolution ?? undefined}>
      <header className="child-card-head">
        <StateIcon size={14} aria-hidden="true" className={working ? 'animate-spin' : undefined} />
        <span className="child-card-title" title={title}>{title}</span>
        <span className="child-card-state">{t(`children.state.${child.state}`)}</span>
        {!working && (
          <button type="button" className="child-card-close" aria-label={t('children.hide')} title={t('children.hide')} onClick={() => hide(child.child_session_id)}>
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </header>
      {child.report?.summary && !working && <p className="child-card-summary">{child.report.summary}</p>}
      {child.report?.error && !working && <p className="child-card-error">{child.report.error}</p>}
      <p className="child-card-meta">
        {child.branch ? <><GitBranch size={11} aria-hidden="true" /> <code>{child.branch}</code></> : <><MessagesSquare size={11} aria-hidden="true" /> {t('children.sameFolder')}</>}
        {files.length > 0 && <span> · {t('children.files', { n: files.length })}</span>}
        {child.resolution && <span> · {t(`children.resolution.${child.resolution}`)}</span>}
      </p>
      {conflicts && (
        <div role="alert" className="child-card-conflicts">
          <p>{t('children.conflicts')}</p>
          <ul>{conflicts.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
          <p>{t('children.conflictsHint')}</p>
        </div>
      )}
      <div className="child-card-actions">
        <button type="button" className="btn btn-quiet btn-sm" onClick={open}>
          {t('children.open')} <ArrowUpRight size={12} aria-hidden="true" />
        </button>
        {decide && (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void integrate()}>
              <GitMerge size={12} aria-hidden="true" /> {t('children.integrate')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void discard()}>
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
    </article>
  )
}
