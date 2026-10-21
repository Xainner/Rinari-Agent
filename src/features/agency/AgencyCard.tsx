import { ArrowLeft } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import agencyIcon from '../../assets/agency/agency-icon.webp'
import type { AgencyStatus } from './types'

interface AgencyCardProps {
  /** `enter` en Rinari (abre la Agency); `leave` dentro de la Agency (vuelve a Rinari). */
  mode: 'enter' | 'leave'
  status: AgencyStatus | null
  onClick: () => void
  /** Rail colapsado: solo el ícono, con su nombre como etiqueta. */
  compact?: boolean
}

/** La línea de estado: lo que pasa ahora, o cuántos agentes hay (D-17). */
export function agencyStatusLine(status: AgencyStatus | null, t: ReturnType<typeof useI18n>['t']): string {
  if (!status) return ''
  if (status.agents === 0) return t('agency.card.first')
  const parts: string[] = []
  if (status.working > 0) parts.push(t('agency.card.working', { n: status.working }))
  if (status.needs_you > 0) {
    parts.push(status.needs_you === 1 ? t('agency.card.needsYou', { n: 1 }) : t('agency.card.needsYouMany', { n: status.needs_you }))
  }
  if (parts.length > 0) return parts.join(' · ')
  return status.agents === 1 ? t('agency.card.calmOne') : t('agency.card.calm', { n: status.agents })
}

/**
 * La tarjeta «Rinari Agency» (sección 2 del plan): abajo a la izquierda, a lo
 * ancho, encima de Ajustes. El único acento es el ámbar de «te necesita».
 */
export default function AgencyCard({ mode, status, onClick, compact = false }: AgencyCardProps) {
  const { t } = useI18n()
  const label = mode === 'enter' ? t('agency.card.enter') : t('agency.card.leave')
  const line = mode === 'enter' ? agencyStatusLine(status, t) : ''
  const needsYou = mode === 'enter' && (status?.needs_you ?? 0) > 0

  if (compact) {
    return (
      <button
        type="button"
        className="agency-card agency-card-compact"
        onClick={onClick}
        aria-label={line ? `${label} · ${line}` : label}
        title={label}
        data-testid="agency-card"
        data-mode={mode}
      >
        {mode === 'leave'
          ? <ArrowLeft size={17} aria-hidden="true" className="agency-card-back-icon" />
          : <img src={agencyIcon} alt="" className="agency-card-icon" draggable={false} />}
        {needsYou && <span className="agency-card-dot" aria-hidden="true" />}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn('agency-card', mode === 'leave' && 'is-leave')}
      onClick={onClick}
      aria-label={line ? `${label} · ${line}` : label}
      data-testid="agency-card"
      data-mode={mode}
    >
      {mode === 'leave' ? (
        <span className="agency-card-back" aria-hidden="true"><ArrowLeft size={15} /></span>
      ) : (
        <img src={agencyIcon} alt="" className="agency-card-icon" draggable={false} />
      )}
      <span className="agency-card-text">
        <span className="agency-card-title">{mode === 'enter' ? t('agency.name') : label}</span>
        {line && (
          <span className={cn('agency-card-line', needsYou && 'is-attention')}>{line}</span>
        )}
      </span>
    </button>
  )
}
