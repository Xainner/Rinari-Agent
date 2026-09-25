import { Bot, ChevronDown, Plus, SquareTerminal, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { engineApi, type PtyShell } from '../../services/engine'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu'
import { nextTerminalTitle, useTerminalPrefs, useTerminalStore, type TerminalTab } from './terminalStore'
import XtermView from './XtermView'
import AgentProcesses from './AgentProcesses'
import { AGENT_TAB, useAgentRunningCount } from './agentTab'

const EMPTY: readonly TerminalTab[] = []
/** Sesiones cuya primera terminal ya se abrió sola: cerrar la última no la reabre. */
const autoStarted = new Set<string>()

/** Solo tests. */
export function resetTerminalPanelForTests(): void {
  autoStarted.clear()
  shellsCache = null
}

let shellsCache: Promise<{ shells: PtyShell[]; supported: boolean }> | null = null
function loadShells() {
  shellsCache ??= engineApi.ptyShells().catch((error) => {
    shellsCache = null
    throw error
  })
  return shellsCache
}

/**
 * La terminal del usuario en el dock de la sesión: pestañas, cada una un PTY
 * del Engine en la carpeta de la sesión. El modelo no escribe aquí.
 */
export default function TerminalPanel({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const tabs = useTerminalStore((state) => state.bySession[sessionId] ?? EMPTY)
  const activeId = useTerminalStore((state) => state.active[sessionId])
  const { add, remove, select, rename } = useTerminalStore.getState()
  const prefs = useTerminalPrefs((state) => state.prefs)
  const [shells, setShells] = useState<PtyShell[]>([])
  const [supported, setSupported] = useState(true)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  // La terminal que el usuario acaba de abrir o elegir toma el foco al montarse.
  const [focusPty, setFocusPty] = useState<string | null>(null)
  // La pestaña «Rinari» (lo que lanzó el agente) o una de tus terminales.
  const agentActive = activeId === AGENT_TAB
  const active = agentActive ? undefined : (tabs.find((tab) => tab.ptyId === activeId) ?? tabs[0])
  const agentRunning = useAgentRunningCount(sessionId)

  const start = useCallback(
    async (shell?: PtyShell, options: { automatic?: boolean } = {}) => {
      setError('')
      setStarting(true)
      try {
        const catalog = await loadShells()
        if (!catalog.supported) {
          setSupported(false)
          return
        }
        const chosen = shell ?? catalog.shells.find((item) => item.id === prefs.shellId) ?? catalog.shells[0]
        const fontSize = useTerminalPrefs.getState().prefs.fontSize
        // Tamaño aproximado; la terminal se ajusta al montarse y lo corrige.
        const width = body.current?.clientWidth || 640
        const height = body.current?.clientHeight || 360
        const started = await engineApi.ptyStart({
          sessionId,
          command: chosen?.command,
          columns: Math.max(20, Math.floor(width / (fontSize * 0.6))),
          rows: Math.max(5, Math.floor(height / (fontSize * 1.3))),
        })
        const current = useTerminalStore.getState().bySession[sessionId] ?? EMPTY
        // Una apertura automática no le quita la pestaña elegida (p. ej. «Rinari»).
        if (!options.automatic) setFocusPty(started.pty_id)
        add(sessionId, { ptyId: started.pty_id, title: nextTerminalTitle(chosen?.label ?? t('terminal.tab'), current) }, { select: !options.automatic })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setStarting(false)
      }
    },
    [add, prefs.shellId, sessionId, t],
  )

  // Al abrir el panel: el catálogo de shells y, si esta sesión no tiene
  // pestañas, adoptar sus PTY vivos (recarga de ventana) o abrir el primero.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const catalog = await loadShells()
        if (cancelled) return
        setShells(catalog.shells)
        setSupported(catalog.supported)
        if (!catalog.supported) return
        if ((useTerminalStore.getState().bySession[sessionId] ?? EMPTY).length > 0) return
        const listed = await engineApi.ptyList()
        if (cancelled) return
        const alive = listed.ptys.filter((pty) => pty.alive && pty.session_id === sessionId)
        for (const pty of alive) {
          const current = useTerminalStore.getState().bySession[sessionId] ?? EMPTY
          const label = catalog.shells.find((shell) => shell.command === pty.command)?.label ?? t('terminal.tab')
          add(sessionId, { ptyId: pty.pty_id, title: nextTerminalTitle(label, current) }, { select: false })
        }
        if (alive.length === 0 && !autoStarted.has(sessionId)) {
          autoStarted.add(sessionId)
          await start(undefined, { automatic: true })
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
    // Solo al montar o cambiar de sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const close = async (tab: TerminalTab) => {
    remove(sessionId, tab.ptyId)
    if (!tab.exited) await engineApi.ptyTerminate(tab.ptyId).catch(() => undefined)
  }

  if (!supported) {
    return (
      <div className="terminal-panel terminal-empty" data-testid="terminal-panel">
        <p className="text-sm text-[var(--text-muted)]">{t('terminal.unsupported')}</p>
      </div>
    )
  }

  return (
    <div className="terminal-panel" data-testid="terminal-panel">
      <div className="terminal-tabs">
        <div className="terminal-tab-list" role="tablist" aria-label={t('terminal.tabs')}>
        <div className={cn('terminal-tab', agentActive && 'is-active')}>
          <button
            type="button"
            role="tab"
            aria-selected={agentActive}
            title={t('terminal.agentTabHint')}
            onClick={() => select(sessionId, AGENT_TAB)}
            className="terminal-tab-label pr-2"
          >
            <Bot size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{t('terminal.agentTab')}</span>
            {agentRunning > 0 && <span className="terminal-tab-badge" aria-label={t('terminal.agentRunning', { n: agentRunning })}>{agentRunning}</span>}
          </button>
        </div>
        {tabs.map((tab) => (
          <div key={tab.ptyId} className={cn('terminal-tab', tab.ptyId === active?.ptyId && 'is-active', tab.exited && 'is-exited')}>
            {editing === tab.ptyId ? (
              <input
                autoFocus
                aria-label={t('terminal.rename')}
                defaultValue={tab.title}
                className="terminal-tab-input"
                onBlur={(event) => {
                  rename(sessionId, tab.ptyId, event.currentTarget.value)
                  setEditing(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={tab.ptyId === active?.ptyId}
                title={`${tab.title} · ${t('terminal.renameHint')}`}
                onClick={() => {
                  setFocusPty(tab.ptyId)
                  select(sessionId, tab.ptyId)
                }}
                onDoubleClick={() => setEditing(tab.ptyId)}
                className="terminal-tab-label"
              >
                <SquareTerminal size={12} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{tab.title}</span>
              </button>
            )}
            <button type="button" aria-label={t('terminal.close', { name: tab.title })} title={t('terminal.close', { name: tab.title })} onClick={() => void close(tab)} className="terminal-tab-close">
              <X size={12} />
            </button>
          </div>
        ))}
        </div>
        <button type="button" aria-label={t('terminal.new')} title={t('terminal.new')} disabled={starting} onClick={() => void start()} className="pane-header-icon">
          <Plus size={14} />
        </button>
        {shells.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={t('terminal.newWith')} title={t('terminal.newWith')} disabled={starting} className="pane-header-icon">
                <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {shells.map((shell) => (
                <DropdownMenuItem key={shell.id} onSelect={() => void start(shell)}>
                  {shell.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {error && (
        <p role="alert" className="terminal-error">
          {error}
        </p>
      )}
      <div ref={body} className="terminal-body">
        {agentActive ? (
          <AgentProcesses sessionId={sessionId} />
        ) : active ? (
          <>
            <XtermView key={active.ptyId} ptyId={active.ptyId} fontSize={prefs.fontSize} exited={active.exited} autoFocus={focusPty === active.ptyId} />
            {active.exited && (
              <div className="terminal-exited" role="status">
                {active.exitCode === null ? t('terminal.exited') : t('terminal.exitedCode', { code: active.exitCode })}
              </div>
            )}
          </>
        ) : (
          !starting && (
            <div className="terminal-empty">
              <button type="button" onClick={() => void start()} className="terminal-start">
                <Plus size={14} aria-hidden="true" />
                {t('terminal.new')}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  )
}
