import { useCallback, useContext, useEffect, useMemo } from 'react'
import { ProcessesRuntimeContext } from './ProcessRuntimeProvider'

/**
 * Suscripción por sesión al controlador compartido. Dejar de observar
 * suspende polling sin detener recursos del engine.
 *
 * La suscripción usa sólo callbacks estables: los polls que actualizan
 * la versión de datos no provocan unsubscribe/resubscribe.
 */
export function useSessionProcesses(sessionId: string, opts: { observeOutput?: boolean } = {}) {
  const ctx = useContext(ProcessesRuntimeContext)
  if (!ctx) throw new Error('useSessionProcesses debe usarse dentro de ProcessRuntimeProvider')
  const observeOutput = opts.observeOutput ?? false
  const { subscribe, getSnapshot, select, refresh, stop, acknowledge, dismiss, pin } = ctx
  const version = ctx.version
  const epoch = ctx.epoch
  const engineReady = ctx.engineReady
  const hasCapability = ctx.hasCapability

  useEffect(() => {
    if (!sessionId) return
    return subscribe(sessionId, observeOutput)
  }, [subscribe, sessionId, observeOutput])

  // Lectura fresca fuera del snapshot memoizado: para decisiones en el
  // momento del clic (p. ej. confirmar stop) sin depender del último bump.
  const readFresh = useCallback(
    () => getSnapshot(sessionId),
    [getSnapshot, sessionId],
  )

  return useMemo(
    () => {
      const snapshot = getSnapshot(sessionId)
      return {
        ...snapshot,
        epoch,
        engineReady,
        hasCapability,
        readFresh,
        select: (id: string | null) => select(sessionId, id),
        refresh: () => refresh(sessionId),
        stop: (id: string) => stop(sessionId, id),
        acknowledge: (id: string) => acknowledge(sessionId, id),
        dismiss: (id: string) => dismiss(sessionId, id),
        pin: (id: string | null) => pin(sessionId, id),
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getSnapshot, sessionId, version, epoch, engineReady, hasCapability, readFresh, select, refresh, stop, acknowledge, dismiss, pin],
  )
}

export type SessionProcesses = ReturnType<typeof useSessionProcesses>
