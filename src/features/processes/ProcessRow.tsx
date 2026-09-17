import { useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, Square } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useProcessesMotion, PROCESSES_DURATION } from './processMotion'
import {
  deriveStatusKey,
  durationMs,
  elapsedMsSinceStarted,
  formatElapsedShort,
  kindLabelKey,
  readinessLabelKey,
  resourceTitle,
  statusTextKey,
  type ProcessPresentation,
  type StopOperation,
} from './processesModel'

import { platform } from '../../platform'
function statusColor(key: ReturnType<typeof deriveStatusKey>): string {
  switch (key) {
    case 'running':
      return 'var(--success)'
    case 'finished_error':
      return 'var(--danger)'
    case 'unverified':
    case 'unknown':
      return 'var(--warning)'
    default:
      return 'var(--text-subtle)'
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (parsed.username !== '' || parsed.password !== '') return false
    return true
  } catch {
    return false
  }
}

/**
 * Fila compacta de un recurso. El disclosure y las acciones son botones
 * hermanos: nunca se anida Detener/Abrir dentro de otro button.
 */
export default function ProcessRow({
  presentation,
  detailId,
  expanded,
  stopState,
  now,
  online = true,
  stopConfirmed = false,
  onToggle,
  onStop,
}: {
  presentation: ProcessPresentation
  detailId: string
  expanded: boolean
  stopState: StopOperation
  now: number
  online?: boolean
  stopConfirmed?: boolean
  onToggle: () => void
  onStop: () => void
}) {
  const { t } = useI18n()
  const [urlError, setUrlError] = useState('')
  const motionApi = useProcessesMotion()
  const { resource } = presentation
  const name = resourceTitle(resource) ?? t('processes.untitled')
  const statusKey = deriveStatusKey(resource, { online, stopConfirmed })
  const statusLabel = t(
    statusTextKey(statusKey),
    statusKey === 'finished_error' ? { code: resource.exit_code ?? 0 } : undefined,
  )
  const elapsed = resource.running ? elapsedMsSinceStarted(resource.started_at, now) : null
  const finishedSpan = !resource.running ? durationMs(resource, now) : null
  const readinessKey = readinessLabelKey(resource.readiness)
  const stopping = stopState.state === 'requesting' || stopState.state === 'reconciling'
  const validUrl = typeof resource.url === 'string' && isHttpUrl(resource.url) ? resource.url : null

  return (
    <motion.li
      className="processes-row"
      data-resource-id={resource.id}
      layout="position"
      initial={{ opacity: 0, y: motionApi.enterY(6) }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={motionApi.transition(PROCESSES_DURATION.rowEnter)}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
        aria-label={t(expanded ? 'processes.hideOutput' : 'processes.viewOutput', { name })}
        className="processes-row-main"
      >
        <span aria-hidden="true" className="processes-dot" style={{ background: statusColor(statusKey) }} />
        <span className="processes-row-text">
          <span className="processes-row-name" title={resource.command}>
            {name}
          </span>
          <span className="processes-row-meta">
            {statusLabel}
            {elapsed != null && ` · ${formatElapsedShort(elapsed)}`}
            {finishedSpan != null && ` · ${formatElapsedShort(finishedSpan)}`}
            {readinessKey != null && ` · ${t(readinessKey)}`}
            {resource.pid != null && ` · PID ${resource.pid}`}
            {resource.kind !== 'process' && ` · ${t(kindLabelKey(resource.kind))}`}
          </span>
        </span>
        <span aria-hidden="true" className={`processes-chevron${expanded ? ' open' : ''}`}>
          ▾
        </span>
      </button>
      <span className="processes-row-actions">
        {validUrl && (
          <button
            type="button"
            aria-label={t('processes.openUrl', { url: validUrl })}
            title={validUrl}
            onClick={() => {
              setUrlError('')
              void platform().opener.openUrl(validUrl).catch((reason: unknown) =>
                setUrlError(reason instanceof Error ? reason.message : String(reason)),
              )
            }}
            className="processes-action"
          >
            <ExternalLink size={13} />
          </button>
        )}
        {resource.can_stop && (
          <button
            type="button"
            aria-label={t('processes.stop', { name })}
            disabled={stopping}
            onClick={onStop}
            className="processes-action processes-action-stop"
          >
            <Square size={11} />
            {stopping ? t('processes.stopping') : t('processes.stopShort')}
          </button>
        )}
      </span>
      {urlError && (
        <p role="alert" className="processes-row-error">
          {urlError}
        </p>
      )}
    </motion.li>
  )
}
