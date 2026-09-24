import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { copyText } from '../../lib/clipboard'
import { engineApi, onEngineEvent } from '../../services/engine'
import { useTerminalStore } from './terminalStore'

/** Colores de la terminal a partir de los tokens del tema activo. */
function themeFromTokens(element: HTMLElement): ITheme {
  const style = getComputedStyle(element)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    background: token('--bg-elevated', '#111116'),
    foreground: token('--text', '#f5f5f6'),
    cursor: token('--accent', '#8b5cf6'),
    cursorAccent: token('--bg-elevated', '#111116'),
    selectionBackground: `${token('--accent', '#8b5cf6')}55`,
  }
}

export interface XtermViewProps {
  ptyId: string
  fontSize: number
  exited: boolean
  /** Tomar el foco al montarse: solo si el usuario la acaba de abrir o elegir. */
  autoFocus?: boolean
}

/**
 * Una terminal xterm conectada a un PTY del Engine.
 *
 * Al montarse repinta con `pty.read` y sigue con los eventos `pty.output`;
 * cada evento lleva el offset de bytes donde termina, así que lo que ya vino
 * en el repintado se descarta. Desmontarla (cambiar de pestaña o cerrar el
 * dock) no cierra el PTY: al volver se repinta igual.
 */
export default function XtermView({ ptyId, fontSize, exited, autoFocus = false }: XtermViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const refitRef = useRef<() => void>(() => undefined)
  const exitedRef = useRef(exited)
  exitedRef.current = exited

  useEffect(() => {
    const element = host.current
    if (!element) return
    const term = new Terminal({
      fontFamily: getComputedStyle(element).getPropertyValue('--font-mono').trim() || 'monospace',
      fontSize,
      cursorBlink: true,
      scrollback: 5000,
      theme: themeFromTokens(element),
      allowProposedApi: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)
    terminal.current = term

    // Ctrl+C con selección copia; Ctrl+V lo pega el navegador (evento paste).
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !event.ctrlKey || event.altKey) return true
      const key = event.key.toLowerCase()
      if (key === 'c' && term.hasSelection()) {
        void copyText(term.getSelection())
        term.clearSelection()
        return false
      }
      if (key === 'v') return false
      return true
    })

    let disposed = false
    let painted = false
    // Mientras xterm procesa el repintado, lo que emite son respuestas a
    // consultas viejas de la salida (ConPTY abre con `ESC[c`). Si llegaran al
    // shell ahora, las leería como tecleo (`^[[?1;2c` en cmd): se descartan.
    let replaying = false
    let lastOffset = 0
    const pending: { data: string; offset: number }[] = []
    const write = (data: string, offset: number) => {
      if (offset <= lastOffset) return
      lastOffset = offset
      term.write(data)
    }

    let unlisten: (() => void) | undefined
    void onEngineEvent((event) => {
      if (event.payload.pty_id !== ptyId) return
      if (event.event === 'pty.output') {
        const chunk = { data: String(event.payload.data ?? ''), offset: Number(event.payload.offset ?? 0) }
        if (painted) write(chunk.data, chunk.offset)
        else pending.push(chunk)
      } else if (event.event === 'pty.exit') {
        useTerminalStore.getState().markExited(ptyId, typeof event.payload.exit_code === 'number' ? event.payload.exit_code : null)
      }
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
      // Repintar después de suscribirse: lo que llegue mientras tanto espera.
      return engineApi.ptyRead(ptyId)
    }).then((snapshot) => {
      if (disposed || !snapshot) return
      replaying = true
      term.write(snapshot.data, () => {
        replaying = false
      })
      lastOffset = snapshot.offset ?? 0
      painted = true
      for (const chunk of pending.splice(0)) write(chunk.data, chunk.offset)
      if (!snapshot.alive) useTerminalStore.getState().markExited(ptyId, snapshot.exit_code)
    }).catch(() => {
      // El Engine ya no conoce este PTY (se reinició): la pestaña queda cerrada.
      if (disposed) return
      painted = true
      useTerminalStore.getState().markExited(ptyId, null)
    })

    const input = term.onData((data) => {
      if (exitedRef.current || replaying) return
      void engineApi.ptyWrite(ptyId, data).catch(() => undefined)
    })

    let size = { cols: 0, rows: 0 }
    let timer: ReturnType<typeof setTimeout> | undefined
    const refit = () => {
      if (element.clientWidth === 0 || element.clientHeight === 0) return
      fit.fit()
      if (term.cols === size.cols && term.rows === size.rows) return
      size = { cols: term.cols, rows: term.rows }
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!exitedRef.current) void engineApi.ptyResize(ptyId, size.cols, size.rows).catch(() => undefined)
      }, 80)
    }
    refitRef.current = refit
    const observer = new ResizeObserver(refit)
    observer.observe(element)
    refit()
    if (autoFocus) term.focus()

    return () => {
      disposed = true
      clearTimeout(timer)
      observer.disconnect()
      input.dispose()
      unlisten?.()
      term.dispose()
      terminal.current = null
      refitRef.current = () => undefined
    }
    // fontSize se aplica abajo sin recrear la terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId])

  useEffect(() => {
    if (!terminal.current || terminal.current.options.fontSize === fontSize) return
    terminal.current.options.fontSize = fontSize
    refitRef.current()
  }, [fontSize])

  return <div ref={host} className="terminal-view" data-testid="xterm-view" data-pty-id={ptyId} />
}
