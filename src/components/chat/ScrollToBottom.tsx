import { useId } from 'react'
import { ArrowDown } from 'lucide-react'
import { useI18n } from '../../i18n'

/**
 * «Ir al final» (plan 0.4.0 #89): un botón de vidrio anclado sobre el
 * composer. Mientras Rinari trabaja, en vez de la flecha salen tres puntos
 * que saltan en ola (quietos con movimiento reducido), con la misma función;
 * si Rinari espera una aprobación, un punto ámbar lo dice. Con un resultado
 * sin leer fuera de la vista (#62) se vuelve la píldora «↓ Nuevo resultado».
 * El nombre del botón no cambia (las pruebas y los lectores lo buscan así):
 * el estado va en su descripción.
 */
export default function ScrollToBottom({
  visible,
  onClick,
  working = false,
  needsYou = false,
  newResult = false,
}: {
  visible: boolean
  onClick: () => void
  working?: boolean
  needsYou?: boolean
  /** Hay un resultado sin leer más abajo. */
  newResult?: boolean
}) {
  const { t } = useI18n()
  const described = useId()
  if (!visible) return null
  const state = needsYou ? t('scroll.needsYou') : newResult ? t('scroll.newResult') : working ? t('scroll.working') : null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('scroll.bottom')}
      aria-describedby={state ? described : undefined}
      title={state ? `${t('scroll.bottom')} · ${state}` : t('scroll.bottom')}
      className="scroll-bottom"
      data-working={(working && !newResult) || undefined}
      data-new={newResult || undefined}
      data-needs-you={needsYou || undefined}
    >
      <span className="scroll-bottom-arrow" aria-hidden="true"><ArrowDown size={16} /></span>
      <span className="scroll-bottom-dots" aria-hidden="true"><i /><i /><i /></span>
      {newResult && <span className="scroll-bottom-label" aria-hidden="true">{t('scroll.newResult')}</span>}
      {needsYou && <span className="scroll-bottom-flag" aria-hidden="true" />}
      {state && <span id={described} className="sr-only">{state}</span>}
    </button>
  )
}
