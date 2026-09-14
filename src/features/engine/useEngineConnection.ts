import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type EngineStatus } from '../../services/engine'

/**
 * EngineConnectionController: estado del engine (stopped/starting/…/failed)
 * más arranque, reinicio y apagado. No toca sesiones, catálogo ni turnos;
 * la composición (refresh + snapshot tras ready) vive en useEngineSession.
 */
export function useEngineConnection() {
  const [status, setStatus] = useState<EngineStatus | null>(null)
  // Época local del runtime: cambia cuando se inicia/reinicia el engine o se
  // pierde la certeza de continuidad. No cambia por render ni por poll.
  // Invalida snapshots, selecciones y respuestas en vuelo del ámbito anterior.
  const [epoch, setEpoch] = useState(0)

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      setStatus(await engineApi.status())
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [])

  const start = useCallback(async (): Promise<EngineStatus | null> => {
    try {
      const next = await engineApi.start()
      setStatus(next)
      if (next?.state === 'ready') setEpoch((value) => value + 1)
      return next
    } catch (err) {
      toast.error(commandMessage(err))
      await refreshStatus()
      return null
    }
  }, [refreshStatus])

  const restart = useCallback(async (): Promise<EngineStatus | null> => {
    try {
      const next = await engineApi.restart()
      setStatus(next)
      if (next?.state === 'ready') setEpoch((value) => value + 1)
      return next
    } catch (err) {
      toast.error(commandMessage(err))
      await refreshStatus()
      return null
    }
  }, [refreshStatus])

  const shutdown = useCallback(async (): Promise<void> => {
    try {
      setStatus(await engineApi.shutdown())
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [])

  return {
    status,
    ready: status?.state === 'ready',
    epoch,
    refreshStatus,
    start,
    restart,
    shutdown,
  }
}

export type EngineConnection = ReturnType<typeof useEngineConnection>
