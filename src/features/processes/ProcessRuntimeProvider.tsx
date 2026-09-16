import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { processesApi } from '../../services/processes'
import {
  isFailureStatus,
  orderPresentations,
  sameResource,
  type ConnectionFreshness,
  type ReadFailure,
  type ProcessPresentation,
  type StopOperation,
} from './processesModel'
import type { ProcessOutput } from '../../types/protocol.generated'

const ACTIVE_POLL_MS = 1500
const IDLE_POLL_MS = 5000
const BACKOFF_STEPS = [3000, 6000, 12000, 15000]
// Fila local breve tras stop confirmado: expira aunque el engine nunca
// la re-liste. Se poda en el ciclo de poll (no en getSnapshot, que sólo
// corre con bump y dejaría fantasmas sin re-render).
const DETACHED_TTL_MS = 60_000
// Absence in a partial list is never read as completion, so a permanently
// truncated listing (more resources than the engine page size) would grow
// `resources` without bound. The cap evicts the least recently verified
// finished rows; it asserts nothing about how they ended.
const MAX_TRACKED_RESOURCES = 400
const MAX_OUTPUT_ENTRIES = 4
const MAX_OUTPUT_CHARS = 2_000_000

interface CachedOutput {
  output: ProcessOutput
  chars: number
  lastUsed: number
}

interface SessionRuntime {
  sessionId: string
  epoch: number
  initialized: boolean
  freshness: ConnectionFreshness
  resources: Map<string, ProcessPresentation>
  engineOrder: string[]
  selectedId: string | null
  pinnedId: string | null
  confirmedDetached: Map<string, ConfirmedDetached>
  listError: string | null
  listTruncated: boolean
  listInvalid: number
  selectedMissing: boolean
  readErrorById: Map<string, ReadFailure>
  stopById: Map<string, StopOperation>
  outputs: Map<string, CachedOutput>
  seq: number
  appliedSeq: number
  invalidBeforeSeq: number
  activeList: boolean
  pendingList: boolean
  backoffStep: number
  timer: ReturnType<typeof setTimeout> | null
  lastPollAt: number
}

interface ConfirmedDetached {
  presentation: ProcessPresentation
  confirmedAt: number
}

interface ObserverCounts {
  count: number
  outputCount: number
}

interface ProcessesRuntimeContextValue {
  version: number
  epoch: number
  engineReady: boolean
  hasCapability: boolean
  hasIdentity: boolean
  subscribe: (sessionId: string, wantsOutput: boolean) => () => void
  getSnapshot: (sessionId: string) => SessionSnapshot
  select: (sessionId: string, id: string | null) => void
  refresh: (sessionId: string) => void
  stop: (sessionId: string, id: string) => Promise<void>
  acknowledge: (sessionId: string, id: string) => void
  dismiss: (sessionId: string, id: string) => void
  pin: (sessionId: string, id: string | null) => void
}

export interface SessionSnapshot {
  freshness: ConnectionFreshness
  ordered: ProcessPresentation[]
  selectedId: string | null
  pinnedId: string | null
  /** Ids con detención confirmada pero fuera del registro vivo. */
  confirmedIds: string[]
  selectedOutput: ProcessOutput | null
  selectedMissing: boolean
  listError: string | null
  readError: ReadFailure | null
  stopById: Map<string, StopOperation>
  listTruncated: boolean
  listInvalid: number
}

export const ProcessesRuntimeContext = createContext<ProcessesRuntimeContextValue | null>(null)

function emptySnapshot(freshness: ConnectionFreshness): SessionSnapshot {
  return {
    freshness,
    ordered: [],
    selectedId: null,
    pinnedId: null,
    confirmedIds: [],
    selectedOutput: null,
    selectedMissing: false,
    listError: null,
    readError: null,
    stopById: new Map(),
    listTruncated: false,
    listInvalid: 0,
  }
}

function outputChars(output: ProcessOutput): number {
  return output.stdout.length + output.stderr.length
}

function sameOutput(a: ProcessOutput | undefined, b: ProcessOutput): boolean {
  if (!a) return false
  return (
    a.stdout === b.stdout &&
    a.stderr === b.stderr &&
    a.truncated === b.truncated &&
    sameResource(a.process, b.process)
  )
}

export function ProcessRuntimeProvider({
  epoch,
  engineReady,
  hasCapability,
  hasIdentity,
  children,
}: {
  epoch: number
  engineReady: boolean
  hasCapability: boolean
  hasIdentity: boolean
  children: ReactNode
}) {
  const [version, setVersion] = useState(0)
  const sessionsRef = useRef(new Map<string, SessionRuntime>())
  const observersRef = useRef(new Map<string, ObserverCounts>())
  const propsRef = useRef({ epoch, engineReady, hasCapability, hasIdentity })
  propsRef.current = { epoch, engineReady, hasCapability, hasIdentity }
  // Identidad fuerte del engine (process_identity_v1): se aprende de las
  // respuestas. Si cambia sin que la época local lo haya visto, el engine
  // se reinició de forma invisible: se invalida todo el ámbito anterior.
  const instanceRef = useRef<string | null>(null)
  const pollRef = useRef<(sessionId: string) => Promise<void>>(async () => {})
  const ensureRef = useRef<(sessionId: string) => void>(() => {})

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const resetForRestart = useCallback(() => {
    for (const rt of sessionsRef.current.values()) {
      if (rt.timer) clearTimeout(rt.timer)
    }
    sessionsRef.current.clear()
    bump()
    for (const sessionId of observersRef.current.keys()) {
      ensureRef.current(sessionId)
    }
  }, [bump])

  const noteInstanceId = useCallback(
    (instanceId: string | undefined) => {
      if (typeof instanceId !== 'string' || instanceId === '') return
      if (instanceRef.current === null) {
        instanceRef.current = instanceId
        return
      }
      if (instanceRef.current !== instanceId) {
        // Reinicio invisible para la época local: nueva observación y
        // nueva confirmación; nada pendiente se reproduce.
        instanceRef.current = instanceId
        resetForRestart()
      }
    },
    [resetForRestart],
  )

  const getRuntime = useCallback((sessionId: string): SessionRuntime => {
    let rt = sessionsRef.current.get(sessionId)
    if (!rt || rt.epoch !== propsRef.current.epoch) {
      if (rt?.timer) clearTimeout(rt.timer)
      rt = {
        sessionId,
        epoch: propsRef.current.epoch,
        initialized: false,
        freshness: 'loading',
        resources: new Map(),
        engineOrder: [],
        selectedId: null,
        pinnedId: null,
        confirmedDetached: new Map(),
        listError: null,
        listTruncated: false,
        listInvalid: 0,
        selectedMissing: false,
        readErrorById: new Map(),
        stopById: new Map(),
        outputs: new Map(),
        seq: 0,
        appliedSeq: 0,
        invalidBeforeSeq: 0,
        activeList: false,
        pendingList: false,
        backoffStep: 0,
        timer: null,
        lastPollAt: 0,
      }
      sessionsRef.current.set(sessionId, rt)
    }
    return rt
  }, [])

  const clearTimer = useCallback((rt: SessionRuntime) => {
    if (rt.timer) {
      clearTimeout(rt.timer)
      rt.timer = null
    }
  }, [])

  const scheduleNext = useCallback((rt: SessionRuntime, delayMs: number) => {
    if (rt.timer) clearTimeout(rt.timer)
    const sessionId = rt.sessionId
    rt.timer = setTimeout(() => {
      rt.timer = null
      void pollRef.current(sessionId)
    }, delayMs)
  }, [])

  const pruneExpiredDetached = useCallback((rt: SessionRuntime, now: number): boolean => {
    let removed = false
    for (const [id, detached] of rt.confirmedDetached) {
      if (now - detached.confirmedAt >= DETACHED_TTL_MS) {
        rt.confirmedDetached.delete(id)
        removed = true
      }
    }
    return removed
  }, [])

  const pruneOutputs = useCallback((rt: SessionRuntime) => {
    let total = 0
    for (const cached of rt.outputs.values()) total += cached.chars
    while (rt.outputs.size > MAX_OUTPUT_ENTRIES || total > MAX_OUTPUT_CHARS) {
      let oldestKey: string | null = null
      let oldestUse = Number.POSITIVE_INFINITY
      for (const [key, cached] of rt.outputs) {
        if (key === rt.selectedId) continue
        if (cached.lastUsed < oldestUse) {
          oldestUse = cached.lastUsed
          oldestKey = key
        }
      }
      if (oldestKey === null) break
      const removed = rt.outputs.get(oldestKey)
      if (removed) total -= removed.chars
      rt.outputs.delete(oldestKey)
    }
  }, [])

  const storeOutput = useCallback(
    (rt: SessionRuntime, output: ProcessOutput): boolean => {
      const id = output.process.id
      const prev = rt.outputs.get(id)?.output
      if (sameOutput(prev, output)) {
        const cached = rt.outputs.get(id)
        if (cached) cached.lastUsed = Date.now()
        return false
      }
      rt.outputs.set(id, { output, chars: outputChars(output), lastUsed: Date.now() })
      pruneOutputs(rt)
      return true
    },
    [pruneOutputs],
  )

  const readSelected = useCallback(
    async (sessionId: string, expectedSeq: number) => {
      const props = propsRef.current
      if (!props.engineReady || !props.hasCapability) return
      const rt = sessionsRef.current.get(sessionId)
      if (!rt || rt.epoch !== props.epoch) return
      const selectedId = rt.selectedId
      if (!selectedId) return
      if (expectedSeq < rt.invalidBeforeSeq || expectedSeq < rt.appliedSeq) return
      try {
        const output = await processesApi.read(sessionId, selectedId)
        noteInstanceId(output.engine_instance_id)
        const current = sessionsRef.current.get(sessionId)
        if (!current || current.epoch !== propsRef.current.epoch) return
        if (current.selectedId !== selectedId) return
        if (expectedSeq < current.invalidBeforeSeq || expectedSeq < current.appliedSeq) return
        const changed = storeOutput(current, output)
        current.readErrorById.delete(selectedId)
        current.selectedMissing = false
        const prev = current.resources.get(selectedId)
        current.resources.set(selectedId, {
          resource: output.process,
          firstObservedAt: prev?.firstObservedAt ?? Date.now(),
          lastVerifiedAt: Date.now(),
          completionObservedAt: prev?.completionObservedAt,
          dismissedFromStrip: prev?.dismissedFromStrip ?? false,
          attentionAcknowledged: prev?.attentionAcknowledged ?? false,
        })
        if (changed || prev?.resource.running !== output.process.running) bump()
      } catch (err) {
        const current = sessionsRef.current.get(sessionId)
        if (!current || current.epoch !== propsRef.current.epoch) return
        if (current.selectedId !== selectedId) return
        const message = err instanceof Error ? err.message : String(err)
        if (/NOT_FOUND/.test(message)) {
          current.selectedMissing = true
          // Stored as a key: the runtime has no locale, the view does.
          current.readErrorById.set(selectedId, { key: 'processes.readGone' })
        } else {
          current.readErrorById.set(selectedId, { raw: message })
        }
        bump()
      }
    },
    [bump, noteInstanceId, storeOutput],
  )

  const pollSession = useCallback(
    async (sessionId: string) => {
      const props = propsRef.current
      const observers = observersRef.current.get(sessionId)
      if (!observers || observers.count === 0) return
      if (!props.engineReady) {
        const rt = sessionsRef.current.get(sessionId)
        if (rt && rt.epoch === props.epoch && rt.freshness !== 'offline') {
          rt.freshness = 'offline'
          bump()
        }
        return
      }
      if (!props.hasCapability) {
        const rt = sessionsRef.current.get(sessionId)
        if (rt && rt.epoch === props.epoch && rt.freshness !== 'unsupported') {
          rt.freshness = 'unsupported'
          bump()
        }
        return
      }
      const rt = getRuntime(sessionId)
      if (rt.activeList) {
        rt.pendingList = true
        return
      }
      rt.activeList = true
      const seq = ++rt.seq
      const scopeEpoch = props.epoch
      const scopeRt = rt
      try {
        const result = await processesApi.list(sessionId)
        if (propsRef.current.epoch !== scopeEpoch) return
        const current = sessionsRef.current.get(sessionId)
        if (!current || current !== scopeRt || current.epoch !== scopeEpoch) return
        if (seq < current.invalidBeforeSeq || seq < current.appliedSeq) return
        current.appliedSeq = seq
        noteInstanceId(result.engine_instance_id)
        // Un reinicio invisible limpia el mapa: este vuelo es huérfano y
        // no debe tocar al ámbito nuevo (ni su secuencia).
        if (sessionsRef.current.get(sessionId) !== scopeRt) return
        const now = Date.now()
        const seen = new Set<string>()
        const nextOrder: string[] = []
        let contentChanged = !current.initialized
        for (const row of result.processes) {
          seen.add(row.id)
          nextOrder.push(row.id)
          const prev = current.resources.get(row.id)
          if (!prev) {
            current.resources.set(row.id, {
              resource: row,
              firstObservedAt: now,
              lastVerifiedAt: now,
              completionObservedAt: undefined,
              dismissedFromStrip: false,
              attentionAcknowledged: false,
            })
            contentChanged = true
          } else {
            const wasRunning = prev.resource.running
            const completionObservedAt =
              prev.completionObservedAt ??
              (current.initialized && wasRunning && !row.running ? now : undefined)
            const changed = !sameResource(prev.resource, row)
            if (changed) contentChanged = true
            current.resources.set(row.id, {
              resource: row,
              firstObservedAt: prev.firstObservedAt,
              lastVerifiedAt: now,
              completionObservedAt,
              dismissedFromStrip: prev.dismissedFromStrip,
              attentionAcknowledged: prev.attentionAcknowledged,
            })
          }
        }
        if (!result.truncated) {
          for (const id of [...current.resources.keys()]) {
            if (!seen.has(id)) {
              current.resources.delete(id)
              contentChanged = true
            }
          }
          for (const id of [...current.confirmedDetached.keys()]) {
            if (seen.has(id)) current.confirmedDetached.delete(id)
          }
        }
        if (result.truncated && current.resources.size > MAX_TRACKED_RESOURCES) {
          const evictable = [...current.resources.entries()]
            .filter(
              ([id, item]) =>
                !item.resource.running &&
                !seen.has(id) &&
                id !== current.selectedId &&
                id !== current.pinnedId,
            )
            .sort((a, b) => a[1].lastVerifiedAt - b[1].lastVerifiedAt)
          for (const [id] of evictable.slice(
            0,
            current.resources.size - MAX_TRACKED_RESOURCES,
          )) {
            current.resources.delete(id)
            contentChanged = true
          }
        }
        current.engineOrder = nextOrder
        current.listTruncated = result.truncated
        current.listInvalid = result.invalid ?? 0
        current.listError = null
        current.backoffStep = 0
        current.freshness = 'fresh'
        current.lastPollAt = now
        current.initialized = true
        if (pruneExpiredDetached(current, now)) contentChanged = true
        current.selectedMissing =
          current.selectedId != null && !result.truncated && !seen.has(current.selectedId)
        if (contentChanged) bump()
        const obs = observersRef.current.get(sessionId)
        if (obs && obs.outputCount > 0 && current.selectedId && !current.selectedMissing) {
          await readSelected(sessionId, seq)
        } else if (current.selectedMissing && current.selectedId) {
          // Lista completa sin el seleccionado: verificación individual,
          // el engine valida pertenencia antes de leer.
          await readSelected(sessionId, seq)
        }
      } catch (err) {
        if (propsRef.current.epoch !== scopeEpoch) return
        const current = sessionsRef.current.get(sessionId)
        if (!current || current !== scopeRt || current.epoch !== scopeEpoch) return
        if (seq < current.invalidBeforeSeq || seq < current.appliedSeq) return
        current.appliedSeq = seq
        current.listError = err instanceof Error ? err.message : String(err)
        current.listInvalid = 0
        current.freshness = 'stale'
        current.backoffStep = Math.min(current.backoffStep + 1, BACKOFF_STEPS.length - 1)
        bump()
      } finally {
        const current = sessionsRef.current.get(sessionId)
        if (current && current === scopeRt && current.epoch === propsRef.current.epoch) {
          current.activeList = false
          if (current.pendingList) {
            current.pendingList = false
            void pollRef.current(sessionId)
            return
          }
          const obs = observersRef.current.get(sessionId)
          if (obs && obs.count > 0 && propsRef.current.engineReady && propsRef.current.hasCapability) {
            const hasRunning = [...current.resources.values()].some((item) => item.resource.running)
            const base = hasRunning ? ACTIVE_POLL_MS : IDLE_POLL_MS
            const delay = current.listError ? (BACKOFF_STEPS[current.backoffStep] ?? base) : base
            scheduleNext(current, delay)
          }
        }
      }
    },
    [bump, getRuntime, noteInstanceId, pruneExpiredDetached, readSelected, scheduleNext],
  )

  pollRef.current = pollSession

  const ensurePolling = useCallback(
    (sessionId: string) => {
      const props = propsRef.current
      const rt = getRuntime(sessionId)
      if (!props.engineReady || !props.hasCapability) {
        const next: ConnectionFreshness = !props.engineReady ? 'offline' : 'unsupported'
        if (rt.freshness !== next) {
          rt.freshness = next
          bump()
        }
        return
      }
      if (rt.timer || rt.activeList) return
      void pollRef.current(sessionId)
    },
    [bump, getRuntime],
  )

  ensureRef.current = ensurePolling

  const subscribe = useCallback(
    (sessionId: string, wantsOutput: boolean) => {
      if (!sessionId) return () => {}
      const prev = observersRef.current.get(sessionId) ?? { count: 0, outputCount: 0 }
      observersRef.current.set(sessionId, {
        count: prev.count + 1,
        outputCount: prev.outputCount + (wantsOutput ? 1 : 0),
      })
      getRuntime(sessionId)
      ensurePolling(sessionId)
      if (wantsOutput && prev.outputCount === 0) {
        // Al suscribir salida (selección o reanudación) se lee una vez
        // sin esperar el siguiente intervalo.
        const rt = sessionsRef.current.get(sessionId)
        if (rt && rt.selectedId) void readSelected(sessionId, rt.seq)
      }
      return () => {
        const current = observersRef.current.get(sessionId)
        if (!current) return
        const next = {
          count: Math.max(0, current.count - 1),
          outputCount: Math.max(0, current.outputCount - (wantsOutput ? 1 : 0)),
        }
        if (next.count === 0) {
          observersRef.current.delete(sessionId)
          const rt = sessionsRef.current.get(sessionId)
          if (rt) clearTimer(rt)
          // Se deja de observar sin detener: el snapshot se conserva en memoria.
        } else {
          observersRef.current.set(sessionId, next)
        }
      }
    },
    [clearTimer, ensurePolling, getRuntime, readSelected],
  )

  const getSnapshot = useCallback((sessionId: string): SessionSnapshot => {
    const props = propsRef.current
    const rt = sessionsRef.current.get(sessionId)
    if (!sessionId) {
      if (!props.engineReady) return emptySnapshot('offline')
      if (!props.hasCapability) return emptySnapshot('unsupported')
      return emptySnapshot('loading')
    }
    if (!rt || rt.epoch !== props.epoch) {
      if (!props.engineReady) return emptySnapshot('offline')
      if (!props.hasCapability) return emptySnapshot('unsupported')
      return emptySnapshot('loading')
    }
    const liveDetached = [...rt.confirmedDetached.entries()].filter(
      ([, detached]) => !rt.resources.has(detached.presentation.resource.id),
    )
    const confirmed = new Set(liveDetached.map(([id]) => id))
    // Stops confirmados cuyo recurso aún lista el engine: también cuentan,
    // salvo que haya vuelto a ejecutarse (id reutilizado tras reinicio).
    for (const [id, op] of rt.stopById) {
      if (op.state !== 'confirmed') continue
      const live = rt.resources.get(id)
      if (!live || !live.resource.running) confirmed.add(id)
    }
    const items = rt.engineOrder
      .map((id) => rt.resources.get(id))
      .filter((item): item is ProcessPresentation => Boolean(item))
      .concat(liveDetached.map(([, detached]) => detached.presentation))
    const ordered = orderPresentations(
      items.map((presentation) => ({
        presentation,
        selected: presentation.resource.id === rt.selectedId,
        pinned: presentation.resource.id === rt.pinnedId,
      })),
    )
    const selectedOutput = rt.selectedId ? (rt.outputs.get(rt.selectedId)?.output ?? null) : null
    return {
      freshness: rt.freshness,
      ordered,
      selectedId: rt.selectedId,
      pinnedId: rt.pinnedId,
      confirmedIds: [...confirmed],
      selectedOutput,
      selectedMissing: rt.selectedMissing,
      listError: rt.listError,
      readError: rt.selectedId ? (rt.readErrorById.get(rt.selectedId) ?? null) : null,
      stopById: new Map(rt.stopById),
      listTruncated: rt.listTruncated,
      listInvalid: rt.listInvalid,
    }
  }, [])

  const select = useCallback(
    (sessionId: string, id: string | null) => {
      if (!sessionId) return
      const rt = getRuntime(sessionId)
      if (rt.selectedId === id) return
      rt.selectedId = id
      rt.selectedMissing = false
      bump()
      if (id) {
        const seq = rt.seq
        void readSelected(sessionId, seq)
      }
    },
    [bump, getRuntime, readSelected],
  )

  const refresh = useCallback(
    (sessionId: string) => {
      if (!sessionId) return
      const rt = getRuntime(sessionId)
      rt.backoffStep = 0
      rt.pendingList = false
      if (rt.activeList) {
        rt.pendingList = true
        return
      }
      clearTimer(rt)
      void pollRef.current(sessionId)
    },
    [clearTimer, getRuntime],
  )

  const stop = useCallback(
    async (sessionId: string, id: string) => {
      if (!sessionId || !id) return
      const rt = getRuntime(sessionId)
      const scopeEpoch = propsRef.current.epoch
      const existing = rt.stopById.get(id)
      if (existing && (existing.state === 'requesting' || existing.state === 'reconciling')) return
      const snapshot = rt.resources.get(id)
      if (!snapshot) return
      if (!snapshot.resource.can_stop) return
      const requestId = `${scopeEpoch}:${sessionId}:${id}:${Date.now()}`
      rt.stopById.set(id, { state: 'requesting', requestId })
      bump()
      // Precondiciones de process_identity_v1 cuando el engine las
      // soporta y la observación las trae; el engine las valida antes
      // de actuar y responde STALE_RESOURCE si cambiaron.
      const generation = snapshot.resource.generation
      const preconditions =
        propsRef.current.hasIdentity &&
        instanceRef.current !== null &&
        typeof generation === 'number'
          ? { engine_instance_id: instanceRef.current, generation }
          : undefined
      try {
        const result = await processesApi.stop(sessionId, id, preconditions)
        const current = sessionsRef.current.get(sessionId)
        if (!current || current.epoch !== scopeEpoch) return
        if (current.stopById.get(id)?.state !== 'requesting') return
        if (result.running) {
          current.stopById.set(id, {
            state: 'failed',
            requestId,
            // The engine reported the resource as still running: that is the
            // `stillActive` case, not a stale-identity rejection.
            reason: 'still_running',
            message: '',
          })
          bump()
          return
        }
        current.stopById.set(id, { state: 'confirmed', requestId })
        current.invalidBeforeSeq = current.seq + 1
        // Fijar la confirmación antes de reconciliar para que un listado
        // anterior no devuelva el recurso a activo.
        const confirmedAt = Date.now()
        current.confirmedDetached.set(id, {
          presentation: {
            resource: { ...snapshot.resource, running: false, can_stop: false },
            firstObservedAt: snapshot.firstObservedAt,
            lastVerifiedAt: confirmedAt,
            completionObservedAt: confirmedAt,
            dismissedFromStrip: false,
            attentionAcknowledged: true,
          },
          confirmedAt,
        })
        bump()
        refresh(sessionId)
        const after = sessionsRef.current.get(sessionId)
        if (after && after.selectedId === id) {
          await readSelected(sessionId, after.seq)
        }
      } catch (err) {
        const current = sessionsRef.current.get(sessionId)
        if (!current || current.epoch !== scopeEpoch) return
        const message = err instanceof Error ? err.message : String(err)
        // STALE_RESOURCE es definitivo (la observación caducó), no
        // incierto: se muestra y se reconcilia con estado fresco.
        const stale = /STALE_RESOURCE/.test(message)
        current.stopById.set(id, {
          state: stale ? 'failed' : 'uncertain',
          requestId,
          // STALE_RESOURCE is a distinct outcome, not "still active": the
          // observation expired, so the view must say so and re-observe.
          reason: stale ? 'stale_resource' : 'unknown',
          message,
        })
        bump()
        // Resultado incierto: reconciliar con una lectura antes de reintentar.
        refresh(sessionId)
      }
    },
    [bump, getRuntime, readSelected, refresh],
  )

  const acknowledge = useCallback(
    (sessionId: string, id: string) => {
      const rt = sessionsRef.current.get(sessionId)
      if (!rt) return
      const item = rt.resources.get(id)
      if (!item) return
      item.attentionAcknowledged = true
      bump()
    },
    [bump],
  )

  const dismiss = useCallback(
    (sessionId: string, id: string) => {
      const rt = sessionsRef.current.get(sessionId)
      if (!rt) return
      const item = rt.resources.get(id)
      if (!item) return
      if (item.resource.running) return
      const stopOp = rt.stopById.get(id)
      const confirmed = stopOp?.state === 'confirmed' || rt.confirmedDetached.has(id)
      if (isFailureStatus(item.resource, confirmed) && !item.attentionAcknowledged) return
      item.dismissedFromStrip = true
      bump()
    },
    [bump],
  )

  const pin = useCallback(
    (sessionId: string, id: string | null) => {
      const rt = sessionsRef.current.get(sessionId)
      if (!rt) return
      rt.pinnedId = id
      bump()
    },
    [bump],
  )

  // Época: invalida snapshots, confirmaciones y vuelos del ámbito anterior.
  // Se omite el montaje inicial: los suscriptores ya arrancan su poll.
  const prevEpochRef = useRef(epoch)
  useEffect(() => {
    if (prevEpochRef.current === epoch) return
    prevEpochRef.current = epoch
    // La identidad aprendida pertenece al ámbito anterior.
    instanceRef.current = null
    for (const rt of sessionsRef.current.values()) {
      if (rt.timer) clearTimeout(rt.timer)
    }
    sessionsRef.current.clear()
    bump()
    for (const sessionId of observersRef.current.keys()) {
      ensurePolling(sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch])

  // Conexión/capability: reconciliación inmediata al recuperar ready.
  useEffect(() => {
    if (!engineReady || !hasCapability) {
      for (const rt of sessionsRef.current.values()) {
        if (rt.epoch !== epoch) continue
        clearTimer(rt)
        rt.freshness = !engineReady ? 'offline' : 'unsupported'
      }
      bump()
      return
    }
    for (const sessionId of observersRef.current.keys()) {
      const rt = sessionsRef.current.get(sessionId)
      if (rt && rt.epoch === epoch) rt.backoffStep = 0
      ensurePolling(sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady, hasCapability, epoch])

  // Ventana oculta: suspender polls; visible: reconciliar.
  useEffect(() => {
    function onVisibility() {
      if (typeof document === 'undefined') return
      if (document.hidden) {
        for (const rt of sessionsRef.current.values()) {
          if (rt.timer) clearTimeout(rt.timer)
          rt.timer = null
        }
        return
      }
      for (const sessionId of observersRef.current.keys()) {
        ensurePolling(sessionId)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [ensurePolling])

  // Desmontaje global: limpiar timers sin detener recursos del engine.
  useEffect(() => {
    const sessions = sessionsRef.current
    return () => {
      for (const rt of sessions.values()) {
        if (rt.timer) clearTimeout(rt.timer)
        rt.timer = null
      }
    }
  }, [])

  const value = useMemo<ProcessesRuntimeContextValue>(
    () => ({
      version,
      epoch,
      engineReady,
      hasCapability,
      hasIdentity,
      subscribe,
      getSnapshot,
      select,
      refresh,
      stop,
      acknowledge,
      dismiss,
      pin,
    }),
    [version, epoch, engineReady, hasCapability, hasIdentity, subscribe, getSnapshot, select, refresh, stop, acknowledge, dismiss, pin],
  )

  return <ProcessesRuntimeContext.Provider value={value}>{children}</ProcessesRuntimeContext.Provider>
}
