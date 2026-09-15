import { useEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowLeft, Copy, ExternalLink, MessageSquarePlus, Pin, PinOff, Square, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { copyText } from '../../lib/clipboard'
import {
  deriveStatusKey,
  exitReasonLabelKey,
  isExternalPreview,
  isFailureStatus,
  kindLabel,
  readinessLabelKey,
  resourceTitle,
  type ConnectionFreshness,
  type ProcessPresentation,
  type StopOperation,
} from './processesModel'
import { isHttpUrl } from './ProcessRow'
import ProcessLogView from './ProcessLogView'
import ProcessQueryDialog from './ProcessQueryDialog'
import type { ProcessOutput } from '../../types/protocol.generated'

type Filter = 'active' | 'attention' | 'finished' | 'external' | 'all'

export type ProcessInspectorFilter = Filter

const FILTERS: Filter[] = ['active', 'attention', 'finished', 'external', 'all']

function filterKey(filter: Filter): 'processes.filterActive' | 'processes.filterAttention' | 'processes.filterFinished' | 'processes.filterExternal' | 'processes.filterAll' {
  switch (filter) {
    case 'active':
      return 'processes.filterActive'
    case 'attention':
      return 'processes.filterAttention'
    case 'finished':
      return 'processes.filterFinished'
    case 'external':
      return 'processes.filterExternal'
    case 'all':
      return 'processes.filterAll'
  }
}

function matches(presentation: ProcessPresentation, filter: Filter): boolean {
  const { resource } = presentation
  switch (filter) {
    case 'active':
      return resource.running
    case 'attention':
      return isFailureStatus(resource, false) && !presentation.attentionAcknowledged
    case 'finished':
      return !resource.running && !isExternalPreview(resource)
    case 'external':
      return isExternalPreview(resource)
    case 'all':
      return true
  }
}

/**
 * Inspector inline único por conversación: lista filtrable + detalle con
 * salida snapshot. Crece hacia arriba en el flujo, nunca tapa el composer.
 */
export default function ProcessInspector({
  sessionId,
  ordered,
  defaultFilter = 'all',
  selectedId,
  selectedOutput,
  selectedMissing,
  readError,
  stopById,
  listTruncated,
  freshness,
  listError,
  pinnedId,
  online,
  confirmedIds,
  logPaused,
  onLogPausedChange,
  onSelect,
  onStopRequest,
  onAcknowledge,
  onDismiss,
  onPin,
  onRefresh,
  onClose,
}: {
  sessionId: string
  ordered: ProcessPresentation[]
  defaultFilter?: Filter
  selectedId: string | null
  selectedOutput: ProcessOutput | null
  selectedMissing: boolean
  readError: string | null
  stopById: Map<string, StopOperation>
  listTruncated: boolean
  freshness: ConnectionFreshness
  listError: string | null
  pinnedId: string | null
  online: boolean
  confirmedIds: ReadonlySet<string>
  logPaused: boolean
  onLogPausedChange: (paused: boolean) => void
  onSelect: (id: string | null) => void
  onStopRequest: (id: string) => void
  onAcknowledge: (id: string) => void
  onDismiss: (id: string) => void
  onPin: (id: string | null) => void
  onRefresh: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<Filter>(defaultFilter)
  const [narrow, setNarrow] = useState(false)
  const [detailOnly, setDetailOnly] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setNarrow(width < 720)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!narrow) setDetailOnly(false)
  }, [narrow])

  const visible = ordered.filter((item) => matches(item, filter))
  const selected = ordered.find((item) => item.resource.id === selectedId) ?? null
  const showDetail = selectedId != null

  function choose(id: string) {
    onSelect(id)
    if (narrow) {
      setDetailOnly(true)
    } else {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'nearest' }))
    }
  }

  return (
    <section
      ref={rootRef}
      aria-label={t('processes.section')}
      data-testid="processes-inspector"
      className={`processes-inspector${narrow ? ' narrow' : ''}`}
    >
      <div className="processes-inspector-bar" role="tablist" aria-label={t('processes.section')}>
        {FILTERS.map((item) => (
          <button
            key={item}
            role="tab"
            type="button"
            aria-selected={filter === item}
            onClick={() => setFilter(item)}
            className={`processes-filter${filter === item ? ' active' : ''}`}
          >
            {t(filterKey(item))}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('processes.closeInspector')}
          className="processes-inspector-close"
        >
          <X size={15} />
        </button>
      </div>

      {(!narrow || !detailOnly) && (
        <div className="processes-inspector-list">
          {visible.length === 0 ? (
            freshness === 'loading' ? (
              <p role="status" className="processes-empty">{t('processes.loading')}</p>
            ) : listError ? (
              <div className="processes-empty">
                <p role="alert" className="processes-error">{listError}</p>
                <button type="button" onClick={onRefresh} className="processes-link">
                  {t('processes.retry')}
                </button>
              </div>
            ) : (
              <p className="processes-empty">{ordered.length === 0 ? t('processes.empty') : t('processes.noResults')}</p>
            )
          ) : (
            <ul>
              {visible.map((item) => {
                const id = item.resource.id
                const active = id === selectedId
                const itemStatus = deriveStatusKey(item.resource, {
                  online,
                  stopConfirmed: confirmedIds.has(id),
                })
                return (
                  <li key={id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => choose(id)}
                      className={`processes-pick${active ? ' active' : ''}`}
                    >
                      <span className="processes-row-name" title={item.resource.command}>
                        {resourceTitle(item.resource)}
                      </span>
                      <span className="processes-row-meta">
                        {itemStatus === 'running'
                          ? t('processes.running')
                          : itemStatus === 'finished_ok'
                            ? t('processes.finishedOk')
                            : itemStatus === 'finished_error'
                              ? t('processes.finishedError', { code: item.resource.exit_code ?? 0 })
                              : itemStatus === 'stop_confirmed'
                                ? t('processes.stopConfirmed')
                                : itemStatus === 'unverified'
                                  ? t('processes.unverified')
                                  : t('processes.external')}
                        {pinnedId === id && ` · ${t('processes.pinned')}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {listTruncated && <p className="processes-partial">{t('processes.partialList', { n: ordered.length })}</p>}
        </div>
      )}

      {showDetail && (!narrow || detailOnly) && (
        <div ref={detailRef} className="processes-detail">
          {narrow && (
            <button type="button" onClick={() => setDetailOnly(false)} className="processes-back">
              <ArrowLeft size={13} />
              {t('processes.backToList')}
            </button>
          )}
          {selectedMissing || !selected ? (
            <p role="alert" className="processes-empty">
              {t('processes.unavailable')}
            </p>
          ) : (
            <ProcessDetail
              sessionId={sessionId}
              presentation={selected}
              output={selectedOutput}
              readError={readError}
              stopState={stopById.get(selected.resource.id) ?? { state: 'idle' }}
              pinned={pinnedId === selected.resource.id}
              online={online}
              stopConfirmed={confirmedIds.has(selected.resource.id)}
              logPaused={logPaused}
              onLogPausedChange={onLogPausedChange}
              onStopRequest={() => onStopRequest(selected.resource.id)}
              onAcknowledge={() => onAcknowledge(selected.resource.id)}
              onDismiss={() => onDismiss(selected.resource.id)}
              onPin={() => onPin(pinnedId === selected.resource.id ? null : selected.resource.id)}
            />
          )}
        </div>
      )}
    </section>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <span className="processes-copy-wrap">
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => {
          setFailed(false)
          void copyText(text).then((ok) => {
            if (ok) {
              setDone(true)
              window.setTimeout(() => setDone(false), 2000)
            } else {
              setFailed(true)
            }
          })
        }}
        className="processes-action"
      >
        <Copy size={13} />
        {done ? t('processes.copied') : label}
      </button>
      {failed && (
        <span role="alert" className="processes-error">
          {t('processes.logCopyFailed')}
        </span>
      )}
    </span>
  )
}

function ProcessDetail({
  sessionId,
  presentation,
  output,
  readError,
  stopState,
  pinned,
  online,
  stopConfirmed,
  logPaused,
  onLogPausedChange,
  onStopRequest,
  onAcknowledge,
  onDismiss,
  onPin,
}: {
  sessionId: string
  presentation: ProcessPresentation
  output: ProcessOutput | null
  readError: string | null
  stopState: StopOperation
  pinned: boolean
  online: boolean
  stopConfirmed: boolean
  logPaused: boolean
  onLogPausedChange: (paused: boolean) => void
  onStopRequest: () => void
  onAcknowledge: () => void
  onDismiss: () => void
  onPin: () => void
}) {
  const { t } = useI18n()
  const [showTech, setShowTech] = useState(false)
  const [queryOpen, setQueryOpen] = useState(false)
  const [urlError, setUrlError] = useState('')
  const { resource } = presentation
  const name = resourceTitle(resource)
  const statusKey = deriveStatusKey(resource, { online, stopConfirmed })
  const stopping = stopState.state === 'requesting' || stopState.state === 'reconciling'
  const failure = isFailureStatus(resource, false) && !presentation.attentionAcknowledged
  const canDismiss = !resource.running && !presentation.dismissedFromStrip && !failure
  const validUrl = typeof resource.url === 'string' && isHttpUrl(resource.url) ? resource.url : null

  return (
    <div>
      <div className="processes-detail-head">
        <strong className="processes-row-name" title={resource.command}>
          {name}
        </strong>
        <span className="processes-row-meta">
          {kindLabel(resource.kind)}
          {resource.pid != null && ` · PID ${resource.pid}`}
          {statusKey === 'running' && ` · ${t('processes.running')}`}
          {statusKey === 'stop_confirmed' && ` · ${t('processes.stopConfirmed')}`}
          {statusKey === 'unverified' && ` · ${t('processes.unverified')}`}
        </span>
        <span className="processes-detail-actions">
          <button type="button" onClick={onPin} aria-pressed={pinned} title={t(pinned ? 'processes.unpin' : 'processes.pin')} className="processes-action">
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          {resource.can_stop && (
            <button
              type="button"
              disabled={stopping}
              onClick={onStopRequest}
              aria-label={t('processes.stop', { name })}
              className="processes-action processes-action-stop"
            >
              <Square size={11} />
              {stopping ? t('processes.stopping') : t('processes.stopShort')}
            </button>
          )}
        </span>
      </div>
      {(stopState.state === 'failed' || stopState.state === 'uncertain') && (
        <p role="alert" className="processes-error">
          {stopState.state === 'failed' ? t('processes.stillActive') : t('processes.stopUncertain')}
          {stopState.message ? ` · ${stopState.message}` : ''}
        </p>
      )}
      <dl className="processes-meta">
        <div>
          <dt>{t('processes.command')}</dt>
          <dd className="processes-mono">{resource.command}</dd>
        </div>
        <div>
          <dt>{t('processes.workdir')}</dt>
          <dd className="processes-mono">{resource.cwd}</dd>
        </div>
        {validUrl && (
          <div>
            <dt>URL</dt>
            <dd>
              <button
                type="button"
                onClick={() => {
                  setUrlError('')
                  void openUrl(validUrl).catch((reason: unknown) =>
                    setUrlError(reason instanceof Error ? reason.message : String(reason)),
                  )
                }}
                className="processes-link"
              >
                <ExternalLink size={12} /> {validUrl}
              </button>
              {urlError && (
                <p role="alert" className="processes-error">
                  {urlError}
                </p>
              )}
            </dd>
          </div>
        )}
      </dl>
      <div className="processes-detail-tools">
        <CopyButton text={resource.command} label={t('processes.copyCommand')} />
        <CopyButton text={resource.cwd} label={t('processes.copyPath')} />
        <button type="button" onClick={() => setShowTech((value) => !value)} aria-expanded={showTech} className="processes-action">
          {t('processes.techDetails')}
        </button>
        <button type="button" onClick={() => setQueryOpen(true)} className="processes-action">
          <MessageSquarePlus size={13} />
          {t('processes.askAbout')}
        </button>
      </div>
      {showTech && (
        <dl className="processes-meta processes-tech">
          <div>
            <dt>ID</dt>
            <dd className="processes-mono">{resource.id}</dd>
          </div>
          {resource.pid != null && (
            <div>
              <dt>PID</dt>
              <dd className="processes-mono">{resource.pid}</dd>
            </div>
          )}
          {(() => {
            const exitKey = exitReasonLabelKey(resource.exit_reason)
            const readyKey = readinessLabelKey(resource.readiness)
            if (exitKey == null && readyKey == null && resource.ended_at == null) return null
            return (
              <>
                {exitKey != null && (
                  <div>
                    <dt>{t('processes.techExit')}</dt>
                    <dd>{t(exitKey)}</dd>
                  </div>
                )}
                {resource.ended_at != null && (
                  <div>
                    <dt>{t('processes.techEndedAt')}</dt>
                    <dd className="processes-mono">
                      {new Date(resource.ended_at * 1000).toLocaleString()}
                    </dd>
                  </div>
                )}
                {readyKey != null && (
                  <div>
                    <dt>{t('processes.techReadiness')}</dt>
                    <dd>{t(readyKey)}</dd>
                  </div>
                )}
              </>
            )
          })()}
        </dl>
      )}
      {!resource.can_stop && resource.running && <p className="processes-note">{t('processes.cannotStop')}</p>}
      {failure && (
        <button type="button" onClick={onAcknowledge} className="processes-link">
          {t('processes.acknowledge')}
        </button>
      )}
      {canDismiss && (
        <button type="button" onClick={onDismiss} className="processes-link">
          {t('processes.dismiss')}
        </button>
      )}
      {readError && (
        <p role="alert" className="processes-error">
          {readError}
        </p>
      )}
      {readError == null && <ProcessLogView output={output} paused={logPaused} onPausedChange={onLogPausedChange} />}
      {queryOpen && (
        <ProcessQueryDialog
          sessionId={sessionId}
          resource={resource}
          output={output}
          open={queryOpen}
          onClose={() => setQueryOpen(false)}
        />
      )}
    </div>
  )
}
