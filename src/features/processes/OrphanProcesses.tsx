import { useCallback, useEffect, useState } from 'react'
import { Square, SquareTerminal, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage } from '../../services/engine'
import { processesApi, type OrphanProcess } from '../../services/processes'
import { useOptionalEngineData } from '../engine/EngineContext'

/**
 * Procesos que lanzó un Engine anterior (la app se cerró, se reinició o se
 * cayó) y siguen vivos (#90). El Engine los reconoce por pid y hora de
 * inicio, así que un pid reutilizado no aparece. Detener mata su árbol.
 *
 * `sessionId` con `onlySession`: solo los de esta conversación (el dock);
 * sin él, todos, marcando los de otras conversaciones (panel Terminal).
 */
export default function OrphanProcesses({ sessionId, onlySession = false }: { sessionId?: string; onlySession?: boolean }) {
  const { t } = useI18n()
  const data = useOptionalEngineData()
  const [orphans, setOrphans] = useState<OrphanProcess[]>([])
  const [busy, setBusy] = useState(false)
  const ready = data?.ready ?? true
  const generation = data?.engineGeneration

  const load = useCallback(() => {
    void processesApi.orphans().then(setOrphans).catch(() => setOrphans([]))
  }, [])
  // Un Engine nuevo es justo cuando aparecen.
  useEffect(() => {
    if (ready) load()
  }, [load, ready, generation])

  const shown = onlySession ? orphans.filter((item) => item.session_id === sessionId) : orphans
  if (shown.length === 0) return null

  const stop = async (ids: string[]) => {
    setBusy(true)
    try {
      for (const id of ids) await processesApi.stopOrphan(id)
    } catch (error) {
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
      load()
    }
  }

  return (
    <section data-testid="orphan-processes" aria-label={t('processes.orphans.title')} className="orphans">
      <header className="orphans-head">
        <span className="orphans-icon" aria-hidden="true"><TriangleAlert size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className="orphans-title">{t('processes.orphans.title')} · {shown.length}</p>
          <p className="orphans-hint">{t('processes.orphans.hint')}</p>
        </div>
        {shown.length > 1 && (
          <button type="button" disabled={busy} onClick={() => void stop(shown.map((item) => item.id))} className="processes-action processes-action-stop">
            <Square size={11} aria-hidden="true" /> {t('processes.stopAll')}
          </button>
        )}
      </header>
      <ul className="orphans-list">
        {shown.map((item) => (
          <li key={item.id} data-orphan-id={item.id} className="orphans-row">
            <SquareTerminal size={13} aria-hidden="true" className="shrink-0 text-[var(--text-subtle)]" />
            <span className="orphans-command" title={item.command}>
              {item.name || item.command}
            </span>
            {typeof item.port === 'number' && <span className="r-chip orphans-port" data-tone="accent">:{item.port}</span>}
            <span className="orphans-pid">PID {item.pid}</span>
            {!onlySession && sessionId && item.session_id !== sessionId && (
              <span className="r-chip">{t('processes.orphans.otherChat')}</span>
            )}
            <button type="button" disabled={busy} onClick={() => void stop([item.id])} aria-label={t('processes.stop', { name: item.name || item.command })} className="processes-action processes-action-stop">
              <Square size={11} aria-hidden="true" /> {t('processes.stopShort')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
