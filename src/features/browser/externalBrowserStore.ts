import { create } from 'zustand'
import { toast } from 'sonner'

import { translate } from '../../i18n'
import { useUIStore } from '../../stores/ui'

/**
 * Una sesión que sigue en un Chrome o Edge de verdad (plan 0.4.0 #45): lo que
 * dijo el Engine la última vez (`browser.external.changed`). Abrirlo tarda
 * unos segundos, así que la tarjeta pinta «Abriendo…» hasta que llega.
 */
export interface ExternalBrowserState {
  state: 'opening' | 'open' | 'failed'
  url?: string
  error?: string
}

export const useExternalBrowserStore = create<{
  bySession: Record<string, ExternalBrowserState>
  set: (sessionId: string, next: ExternalBrowserState) => void
}>((set) => ({
  bySession: {},
  set: (sessionId, next) => set((current) => ({ bySession: { ...current.bySession, [sessionId]: next } })),
}))

export function applyExternalBrowserEvent(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const data = payload as { session_id?: unknown; state?: unknown; url?: unknown; error?: { message?: unknown } }
  if (typeof data.session_id !== 'string') return
  if (data.state !== 'open' && data.state !== 'failed') return
  const error = typeof data.error?.message === 'string' ? data.error.message : undefined
  useExternalBrowserStore.getState().set(data.session_id, {
    state: data.state,
    url: typeof data.url === 'string' ? data.url : undefined,
    error,
  })
  if (data.state === 'failed') toast.error(translate(useUIStore.getState().lang, 'browser.humanCheck.externalFailed', { error: error ?? '' }))
}
