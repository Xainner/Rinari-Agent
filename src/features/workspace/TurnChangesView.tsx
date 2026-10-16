import { ExternalLink, FileDiff, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { engineApi, type TurnChangedFile } from '../../services/engine'
import { dockNamespaceKey, useSessionDockStore } from '../../stores/sessionDock'
import { useOptionalRuntimeStore } from '../engine/EngineContext'
import type { RuntimeStore } from '../engine/runtimeStore'
import { useSessionTimelines } from '../engine/sessionSelectors'
import { presentedChangeSets } from '../activity/changeSetPresentation'
import { useFileWorkspace } from '../files/FileWorkspace'
import ChangesPanel from './ChangesPanel'
import DiffView from './DiffView'

const KIND_TONE: Record<TurnChangedFile['kind'], string | undefined> = { created: 'success', modified: 'accent', deleted: 'danger', renamed: undefined }

type TurnWithChanges = { turnId: string; startedAt: number; files: TurnChangedFile[] }

/**
 * Vista Cambios del panel lateral (plan 0.4.0 #41). «Este turno» enseña lo
 * que cambió un turno con el diff a color, desde el registro de cambios del
 * turno (funciona sin git); «Todo el repo» es el estado de git del proyecto,
 * y solo se ofrece cuando el proyecto es un repositorio.
 */
export default function TurnChangesView({ sessionId, path }: { sessionId: string; path: string | null }) {
  const runtime = useOptionalRuntimeStore()
  return runtime ? <WithTimelines store={runtime} sessionId={sessionId} path={path} /> : <Body sessionId={sessionId} path={path} turns={[]} />
}

function WithTimelines({ store, sessionId, path }: { store: RuntimeStore; sessionId: string; path: string | null }) {
  const timelines = useSessionTimelines(store, sessionId)
  const turns = useMemo<TurnWithChanges[]>(() => Object.values(timelines)
    .map((timeline) => ({ turnId: timeline.turnId, startedAt: timeline.startedAt, files: presentedChangeSets(timeline).latest?.files ?? [] }))
    .filter((turn) => turn.files.length > 0)
    .sort((a, b) => b.startedAt - a.startedAt), [timelines])
  return <Body sessionId={sessionId} path={path} turns={turns} />
}

function Body({ sessionId, path, turns }: { sessionId: string; path: string | null; turns: TurnWithChanges[] }) {
  const { t, lang } = useI18n()
  const focus = useSessionDockStore((state) => state.changesFocus[dockNamespaceKey(state.homeId, sessionId)])
  const files = useFileWorkspace()
  const [scope, setScope] = useState<'turn' | 'repo'>('turn')
  const [turnId, setTurnId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState<{ turnId: string; files: TurnChangedFile[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [git, setGit] = useState<boolean | null>(null)

  // ¿El proyecto es un repositorio? Solo así se ofrece «Todo el repo».
  useEffect(() => {
    if (!path) { setGit(false); return }
    let alive = true
    engineApi.projectChanges(path).then((result) => { if (alive) setGit(result.available) }).catch(() => { if (alive) setGit(false) })
    return () => { alive = false }
  }, [path])

  // «Revisar» desde una tarjeta: este turno y, si se pidió, ese archivo.
  useEffect(() => {
    if (!focus) return
    setScope('turn')
    setTurnId(focus.turnId)
    setSelected(focus.path ?? null)
  }, [focus])

  const current = turns.find((turn) => turn.turnId === turnId) ?? turns[0] ?? null
  // El diff completo del turno lo da el Engine; el del evento queda de respaldo.
  useEffect(() => {
    if (!current) return
    let alive = true
    setLoading(true)
    engineApi.reviewTurnChanges(current.turnId)
      .then((result) => { if (alive) setReviewed({ turnId: current.turnId, files: result.files }) })
      .catch(() => { if (alive) setReviewed({ turnId: current.turnId, files: current.files }) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [current?.turnId]) // eslint-disable-line react-hooks/exhaustive-deps

  const turnFiles = reviewed && current && reviewed.turnId === current.turnId ? reviewed.files : current?.files ?? []
  const file = turnFiles.find((item) => item.path === selected) ?? turnFiles[0] ?? null
  const clock = (at: number) => new Date(at).toLocaleTimeString(lang === 'es' ? 'es' : 'en', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="changes-view">
      <div className="changes-view-bar">
        {git && (
          <div className="seg-tabs changes-scope" role="radiogroup" aria-label={t('changes.view.scope')}>
            {(['turn', 'repo'] as const).map((option) => (
              <button key={option} type="button" role="radio" aria-checked={scope === option} className="seg-tab" onClick={() => setScope(option)}>
                {scope === option && <span className="seg-tab-pill" aria-hidden="true" />}
                <span className="relative">{t(option === 'turn' ? 'changes.view.turn' : 'changes.view.repo')}</span>
              </button>
            ))}
          </div>
        )}
        {scope === 'turn' && turns.length > 1 && current && (
          <select className="changes-turn-select" aria-label={t('changes.view.pickTurn')} value={current.turnId} onChange={(event) => { setTurnId(event.target.value); setSelected(null) }}>
            {turns.map((turn, index) => (
              <option key={turn.turnId} value={turn.turnId}>
                {index === 0 ? t('changes.view.lastTurn', { time: clock(turn.startedAt) }) : t('changes.view.turnAt', { time: clock(turn.startedAt) })}
              </option>
            ))}
          </select>
        )}
      </div>
      {scope === 'repo' && path ? (
        <div className="changes-view-repo"><ChangesPanel key={path} path={path} onFiles={() => {}} /></div>
      ) : !current ? (
        <p className="changes-view-empty"><FileDiff size={16} aria-hidden="true" /> {t('changes.view.none')}</p>
      ) : (
        <>
          <ul className="changes-view-files" aria-label={t('changes.view.files')}>
            {turnFiles.map((item) => (
              <li key={item.absolute_path}>
                <button type="button" className="turn-changes-file" aria-current={item.path === file?.path || undefined} onClick={() => setSelected(item.path)}>
                  <span className="r-chip turn-changes-kind" data-tone={KIND_TONE[item.kind]}>{t(`changes.kind.${item.kind}`)}</span>
                  <span className="turn-changes-path">{item.path}</span>
                  <span className="turn-changes-file-stat">
                    {typeof item.additions === 'number' && <span className="is-add">+{item.additions}</span>}
                    {typeof item.deletions === 'number' && <span className="is-del">−{item.deletions}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {file && (
            <div className="changes-view-diff" data-testid="turn-diff" data-path={file.path}>
              <div className="changes-view-diff-head">
                <span className="changes-view-diff-path" title={file.absolute_path}>{file.path}</span>
                {loading && <LoaderCircle size={12} className="r-spin" aria-hidden="true" />}
                {files && file.kind !== 'deleted' && (
                  <button type="button" className="btn btn-quiet btn-xs" onClick={() => files.open(file.absolute_path, current.turnId)}>
                    <ExternalLink size={12} aria-hidden="true" /> {t('changes.view.openFile')}
                  </button>
                )}
              </div>
              {file.binary
                ? <p className="changes-view-note">{t('workspace.diffBinary')}</p>
                : file.diff != null
                  ? <DiffView diff={file.diff} truncated={file.diff_truncated} />
                  : <p className="changes-view-note">{t('changes.view.unavailable')}</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
