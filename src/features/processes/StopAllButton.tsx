import { useEffect, useState } from 'react'
import { Square } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { ProcessPresentation } from './processesModel'

/**
 * «Detener todos» (#90): lo que Rinari dejó corriendo en esta conversación.
 * Tus terminales no cuentan. Pide un segundo clic durante unos segundos en
 * vez de abrir un diálogo por cada proceso.
 */
export default function StopAllButton({ items, stop }: { items: readonly ProcessPresentation[]; stop: (id: string) => void }) {
  const { t } = useI18n()
  const [armed, setArmed] = useState(false)
  const stoppable = items.filter((item) => item.resource.running && item.resource.can_stop && item.resource.kind !== 'pty')
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 4_000)
    return () => window.clearTimeout(timer)
  }, [armed])
  if (stoppable.length < 2) return null
  return (
    <button
      type="button"
      data-testid="processes-stop-all"
      data-armed={armed || undefined}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        setArmed(false)
        for (const item of stoppable) stop(item.resource.id)
      }}
      className="processes-action processes-action-stop"
    >
      <Square size={11} aria-hidden="true" />
      {armed ? t('processes.stopAllConfirm', { n: stoppable.length }) : t('processes.stopAll')}
    </button>
  )
}
