import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Globe, X } from 'lucide-react'

import type { BrowserView as BrowserFrame } from '../../types/protocol.generated'

import { useUIStore } from '../../stores/ui'

/** A view of the engine's CDP page, not a second web runtime. */
export default function BrowserPanel({ sessionId }: { sessionId: string }) {
  const [frame, setFrame] = useState<BrowserFrame | null>(null)
  const [visible, setVisible] = useState(false)
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let instance: string | undefined
    let connected = false
    async function poll() {
      try {
        const next = await invoke<BrowserFrame>('browser_view_get', { session_id: sessionId, target_id: target || null })
        if (stopped) return
        setFrame(next)
        setError(next.error ?? '')
        if (next.state === 'connected' && next.instance && (!connected || next.instance !== instance)) {
          instance = next.instance
          // No robar el espacio al inspector de procesos: con inspector
          // abierto en esta sesión no hay autoapertura; el acceso sigue
          // disponible y abrirlo manualmente contrae los logs.
          if (useUIStore.getState().processesInspectorFor !== sessionId) {
            setVisible(true)
          }
        }
        connected = next.state === 'connected'
      } catch (reason) {
        if (!stopped) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setFrame(previous => previous ? { ...previous, state: 'disconnected', image: undefined } : null)
          connected = false
        }
      } finally {
        if (!stopped) timer = setTimeout(poll, 1500)
      }
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [sessionId, target])

  if (!visible) return frame?.instance ? <button className="fixed right-5 top-16 z-30 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs text-[var(--text)]" onClick={() => { setVisible(true); window.dispatchEvent(new Event('rinari-browser-open')) }}><Globe size={15} />Navegador</button> : null
  return <aside aria-label="Navegador de Rinari" className="fixed bottom-5 right-5 top-16 z-40 flex w-[min(720px,80vw)] min-w-72 resize-x flex-col overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
    <header className="flex items-center gap-2 border-b border-[var(--border)] p-3 text-sm text-[var(--text)]">
      <Globe size={16} /><strong>Navegador</strong>
      <span className="text-xs text-[var(--text-muted)]">{frame?.state === 'connected' ? 'Vista en vivo' : 'Desconectado'}</span>
      <button className="ml-auto" aria-label="Cerrar panel del navegador" onClick={() => setVisible(false)}><X size={16} /></button>
    </header>
    {(frame?.pages?.length ?? 0) > 1 && <select aria-label="Pestaña del navegador" className="m-2 rounded bg-[var(--bg-subtle)] p-2 text-sm text-[var(--text)]" value={frame?.target_id ?? ''} onChange={e => setTarget(e.target.value)}>
      {frame?.pages?.map(page => <option key={page.target_id} value={page.target_id}>{page.title || page.url}</option>)}
    </select>}
    <div className="break-all border-b border-[var(--border)] p-2 text-xs text-[var(--text-muted)]">{frame?.url || 'Esperando página…'}</div>
    {error && <p role="alert" className="p-3 text-sm text-amber-400">{error}</p>}
    <div className="min-h-0 flex-1 overflow-auto bg-neutral-950">
      {frame?.image?.startsWith('data:image/jpeg;base64,') && <img src={frame.image} alt="Página controlada por el motor de Rinari" className="w-full" />}
    </div>
    <footer className="flex items-center justify-between gap-3 p-3 text-xs text-[var(--text-muted)]">
      <span>Observa las acciones del agente. Para interactuar manualmente, abre la página fuera.</span>
      {frame?.url && /^https?:\/\//i.test(frame.url) && <button className="shrink-0 underline" onClick={() => void openUrl(frame.url!).catch(reason => setError(String(reason)))}>Abrir fuera</button>}
    </footer>
  </aside>
}
