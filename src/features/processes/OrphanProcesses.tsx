import { useCallback, useEffect, useState } from 'react'
import { Square } from 'lucide-react'
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
    <section data-testid="orphan-processes" aria-label={t('processes.orphans.title')} className="processes-orphans rounded-xl border border-[var(--border)] p-3 text-[12.5px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 font-medium text-[var(--text)]">{t('processes.orphans.title')} · {shown.length}</span>
        {shown.length > 1 && (
          <button type="button" disabled={busy} onClick={() => void stop(shown.map((item) => item.id))} className="processes-action processes-action-stop">
            <Square size={11} aria-hidden="true" /> {t('processes.stopAll')}
          </button>
        )}
      </div>
      <p className="mt-1 text-[11.5px] text-[var(--text-subtle)]">{t('processes.orphans.hint')}</p>
      <ul className="mt-2 space-y-1.5">
        {shown.map((item) => (
          <li key={item.id} data-orphan-id={item.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--text)]" title={item.command}>
              {item.name || item.command}
            </span>
            {typeof item.port === 'number' && <span className="font-mono text-[11px] text-[var(--text-muted)]">:{item.port}</span>}
            <span className="text-[11px] text-[var(--text-subtle)]">PID {item.pid}</span>
            {!onlySession && sessionId && item.session_id !== sessionId && (
              <span className="text-[11px] text-[var(--text-subtle)]">{t('processes.orphans.otherChat')}</span>
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
