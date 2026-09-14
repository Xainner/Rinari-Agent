import { useEffect, useRef, useState, type Ref, type SyntheticEvent } from 'react'
import { useI18n } from '../../i18n'
import { useSessionProcesses } from './useSessionProcesses'
import ProcessRow from './ProcessRow'
import ProcessInspector, { type ProcessInspectorFilter } from './ProcessInspector'
import {
  isExternalPreview,
  isFailureStatus,
  summarizeStrip,
  type ProcessPresentation,
} from './processesModel'

const RECENT_SUCCESS_MS = 12_000

/**
 * Franja contextual + inspector inline encima del composer.
 * Sin actividad relevante no reserva espacio. Ocultar no detiene.
 */
export default function ProcessesDock({
  sessionId,
  openSignal,
}: {
  sessionId: string
  openSignal: number
}) {
  const { t } = useI18n()
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [inspectorKey, setInspectorKey] = useState(0)
  const [defaultFilter, setDefaultFilter] = useState<ProcessInspectorFilter>('all')
  const openerRef = useRef<HTMLElement | null>(null)
  const hiddenMsRef = useRef(0)
  const hiddenSinceRef = useRef<number | null>(null)
  const firstSignalRef = useRef(true)

  const snap = useSessionProcesses(sessionId, { observeOutput: inspectorOpen })
  const {
    ordered,
    selectedId,
    pinnedId,
    selectedOutput,
    selectedMissing,
    listError,
    readError,
    stopById,
    listTruncated,
    freshness,
  } = snap

  // Apertura explícita desde la paleta (funciona incluso sin franja visible).
  useEffect(() => {
    if (firstSignalRef.current) {
      firstSignalRef.current = false
      return
    }
    openInspector('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  // Reloj local de 1 Hz sólo mientras haya tiempos o recientes visibles.
  const needsClock =
    ordered.some(
      (item) =>
        (item.resource.running && typeof item.resource.started_at === 'number') ||
        item.completionObservedAt != null,
    ) && !document.hidden
  useEffect(() => {
    if (!needsClock) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [needsClock])

  // El tiempo oculto no cuenta para el retiro de éxitos recientes.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now()
      } else if (hiddenSinceRef.current != null) {
        hiddenMsRef.current += Date.now() - hiddenSinceRef.current
        hiddenSinceRef.current = null
        setNow(Date.now())
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (!sessionId) return null

  const attention = ordered.filter(
    (item) => isFailureStatus(item.resource, false) && !item.attentionAcknowledged,
  )
  const relevant = ordered.filter((item) => {
    if (item.dismissedFromStrip) return false
    if (item.resource.running) return true
    if (isExternalPreview(item.resource)) return true
    if (item.completionObservedAt == null) return false
    if (item.resource.id === selectedId && inspectorOpen) return true
    if (hoveredId === item.resource.id || focusedId === item.resource.id) return true
    return now - item.completionObservedAt - hiddenMsRef.current < RECENT_SUCCESS_MS
  })
  const summary = summarizeStrip(relevant, { listTruncated })
  const activeCount = ordered.filter((item) => item.resource.running).length
  const hasStrip = summary.visible.length > 0 || attention.length > 0

  if (!hasStrip && !inspectorOpen) return null
  if ((freshness === 'unsupported' || freshness === 'offline') && !inspectorOpen) return null

  function rememberOpener(element?: HTMLElement | null) {
    const target = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    if (target && document.contains(target)) openerRef.current = target
  }

  function closeInspector() {
    setInspectorOpen(false)
    const opener = openerRef.current
    if (opener && document.contains(opener)) opener.focus()
  }

  function openInspector(filter?: ProcessInspectorFilter, selectId?: string | null) {
    rememberOpener()
    if (selectId !== undefined) snap.select(selectId)
    if (filter !== undefined) setDefaultFilter(filter)
    setInspectorOpen(true)
    setCollapsed(false)
    setInspectorKey((value) => value + 1)
  }

  function toggleRow(item: ProcessPresentation) {
    const id = item.resource.id
    if (inspectorOpen && selectedId === id) {
      closeInspector()
      return
    }
    openInspector(undefined, id)
  }

  function resourceIdFromEvent(event: SyntheticEvent): string | null {
    const target = event.target instanceof HTMLElement ? event.target : null
    return target?.closest('[data-resource-id]')?.getAttribute('data-resource-id') ?? null
  }

  return (
    <div className="processes-dock" data-testid="processes-dock">
      {hasStrip && !collapsed && (
        <section aria-label={t('processes.section')} className="processes-strip">
          {summary.showHeader && (
            <div className="processes-strip-head">
              <span className="processes-strip-title">
                {t('processes.section')} · {activeCount} {t('processes.active')}
              </span>
              {attention.length === 0 && (
                <button type="button" onClick={() => openInspector('all')} className="processes-link">
                  {t('processes.viewAll')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label={t('processes.collapse')}
                className="processes-collapse"
              >
                ▾
              </button>
            </div>
          )}
          {attention.length > 0 && summary.visible.length === 0 && (
            <button
              ref={openerRef as Ref<HTMLButtonElement>}
              type="button"
              onClick={() => openInspector('attention', attention[0]?.resource.id ?? null)}
              className="processes-attention"
            >
              {t(attention.length === 1 ? 'processes.needsAttention' : 'processes.needsAttentionPlural', {
                n: attention.length,
              })}
            </button>
          )}
          <ul
            className="processes-rows"
            onMouseOver={(event) => setHoveredId(resourceIdFromEvent(event))}
            onMouseOut={(event) => {
              if (resourceIdFromEvent(event) != null) setHoveredId(null)
            }}
            onFocus={(event) => {
              const id = resourceIdFromEvent(event)
              if (id != null) setFocusedId(id)
            }}
            onBlur={() => setFocusedId(null)}
          >
            {summary.visible.map((item) => (
              <ProcessRow
                key={item.resource.id}
                presentation={item}
                detailId="processes-inspector"
                expanded={inspectorOpen && selectedId === item.resource.id}
                stopState={stopById.get(item.resource.id) ?? { state: 'idle' }}
                now={now}
                onToggle={() => toggleRow(item)}
                onStop={() => void snap.stop(item.resource.id)}
              />
            ))}
          </ul>
          {summary.hiddenCount > 0 && !inspectorOpen && (
            <button type="button" onClick={() => openInspector('all')} className="processes-link">
              {t('processes.moreResources', { n: summary.hiddenCount })}
            </button>
          )}
          {listTruncated && (
            <p className="processes-note">{t('processes.partialList', { n: ordered.length })}</p>
          )}
          {listError && (
            <p role="alert" className="processes-error">
              {listError}
            </p>
          )}
        </section>
      )}
      {hasStrip && collapsed && !inspectorOpen && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="processes-collapsed-line"
          aria-label={t('processes.section')}
        >
          {t('processes.section')} · {activeCount} {t('processes.active')}
        </button>
      )}
      {inspectorOpen && (
        <div id="processes-inspector">
          {(freshness === 'unsupported' || freshness === 'offline') && ordered.length === 0 ? (
            <div className="processes-inspector">
              <p className="processes-empty">
                {freshness === 'unsupported' ? t('processes.unsupported') : t('processes.offline')}
              </p>
              <button type="button" onClick={closeInspector} className="processes-link">
                {t('processes.closeInspector')}
              </button>
            </div>
          ) : (
            <ProcessInspector
              key={inspectorKey}
              ordered={ordered}
              defaultFilter={defaultFilter}
              selectedId={selectedId}
              selectedOutput={selectedOutput}
              selectedMissing={selectedMissing}
              readError={readError}
              stopById={stopById}
              listTruncated={listTruncated}
              pinnedId={pinnedId}
              onSelect={(id) => snap.select(id)}
              onStop={(id) => void snap.stop(id)}
              onAcknowledge={(id) => snap.acknowledge(id)}
              onDismiss={(id) => snap.dismiss(id)}
              onPin={(id) => snap.pin(id)}
              onClose={closeInspector}
            />
          )}
        </div>
      )}
    </div>
  )
}
