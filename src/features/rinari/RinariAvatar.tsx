import { art, type Expression } from './art'
import { useI18n, type I18nKey } from '../../i18n'
import { cn } from '../../lib/utils'

/**
 * Estado que muestra Rinari. Sale siempre de un estado real (turno, Engine,
 * dictado): la expresión acompaña, nunca adorna ni sustituye al texto.
 */
export type RinariState = 'idle' | 'listening' | 'thinking' | 'working' | 'streaming' | 'waiting' | 'done' | 'error' | 'offline'

const EXPRESSION: Record<RinariState, Expression> = {
  idle: 'idle',
  listening: 'listen',
  thinking: 'think',
  working: 'focused',
  streaming: 'idle',
  waiting: 'ask',
  done: 'proud',
  error: 'pout',
  offline: 'sleepy',
}

export const rinariStateLabel = (state: RinariState): I18nKey => `rinari.state.${state}` as I18nKey

/**
 * Avatar de Rinari con su expresión. `decorative` lo oculta a lectores de
 * pantalla cuando el estado ya se dice en texto al lado (lo habitual).
 */
export function RinariAvatar({ state = 'idle', size = 28, decorative = true, className }: {
  state?: RinariState
  size?: number
  decorative?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const label = t(rinariStateLabel(state))
  const busy = state === 'thinking' || state === 'streaming'
  return (
    <span
      className={cn('rinari-avatar', className)}
      data-state={state}
      style={{ width: size, height: size }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      <img key={EXPRESSION[state]} src={art.expression(EXPRESSION[state])} alt="" draggable={false} />
      {state === 'working' && <span className="rinari-avatar-orbit" />}
      {busy && size >= 26 && <span className="rinari-avatar-dots"><i /><i /><i /></span>}
    </span>
  )
}
