import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'

/** Cadencia con la superficie del navegador a la vista (transporte de capturas actual). */
export const BROWSER_POLL_ACTIVE_MS = 1_500

export interface BrowserFrameState {
  frame: BrowserFrame | null
  error: string
  /** Un browser conectado que aún no se ha mostrado en esta sesión de UI. */
  connectedInstance: string | null
}

/**
 * Vista del Engine sobre su página controlada (`browser.view.get`), por sesión.
 *
 * `browser.view.get` **siempre** captura la pantalla del target cuando hay un
 * browser conectado: no existe un modo solo-metadata. Por eso se consulta a
 * cadencia de capturas únicamente con la superficie a la vista, y fuera de
 * ella mediante una sonda puntual (`probe`) en los momentos en que el estado
 * pudo cambiar —montaje y fin de turno—, nunca con un temporizador de fondo.
 * Un navegador oculto no produce poll de capturas (documento 03 §10 y
 * documento 04 §5).
 *
 * Es transporte de fallback, no el browser nativo del documento 03; abrir la
 * misma URL en otra vista no es integración.
 */
export function useBrowserFrame(
  sessionId: string,
  options: { active: boolean; targetId?: string; enabled?: boolean; probe?: number },
): BrowserFrameState {
  const { active, targetId = '', enabled = true, probe = 0 } = options
  const [frame, setFrame] = useState<BrowserFrame | null>(null)
  const [error, setError] = useState('')
  const [connectedInstance, setConnectedInstance] = useState<string | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  // La instancia ya vista sobrevive a cada efecto: el sondeo con la superficie
  // a la vista y la sonda puntual comparten la detección de "browser nuevo".
  const instanceRef = useRef<string | undefined>(undefined)

  const requestRef = useRef<(alive: () => boolean) => Promise<void>>(async () => {})
  requestRef.current = async (alive) => {
    try {
      const next = await invoke<BrowserFrame>('browser_view_get', { session_id: sessionId, target_id: targetId || null })
      if (!alive()) return
      setFrame(next)
      setError(next.error ?? '')
      if (next.state === 'connected' && next.instance && next.instance !== instanceRef.current) {
        instanceRef.current = next.instance
        setConnectedInstance(next.instance)
      }
      if (next.state !== 'connected') instanceRef.current = undefined
    } catch (reason) {
      if (!alive()) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setFrame((previous) => (previous ? { ...previous, state: 'disconnected', image: undefined } : null))
      instanceRef.current = undefined
    }
  }

  // Superficie a la vista: una sola solicitud en vuelo, encadenada. El timer
  // se detiene al ocultarla o desmontar.
  useEffect(() => {
    if (!sessionId || !enabled || !active) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const alive = () => !stopped
    async function loop() {
      await requestRef.current(alive)
      if (!stopped) timer = setTimeout(loop, BROWSER_POLL_ACTIVE_MS)
    }
    void loop()
    return () => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [sessionId, targetId, enabled, active])

  // Sonda puntual con la superficie oculta: una consulta, sin temporizadores.
  // Ocultar la superficie no dispara una nueva (`active` no es dependencia).
  useEffect(() => {
    if (!sessionId || !enabled || activeRef.current) return
    let stopped = false
    void requestRef.current(() => !stopped)
    return () => {
      stopped = true
    }
  }, [sessionId, enabled, probe])

  return { frame, error, connectedInstance }
}
