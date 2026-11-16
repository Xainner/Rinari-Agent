import { Maximize2, Minimize2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { RinariAvatar, type RinariState } from '../rinari/RinariAvatar'

/**
 * Cabecera de la conversación de Presencia: quién es, qué pasa en los chats
 * ahora mismo (solo lo que el Engine informa) y «Entrar» / «Salir» del modo a
 * pantalla completa.
 */
export default function PresenceBar({ working, waiting, full, onToggleFull }: {
  /** Chats con un turno en curso. */
  working: number
  /** Chats que esperan una respuesta o aprobación del dueño. */
  waiting: number
  full: boolean
  onToggleFull: () => void
}) {
  const { t } = useI18n()
  const state: RinariState = waiting > 0 ? 'waiting' : working > 0 ? 'working' : 'idle'
  const parts = [
    working > 0 ? t(working === 1 ? 'presence.status.workingOne' : 'presence.status.working', { n: working }) : null,
    waiting > 0 ? t(waiting === 1 ? 'presence.status.waitingOne' : 'presence.status.waiting', { n: waiting }) : null,
  ].filter(Boolean)
  const status = parts.length > 0 ? parts.join(' · ') : t('presence.status.calm')
  return (
    <header className="presence-bar" data-testid="presence-bar" data-full={full ? '' : undefined}>
      <RinariAvatar state={state} size={32} />
      <div className="min-w-0 flex-1">
        <p className="presence-bar-name">{t('rinari.name')}</p>
        <p className="presence-bar-status" role="status" data-testid="presence-status">{status}</p>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onToggleFull}
        aria-pressed={full}
        data-testid="presence-full-toggle"
      >
        {full ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
        <span>{t(full ? 'presence.leave' : 'presence.enter')}</span>
      </button>
    </header>
  )
}
