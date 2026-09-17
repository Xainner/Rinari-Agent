import { useEffect, useMemo, useRef, useState, type Ref, type SyntheticEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SquareTerminal } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useSessionProcesses } from './useSessionProcesses'
import ProcessRow from './ProcessRow'
import ProcessInspector, { type ProcessInspectorFilter } from './ProcessInspector'
import ProcessStopDialog from './ProcessStopDialog'
import { PROCESSES_DURATION, useProcessesMotion } from './processMotion'
import {
  isExternalPreview,
  isFailureStatus,
  stopResultKey,
  summarizeStrip,
  type ProcessPresentation,
} from './processesModel'

export const RECENT_SUCCESS_MS = 5_000
export const PROCESSES_AUTO_CLOSE_MS = 5_000

export function shouldAutoCloseInspector(opts: {
  inspectorOpen: boolean
  activeCount: number
  attentionCount: number
  blocked: boolean
  wasActive: boolean
}): boolean {
  if (!opts.inspectorOpen) return false
  if (opts.activeCount > 0 || opts.attentionCount > 0) return false
  if (opts.blocked || !opts.wasActive) return false
  return true
}

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
  // Montaje separado de visibilidad: al cerrar, el contenedor persiste lo
  // que dura la transición CSS y se desmonta después. Así el cierre anima
  // siempre, sin depender del ciclo de salida de la librería.
  const [inspectorMounted, setInspectorMounted] = useState(false)
  // Minimizado por defecto: las filas aparecen solo si el usuario expande.
  const [collapsed, setCollapsed] = useState(true)
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
  const closeTimer = useRef<number | null>(null)
  const autoCloseTimer = useRef<number | null>(null)
  const leaveTimer = useRef<number | null>(null)
  // Gracia de salida del teardown final: al retirarse lo último visible,
  // la raíz persiste lo que dura el fundido y se desmonta después.
  const [leaving, setLeaving] = useState(false)
  const wasVisibleRef = useRef(false)
  // Solo se auto-cierra lo que estaba abierto durante actividad: una
  // apertura manual en reposo nunca se cierra sola.
  const wasActiveRef = useRef(false)
  // Última señal atendida: sólo un CAMBIO abre el inspector. Un flag de
  // "primera vez" se rompería con el remontaje de StrictMode y abriría
  // el inspector al iniciar o al crear un chat.
  const prevSignalRef = useRef(openSignal)
  const [announcement, setAnnouncement] = useState('')
  const lastAnnouncedRef = useRef('')
  const hiddenMsRef = useRef(0)
  /** Tiempo oculto acumulado en el instante en que cada recurso terminó. */
  const hiddenAtCompletionRef = useRef(new Map<string, number>())
  const hiddenSinceRef = useRef<number | null>(null)

  const snap = useSessionProcesses(sessionId, { observeOutput: inspectorMounted && !logPaused })
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
    listInvalid,
    freshness,
  } = snap

  // Apertura explícita desde la paleta (funciona incluso sin franja visible).
  // Sólo un cambio de señal abre: montar (inicio, chat nuevo, StrictMode)
  // nunca abre solo.
  useEffect(() => {
    if (prevSignalRef.current === openSignal) return
    prevSignalRef.current = openSignal
    openInspector('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  // Sello del acumulador de oculto por recurso terminado, y poda de los
  // que el engine ya no lista.
  useEffect(() => {
    const stamps = hiddenAtCompletionRef.current
    const live = new Set<string>()
    for (const item of ordered) {
      live.add(item.resource.id)
      if (item.completionObservedAt != null && !stamps.has(item.resource.id)) {
        stamps.set(item.resource.id, hiddenMsRef.current)
      }
    }
    for (const id of [...stamps.keys()]) {
      if (!live.has(id)) stamps.delete(id)
    }
  }, [ordered])

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

  // El navegador vive en el dock lateral de la sesión y ya no compite por una
  // zona flotante: el inspector no lo esconde ni el navegador contrae los logs.

  // Al desmontar no se detiene nada, pero sí se cancelan temporizadores.
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      if (autoCloseTimer.current !== null) window.clearTimeout(autoCloseTimer.current)
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    },
    [],
  )

  const online = freshness !== 'offline'
  const confirmedIds = useMemo(
    () => new Set(snap.confirmedIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap.confirmedIds.join('|')],
  )

  const attention = ordered.filter(
    (item) =>
      isFailureStatus(item.resource, confirmedIds.has(item.resource.id)) &&
      !item.attentionAcknowledged,
  )
  const relevant = ordered.filter((item) => {
    if (item.dismissedFromStrip) return false
    if (item.resource.running) return true
    if (isExternalPreview(item.resource)) return true
    if (item.completionObservedAt == null) return false
    if (item.resource.id === selectedId && inspectorOpen) return true
    if (hoveredId === item.resource.id || focusedId === item.resource.id) return true
    const hiddenAtCompletion = hiddenAtCompletionRef.current.get(item.resource.id) ?? 0
    const hiddenSince = hiddenMsRef.current - hiddenAtCompletion
    return now - item.completionObservedAt - hiddenSince < RECENT_SUCCESS_MS
  })
  const summary = summarizeStrip(relevant, { listTruncated })
  const activeCount = ordered.filter((item) => item.resource.running).length
  const hasStrip = summary.visible.length > 0 || attention.length > 0

  // Anuncio único por cambio relevante; nunca cada poll ni cada segundo.
  // Incluye errores de listado para lectores de pantalla: visualmente la
  // franja sigue silenciosa hasta apertura explícita.
  useEffect(() => {
    const next =
      listError !== null
        ? listError
        : attention.length > 0
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
  }, [listError, attention.length, activeCount])

  // Cierre automático: si el inspector estaba abierto durante actividad
  // y ya no hay activos ni nada que requiera atención, se cierra del todo
  // a los 5 s. No cierra con interacción en curso, vista pausada,
  // diálogos abiertos ni aperturas manuales en reposo. La interacción
  // pausa el temporizador y lo rearma al liberarse.
  const autoCloseBlocked =
    hoveredId !== null || focusedId !== null || logPaused || stopTargetId !== null
  // Elegibilidad vigente para reintentos: el callback del temporizador
  // puede ejecutarse después de que el snapshot del efecto quede viejo
  // (p. ej. diálogo de consulta abierto). Revalidar evita cerrar con
  // actividad nueva y evita abandonar el cierre para siempre.
  const autoCloseEligibleRef = useRef(false)
  // Armado visible del autocierre: coincide con el temporizador y alimenta
  // la barra de cuenta atrás del inspector.
  const autoCloseArmed = shouldAutoCloseInspector({
    inspectorOpen,
    activeCount,
    attentionCount: attention.length,
    blocked: autoCloseBlocked,
    wasActive: wasActiveRef.current,
  })
  autoCloseEligibleRef.current = autoCloseArmed
  useEffect(() => {
    if (autoCloseTimer.current !== null) {
      window.clearTimeout(autoCloseTimer.current)
      autoCloseTimer.current = null
    }
    if (!inspectorOpen) {
      wasActiveRef.current = false
      return
    }
    if (activeCount > 0 || attention.length > 0) {
      wasActiveRef.current = true
      return
    }
    if (
      !shouldAutoCloseInspector({
        inspectorOpen,
        activeCount,
        attentionCount: attention.length,
        blocked: autoCloseBlocked,
        wasActive: wasActiveRef.current,
      })
    ) {
      return
    }
    function attemptClose(): void {
      // Un modal (confirmación de stop, consulta) pausa el cierre: se
      // reintenta en 1 s en vez de abandonar el autocierre para siempre.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        autoCloseTimer.current = window.setTimeout(() => {
          autoCloseTimer.current = null
          if (!autoCloseEligibleRef.current) return
          attemptClose()
        }, 1000)
        return
      }
      if (!autoCloseEligibleRef.current) return
      closeInspector()
    }
    autoCloseTimer.current = window.setTimeout(() => {
      autoCloseTimer.current = null
      attemptClose()
    }, PROCESSES_AUTO_CLOSE_MS)
    return () => {
      if (autoCloseTimer.current !== null) {
        window.clearTimeout(autoCloseTimer.current)
        autoCloseTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorOpen, activeCount, attention.length, autoCloseBlocked])
  // Diálogo de detención: identifica el recurso y reverifica ámbito,
  // época y observación antes de enviar.
  const stopTarget = stopTargetId != null ? (ordered.find((item) => item.resource.id === stopTargetId) ?? null) : null
  const stopState = stopTargetId != null ? (snap.stopById.get(stopTargetId) ?? { state: 'idle' as const }) : { state: 'idle' as const }
  const stopBusy = stopState.state === 'requesting' || stopState.state === 'reconciling'
  const stopResultMessageKey = stopResultKey(stopState)
  const stopResultMessage = stopResultMessageKey !== null ? t(stopResultMessageKey) : null

  useEffect(() => {
    if (stopTargetId != null && stopState.state === 'confirmed') {
      setStopTargetId(null)
      setStopEpoch(null)
      setStopStaleNote(false)
    }
  }, [stopTargetId, stopState.state])

  useEffect(() => {
    if (stopTargetId != null && stopEpoch != null && snap.epoch !== stopEpoch) {
      // La época cambió: se exige nueva observación y nueva confirmación.
      setStopTargetId(null)
      setStopEpoch(null)
      setStopStaleNote(false)
    }
  }, [stopTargetId, stopEpoch, snap.epoch])

  function requestStop(id: string) {
    setStopStaleNote(false)
    setStopEpoch(snap.epoch)
    setStopTargetId(id)
    snap.refresh()
  }

  function confirmStop() {
    if (stopTargetId == null) return
    // Reverificar ámbito y observación con un snapshot fresco del momento
    // del clic, no con el render (el bump es condicional y lastVerifiedAt
    // puede estar congelado en el snapshot memoizado).
    if (stopEpoch == null || snap.epoch !== stopEpoch) {
      snap.refresh()
      setStopStaleNote(true)
      return
    }
    const live = snap.readFresh()
    const current = live.ordered.find((item) => item.resource.id === stopTargetId)
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

  const shouldRenderNull =
    (!hasStrip || freshness === 'unsupported' || freshness === 'offline') && !inspectorMounted

  // Fundido de salida del teardown final (ver CSS .is-leaving): la raíz
  // persiste ~260ms tras retirarse lo último visible para que el fundido
  // se vea; con movimiento reducido el retiro es inmediato.
  useEffect(() => {
    if (!shouldRenderNull) {
      wasVisibleRef.current = true
      if (leaveTimer.current !== null) {
        window.clearTimeout(leaveTimer.current)
        leaveTimer.current = null
      }
      if (leaving) setLeaving(false)
      return
    }
    if (!wasVisibleRef.current || motionApi.reducedMotion) return
    if (leaveTimer.current !== null) return
    if (!leaving) setLeaving(true)
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null
      wasVisibleRef.current = false
      setLeaving(false)
    }, 260)
  }, [shouldRenderNull, leaving, motionApi.reducedMotion])

  // Entrar a la gracia en el mismo commit que retira lo último visible:
  // así se conserva el nodo DOM y el fundido CSS sí se ve. Sin esto, el
  // render de expiración desmontaría el nodo y la gracia reinsertaría
  // otro ya invisible.
  const enterLeaving =
    shouldRenderNull && !leaving && wasVisibleRef.current && !motionApi.reducedMotion
  const renderLeaving = leaving || enterLeaving

  if (shouldRenderNull && !renderLeaving) return null

  function rememberOpener(element?: HTMLElement | null) {
    const target = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    if (target && document.contains(target)) openerRef.current = target
  }

  function closeInspector() {
    setInspectorOpen(false)
    setLogPaused(false)
    setHoveredId(null)
    setFocusedId(null)
    wasActiveRef.current = false
    const opener = openerRef.current
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    // Desmontar cuando termine la transición de cierre, no antes.
    closeTimer.current = window.setTimeout(
      () => {
        closeTimer.current = null
        setInspectorMounted(false)
      },
      motionApi.reducedMotion ? 0 : 260,
    )
  }

  function selectAndUnpause(id: string | null) {
    setLogPaused(false)
    snap.select(id)
  }

  function openInspector(filter?: ProcessInspectorFilter, selectId?: string | null) {
    rememberOpener()
    // La franja se oculta con el inspector abierto: limpiar hover/foco
    // evita que un id atascado bloquee el autocierre para siempre.
    setHoveredId(null)
    setFocusedId(null)
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (selectId !== undefined) selectAndUnpause(selectId)
    if (filter !== undefined) setDefaultFilter(filter)
    setInspectorMounted(true)
    // La clase .open entra en el siguiente frame para que la transición
    // CSS de apertura se ejecute.
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => setInspectorOpen(true))
        : (window.setTimeout(() => setInspectorOpen(true), 0) as unknown as number)
    void raf
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
    <div
      ref={rootRef}
      className={`processes-dock${renderLeaving ? ' is-leaving' : ''}`}
      data-testid="processes-dock"
      onKeyDown={handleDockKeyDown}
      onMouseLeave={() => setHoveredId(null)}
      onBlur={(event) => {
        const next = event.relatedTarget as HTMLElement | null
        if (next && event.currentTarget.contains(next)) return
        setFocusedId(null)
      }}
    >
      <span role="status" className="processes-sr-only">
        {announcement}
      </span>
      <AnimatePresence initial={false}>
        {hasStrip && !collapsed && !inspectorOpen && (
          <motion.section
            key="strip"
            aria-label={t('processes.section')}
            className="processes-strip"
            initial={{ opacity: 0, y: motionApi.enterY(6) }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionApi.transition(PROCESSES_DURATION.stripEnter)}
          >
          {summary.showHeader && (
            <div className="processes-strip-head">
              <span className="processes-strip-title">
                <SquareTerminal size={14} aria-hidden="true" />
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
            onMouseLeave={() => setHoveredId(null)}
            onFocus={(event) => {
              const id = resourceIdFromEvent(event)
              if (id != null) setFocusedId(id)
            }}
            onBlur={(event) => {
              const next = event.relatedTarget as HTMLElement | null
              if (next && event.currentTarget.contains(next)) return
              setFocusedId(null)
            }}
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
                  online={online}
                  stopConfirmed={confirmedIds.has(item.resource.id)}
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
          {listInvalid > 0 && (
            <p className="processes-note">{t('processes.invalidRows', { n: listInvalid })}</p>
          )}
          {listError && (
            <p role="alert" className="processes-error">
              {listError}
            </p>
          )}
          </motion.section>
        )}
        {hasStrip && (collapsed || inspectorOpen) && (
          inspectorOpen ? (
            <motion.div
              key="collapsed"
              aria-label={t('processes.section')}
              className={`processes-collapsed-line processes-collapsed-static${attention.length > 0 ? ' attention' : ''}`}
              initial={false}
              exit={{ opacity: 0 }}
              transition={motionApi.transition(PROCESSES_DURATION.stripEnter)}
            >
              <SquareTerminal size={14} aria-hidden="true" />
              {t('processes.section')} · {activeCount} {t('processes.active')}
              {attention.length > 0 && (
                <>
                  {' · '}
                  {t(attention.length === 1 ? 'processes.needsAttention' : 'processes.needsAttentionPlural', {
                    n: attention.length,
                  })}
                </>
              )}
            </motion.div>
          ) : (
            <motion.button
              key="collapsed"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={motionApi.transition(PROCESSES_DURATION.stripEnter)}
              onClick={() => {
                if (attention.length > 0) {
                  openInspector('attention', attention[0]?.resource.id ?? null)
                } else {
                  rememberOpener()
                  setCollapsed(false)
                }
              }}
              className={`processes-collapsed-line${attention.length > 0 ? ' attention' : ''}`}
              aria-label={`${t('processes.section')} · ${activeCount} ${t('processes.active')}${
                attention.length > 0
                  ? ` · ${t(attention.length === 1 ? 'processes.needsAttention' : 'processes.needsAttentionPlural', { n: attention.length })}`
                  : ''
              }`}
            >
              <SquareTerminal size={14} aria-hidden="true" />
              {t('processes.section')} · {activeCount} {t('processes.active')}
              {attention.length > 0 && (
                <>
                  {' · '}
                  {t(attention.length === 1 ? 'processes.needsAttention' : 'processes.needsAttentionPlural', {
                    n: attention.length,
                  })}
                </>
              )}
            </motion.button>
          )
        )}
      </AnimatePresence>
      {inspectorMounted && (
        <div
          id="processes-inspector"
          className={`processes-inspector-wrap${inspectorOpen ? ' open' : ''}`}
        >
          <div className="processes-inspector-clip">
          {autoCloseArmed && !motionApi.reducedMotion && (
            <div className="processes-autoclose-track" aria-hidden="true">
              <div
                className="processes-autoclose-bar"
                data-testid="processes-autoclose-bar"
                style={{ animationDuration: `${PROCESSES_AUTO_CLOSE_MS}ms` }}
              />
            </div>
          )}
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
              freshness={freshness}
              listError={listError}
              pinnedId={pinnedId}
              online={online}
              confirmedIds={confirmedIds}
              logPaused={logPaused}
              onLogPausedChange={setLogPaused}
              onSelect={selectAndUnpause}
              onStopRequest={requestStop}
              onAcknowledge={(id) => snap.acknowledge(id)}
              onDismiss={(id) => snap.dismiss(id)}
              onPin={(id) => snap.pin(id)}
              onRefresh={() => snap.refresh()}
              onClose={closeInspector}
            />
          )}
          </div>
        </div>
      )}
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
