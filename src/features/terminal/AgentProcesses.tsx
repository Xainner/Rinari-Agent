import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import ProcessInspector from '../processes/ProcessInspector'
import ProcessStopDialog from '../processes/ProcessStopDialog'
import { stopResultKey } from '../processes/processesModel'
import { useSessionProcesses } from '../processes/useSessionProcesses'

/**
 * Lo que Rinari lanzó en esta conversación (servidores, pruebas, vistas
 * previas), dentro del panel Terminal: la lista, la salida en vivo y Detener.
 * Es de solo lectura; tus terminales (PTY) no aparecen aquí porque ya tienen
 * su pestaña interactiva. Detener reverifica el recurso como antes.
 */
export default function AgentProcesses({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const [logPaused, setLogPaused] = useState(false)
  const snap = useSessionProcesses(sessionId, { observeOutput: !logPaused })
  const ordered = useMemo(() => snap.ordered.filter((item) => item.resource.kind !== 'pty'), [snap.ordered])
  const confirmedIds = useMemo(() => new Set(snap.confirmedIds), [snap.confirmedIds])
  const [stopTargetId, setStopTargetId] = useState<string | null>(null)
  const [stopEpoch, setStopEpoch] = useState<number | null>(null)
  const [stopStaleNote, setStopStaleNote] = useState(false)

  const stopTarget = stopTargetId != null ? (ordered.find((item) => item.resource.id === stopTargetId) ?? null) : null
  const stopState = stopTargetId != null ? (snap.stopById.get(stopTargetId) ?? { state: 'idle' as const }) : { state: 'idle' as const }
  const stopBusy = stopState.state === 'requesting' || stopState.state === 'reconciling'
  const stopResultMessageKey = stopResultKey(stopState)
  const clearStop = () => {
    setStopTargetId(null)
    setStopEpoch(null)
    setStopStaleNote(false)
  }
  useEffect(() => {
    if (stopTargetId != null && stopState.state === 'confirmed') clearStop()
  }, [stopTargetId, stopState.state])
  useEffect(() => {
    // La época cambió: se exige nueva observación y nueva confirmación.
    if (stopTargetId != null && stopEpoch != null && snap.epoch !== stopEpoch) clearStop()
  }, [stopTargetId, stopEpoch, snap.epoch])

  function requestStop(id: string) {
    setStopStaleNote(false)
    setStopEpoch(snap.epoch)
    setStopTargetId(id)
    snap.refresh()
  }

  function confirmStop() {
    if (stopTargetId == null) return
    if (stopEpoch == null || snap.epoch !== stopEpoch) {
      snap.refresh()
      setStopStaleNote(true)
      return
    }
    const current = snap.readFresh().ordered.find((item) => item.resource.id === stopTargetId)
    if (!current || !current.resource.running || !current.resource.can_stop || Date.now() - current.lastVerifiedAt > 10_000) {
      snap.refresh()
      setStopStaleNote(true)
      return
    }
    void snap.stop(stopTargetId)
  }

  if (snap.freshness === 'unsupported' || (snap.freshness === 'offline' && ordered.length === 0)) {
    return (
      <p className="terminal-empty text-sm text-[var(--text-muted)]">
        {snap.freshness === 'unsupported' ? t('processes.unsupported') : t('processes.offline')}
      </p>
    )
  }
  if (ordered.length === 0) {
    return <p className="terminal-empty text-sm text-[var(--text-muted)]">{t('terminal.agentEmpty')}</p>
  }

  return (
    <div className="terminal-agent" data-testid="terminal-agent-processes">
      <ProcessInspector
        sessionId={sessionId}
        ordered={ordered}
        selectedId={snap.selectedId}
        selectedOutput={snap.selectedOutput}
        selectedMissing={snap.selectedMissing}
        readError={snap.readError}
        stopById={snap.stopById}
        listTruncated={snap.listTruncated}
        freshness={snap.freshness}
        listError={snap.listError}
        pinnedId={snap.pinnedId}
        online={snap.freshness !== 'offline'}
        confirmedIds={confirmedIds}
        logPaused={logPaused}
        onLogPausedChange={setLogPaused}
        onSelect={(id) => {
          setLogPaused(false)
          snap.select(id)
        }}
        onStopRequest={requestStop}
        onAcknowledge={(id) => snap.acknowledge(id)}
        onDismiss={(id) => snap.dismiss(id)}
        onPin={(id) => snap.pin(id)}
        onRefresh={() => snap.refresh()}
      />
      <ProcessStopDialog
        target={
          stopTarget
            ? { id: stopTarget.resource.id, command: stopTarget.resource.command, cwd: stopTarget.resource.cwd, lastVerifiedAt: stopTarget.lastVerifiedAt }
            : null
        }
        stale={stopStaleNote}
        busy={stopBusy}
        resultMessage={stopResultMessageKey !== null ? t(stopResultMessageKey) : null}
        onConfirm={confirmStop}
        onCancel={clearStop}
      />
    </div>
  )
}
