import { useEffect, useRef, useState, type Ref, type SyntheticEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { useSessionProcesses } from './useSessionProcesses'
import ProcessRow from './ProcessRow'
import ProcessInspector, { type ProcessInspectorFilter } from './ProcessInspector'
import ProcessStopDialog from './ProcessStopDialog'
import { PROCESSES_DURATION, useProcessesMotion } from './processMotion'
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
  const motionApi = useProcessesMotion()
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [inspectorKey, setInspectorKey] = useState(0)
  const [defaultFilter, setDefaultFilter] = useState<ProcessInspectorFilter>('all')
  const [logPaused, setLogPaused] = useState(false)
  const [stopTargetId, setStopTargetId] = useState<string | null>(null)
  const [stopEpoch, setStopEpoch] = useState<number | null>(null)
  const [stopStaleNote, setStopStaleNote] = useState(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [announcement, setAnnouncement] = useState('')
  const lastAnnouncedRef = useRef('')
  const hiddenMsRef = useRef(0)
  const hiddenSinceRef = useRef<number | null>(null)
  const firstSignalRef = useRef(true)

  const snap = useSessionProcesses(sessionId, { observeOutput: inspectorOpen && !logPaused })
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

  // Coordinación mínima con el navegador: el inspector abierto evita que el
  // navegador se autoabra encima; abrir el navegador manualmente contrae
  // los logs conservando el resumen. Nada de esto detiene recursos.
  const setProcessesInspectorFor = useUIStore((s) => s.setProcessesInspectorFor)
  useEffect(() => {
    if (!sessionId) return
    setProcessesInspectorFor(inspectorOpen ? sessionId : null)
    return () => setProcessesInspectorFor(null)
  }, [inspectorOpen, sessionId, setProcessesInspectorFor])

  useEffect(() => {
    function onBrowserOpen() {
      setInspectorOpen(false)
      setLogPaused(false)
    }
    window.addEventListener('rinari-browser-open', onBrowserOpen)
    return () => window.removeEventListener('rinari-browser-open', onBrowserOpen)
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

  // Anuncio único por cambio relevante; nunca cada poll ni cada segundo.
  useEffect(() => {
    const next =
      attention.length > 0
        ? t(attention.length === 1 ? 'processes.needsAttention' : 'processes.needsAttentionPlural', {
            n: attention.length,
          })
        : activeCount > 0
          ? `${t('processes.section')} · ${activeCount} ${t('processes.active')}`
          : ''
    if (next !== lastAnnouncedRef.current) {
      lastAnnouncedRef.current = next
      setAnnouncement(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attention.length, activeCount])

  // Diálogo de detención: identifica el recurso y reverifica ámbito,
  // época y observación antes de enviar.
  const stopTarget = stopTargetId != null ? (ordered.find((item) => item.resource.id === stopTargetId) ?? null) : null
  const stopState = stopTargetId != null ? (snap.stopById.get(stopTargetId) ?? { state: 'idle' as const }) : { state: 'idle' as const }
  const stopBusy = stopState.state === 'requesting' || stopState.state === 'reconciling'
  const stopResultMessage =
    stopState.state === 'failed'
      ? t('processes.stillActive')
      : stopState.state === 'uncertain'
        ? t('processes.stopUncertain')
        : null

  useEffect(() => {
    if (stopTargetId != null && stopState.state === 'confirmed') {
      setStopTargetId(null)
      setStopEpoch(null)
      setStopStaleNote(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopTargetId, stopState.state])

  useEffect(() => {
    if (stopTargetId != null && stopEpoch != null && snap.epoch !== stopEpoch) {
      // La época cambió: se exige nueva observación y nueva confirmación.
      setStopTargetId(null)
      setStopEpoch(null)
      setStopStaleNote(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopTargetId, stopEpoch, snap.epoch])

  function requestStop(id: string) {
    setStopStaleNote(false)
    setStopEpoch(snap.epoch)
    setStopTargetId(id)
    snap.refresh()
  }

  function confirmStop() {
    if (stopTargetId == null) return
    // Reverificar ámbito y observación con el snapshot actual.
    if (stopEpoch == null || snap.epoch !== stopEpoch) {
      snap.refresh()
      setStopStaleNote(true)
      return
    }
    const current = ordered.find((item) => item.resource.id === stopTargetId)
    if (!current || !current.resource.running || !current.resource.can_stop) {
      snap.refresh()
      setStopStaleNote(true)
      return
    }
    if (Date.now() - current.lastVerifiedAt > 10_000) {
      snap.refresh()
      setStopStaleNote(true)
      return
    }
    void snap.stop(stopTargetId)
  }

  if (!hasStrip && !inspectorOpen) return null
  if ((freshness === 'unsupported' || freshness === 'offline') && !inspectorOpen) return null

  function rememberOpener(element?: HTMLElement | null) {
    const target = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    if (target && document.contains(target)) openerRef.current = target
  }

  function closeInspector() {
    setInspectorOpen(false)
    setLogPaused(false)
    const opener = openerRef.current
    if (opener && document.contains(opener)) opener.focus()
  }

  function selectAndUnpause(id: string | null) {
    setLogPaused(false)
    snap.select(id)
  }

  function openInspector(filter?: ProcessInspectorFilter, selectId?: string | null) {
    rememberOpener()
    if (selectId !== undefined) selectAndUnpause(selectId)
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

  function handleDockKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'Escape') return
    const target = event.target instanceof HTMLElement ? event.target : null
    // Escape cierra el inspector sólo si el foco está dentro de él y no hay
    // un diálogo modal abierto (Radix gestiona el suyo). Nunca detiene.
    if (!target || !rootRef.current?.contains(target)) return
    if (target.closest('[role="dialog"]')) return
    if (inspectorOpen) {
      event.stopPropagation()
      closeInspector()
    }
  }

  return (
    <div ref={rootRef} className="processes-dock" data-testid="processes-dock" onKeyDown={handleDockKeyDown}>
      <span role="status" className="processes-sr-only">
        {announcement}
      </span>
      <AnimatePresence initial={false}>
        {hasStrip && !collapsed && (
          <motion.section
            key="strip"
            aria-label={t('processes.section')}
            className="processes-strip"
            initial={{ opacity: 0, y: motionApi.enterY(6) }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={motionApi.transition(PROCESSES_DURATION.stripEnter)}
          >
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
            <AnimatePresence initial={false}>
              {summary.visible.map((item) => (
                <ProcessRow
                  key={item.resource.id}
                  presentation={item}
                  detailId="processes-inspector"
                  expanded={inspectorOpen && selectedId === item.resource.id}
                  stopState={stopById.get(item.resource.id) ?? { state: 'idle' }}
                  now={now}
                  onToggle={() => toggleRow(item)}
                  onStop={() => requestStop(item.resource.id)}
                />
              ))}
            </AnimatePresence>
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
          </motion.section>
        )}
      </AnimatePresence>
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
      <AnimatePresence initial={false}>
      {inspectorOpen && (
        <motion.div
          key="inspector"
          id="processes-inspector"
          initial={{ opacity: 0, y: motionApi.enterY(-8) }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={motionApi.transition(PROCESSES_DURATION.inspector)}
        >
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
              sessionId={sessionId}
              ordered={ordered}
              defaultFilter={defaultFilter}
              selectedId={selectedId}
              selectedOutput={selectedOutput}
              selectedMissing={selectedMissing}
              readError={readError}
              stopById={stopById}
              listTruncated={listTruncated}
              pinnedId={pinnedId}
              logPaused={logPaused}
              onLogPausedChange={setLogPaused}
              onSelect={selectAndUnpause}
              onStopRequest={requestStop}
              onAcknowledge={(id) => snap.acknowledge(id)}
              onDismiss={(id) => snap.dismiss(id)}
              onPin={(id) => snap.pin(id)}
              onClose={closeInspector}
            />
          )}
        </motion.div>
      )}
      </AnimatePresence>
      <ProcessStopDialog
        target={
          stopTarget
            ? { id: stopTarget.resource.id, command: stopTarget.resource.command, cwd: stopTarget.resource.cwd, lastVerifiedAt: stopTarget.lastVerifiedAt }
            : null
        }
        stale={stopStaleNote}
        busy={stopBusy}
        resultMessage={stopResultMessage}
        onConfirm={confirmStop}
        onCancel={() => {
          setStopTargetId(null)
          setStopEpoch(null)
          setStopStaleNote(false)
        }}
      />
    </div>
  )
}
