import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'

/** Cadencia con la superficie del navegador a la vista (transporte de capturas actual). */
export const BROWSER_POLL_ACTIVE_MS = 1_500
/** Cadencia de fondo: solo para saber si el Engine abrió un browser (indicador del dock). */
export const BROWSER_POLL_IDLE_MS = 5_000

export interface BrowserFrameState {
  frame: BrowserFrame | null
  error: string
  /** Un browser conectado que aún no se ha mostrado en esta sesión de UI. */
  connectedInstance: string | null
}

/**
 * Vista del Engine sobre su página controlada (`browser.view.get`), por sesión.
 * El Engine no emite eventos de browser hoy, así que se consulta: con la
 * superficie visible a la cadencia de capturas, en segundo plano a una
 * cadencia baja solo para el indicador. Es transporte de fallback, no el
 * browser nativo del documento 03; abrir la misma URL en otra vista no es
 * integración.
 */
export function useBrowserFrame(sessionId: string, options: { active: boolean; targetId?: string; enabled?: boolean }): BrowserFrameState {
  const { active, targetId = '', enabled = true } = options
  const [frame, setFrame] = useState<BrowserFrame | null>(null)
  const [error, setError] = useState('')
  const [connectedInstance, setConnectedInstance] = useState<string | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (!sessionId || !enabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let instance: string | undefined
    async function poll() {
      try {
        const next = await invoke<BrowserFrame>('browser_view_get', { session_id: sessionId, target_id: targetId || null })
        if (stopped) return
        setFrame(next)
        setError(next.error ?? '')
        if (next.state === 'connected' && next.instance && next.instance !== instance) {
          instance = next.instance
          setConnectedInstance(next.instance)
        }
        if (next.state !== 'connected') instance = undefined
      } catch (reason) {
        if (!stopped) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setFrame((previous) => (previous ? { ...previous, state: 'disconnected', image: undefined } : null))
          instance = undefined
        }
      } finally {
        if (!stopped) timer = setTimeout(poll, activeRef.current ? BROWSER_POLL_ACTIVE_MS : BROWSER_POLL_IDLE_MS)
      }
    }
    void poll()
    return () => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [sessionId, targetId, enabled])

  return { frame, error, connectedInstance }
}
