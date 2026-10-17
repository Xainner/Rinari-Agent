import { useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '../../services/engine'
import { bornAt } from '../../features/projects/workspaceModel'

/** Una hija nacida hace menos de esto entra con movimiento, salvo que ya estuviera al montarse la barra. */
const FRESH_MS = 15_000
/** Lo que dura el check recién dibujado de una hija. */
const CELEBRATE_MS = 2_400

/**
 * El movimiento de las conversaciones hijas en la barra lateral (#40): la hija
 * nueva sale de la fila de su madre y la que termina (vista pasar de
 * trabajando a terminada) dibuja su check. Volver a montar no repite nada: las
 * hijas que ya estaban no entran, y un final solo cuenta si esta barra la vio
 * trabajando.
 */
export function useChildMotion(sessions: readonly SessionSummary[], busy: ReadonlySet<string> | undefined) {
  const atMount = useRef<ReadonlySet<string> | null>(null)
  if (atMount.current === null) atMount.current = new Set(sessions.filter((session) => session.parent_session_id).map((session) => session.id))
  const previous = useRef<ReadonlySet<string>>(busy ?? new Set())
  const timers = useRef(new Set<number>())
  const [finished, setFinished] = useState<ReadonlySet<string>>(() => new Set())
  // Las que esta barra vio terminar: siguen con su check aunque aún sean recientes.
  const [ended, setEnded] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const before = previous.current
    previous.current = busy ?? new Set()
    const done = [...before].filter((id) => !busy?.has(id))
    if (done.length === 0) return
    setFinished((current) => new Set([...current, ...done]))
    setEnded((current) => new Set([...current, ...done]))
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setFinished((current) => {
        const next = new Set(current)
        for (const id of done) next.delete(id)
        return next
      })
    }, CELEBRATE_MS)
    timers.current.add(timer)
  }, [busy])

  useEffect(() => {
    const pending = timers.current
    return () => { for (const timer of pending) window.clearTimeout(timer) }
  }, [])

  const now = Date.now()
  const fresh = (id: string) => {
    const born = bornAt(id)
    return born !== null && now - born < FRESH_MS
  }
  return {
    fresh,
    entering: (id: string) => !atMount.current!.has(id) && fresh(id),
    finished: (id: string) => finished.has(id),
    ended: (id: string) => ended.has(id),
  }
}
