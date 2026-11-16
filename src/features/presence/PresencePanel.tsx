import { Bell, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'

export interface PresenceChat {
  id: string
  title: string
  /** Proyecto de la conversación, si tiene. */
  project: string | null
}

/**
 * Panel del modo completo de Presencia: lo que espera al dueño y lo que está
 * trabajando, en todos los chats. Cada fila abre su chat. Solo muestra lo que
 * el Engine informa hoy; encargos y lo que hizo sola llegan con la autonomía.
 */
export default function PresencePanel({ waiting, working, onOpen }: {
  waiting: PresenceChat[]
  working: PresenceChat[]
  onOpen: (sessionId: string) => void
}) {
  const { t } = useI18n()
  return (
    <aside className="presence-panel" aria-label={t('presence.panel')} data-testid="presence-panel">
      <Group
        testId="presence-waiting"
        icon={<Bell size={14} aria-hidden="true" />}
        title={t('presence.panel.waiting')}
        empty={t('presence.panel.waitingEmpty')}
        chats={waiting}
        onOpen={onOpen}
        untitled={t('sidebar.newChat')}
      />
      <Group
        testId="presence-working"
        icon={<LoaderCircle size={14} aria-hidden="true" className={working.length > 0 ? 'motion-safe:animate-spin' : undefined} />}
        title={t('presence.panel.working')}
        empty={t('presence.panel.workingEmpty')}
        chats={working}
        onOpen={onOpen}
        untitled={t('sidebar.newChat')}
      />
    </aside>
  )
}

function Group({ testId, icon, title, empty, chats, onOpen, untitled }: {
  testId: string
  icon: ReactNode
  title: string
  empty: string
  chats: PresenceChat[]
  onOpen: (sessionId: string) => void
  untitled: string
}) {
  return (
    <section className="presence-group" data-testid={testId}>
      <h2 className="presence-group-title">
        {icon}
        <span>{title}</span>
        {chats.length > 0 && <span className="presence-count">{chats.length}</span>}
      </h2>
      {chats.length === 0 ? (
        <p className="presence-empty">{empty}</p>
      ) : (
        <ul className="presence-list">
          {chats.map((chat) => (
            <li key={chat.id}>
              <button type="button" className="presence-row" onClick={() => onOpen(chat.id)}>
                <span className="truncate">{chat.title || untitled}</span>
                {chat.project && <span className="presence-row-project truncate">{chat.project}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
