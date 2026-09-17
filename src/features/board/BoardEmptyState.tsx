import { Columns3, MessageSquarePlus } from 'lucide-react'
import { useI18n } from '../../i18n'

interface BoardEmptyStateProps {
  onAddPane?: () => void
  /** Vincula la sesión Normal actual como primer panel; ausente si no hay sesión. */
  onAddCurrent?: () => void
}

/**
 * Board sin paneles: bienvenida coherente con el home (misma ilustración a
 * escala moderada). Las acciones abren el diálogo o vinculan una sesión
 * existente; nunca envían prompts ni crean chats en silencio.
 */
export default function BoardEmptyState({ onAddPane, onAddCurrent }: BoardEmptyStateProps) {
  const { t } = useI18n()
  return (
    <section className="board-empty" aria-label={t('board.title')}>
      <div className="board-empty-art" aria-hidden="true">
        <img src="/brand/icon-no-bg.png" alt="" draggable={false} />
      </div>
      <h1>{t('board.empty.title')}</h1>
      <p>{t('board.empty.body')}</p>
      {(onAddPane || onAddCurrent) && (
        <div className="board-empty-actions">
          {onAddPane && (
            <button type="button" className="board-empty-primary" onClick={onAddPane}>
              <Columns3 size={15} aria-hidden="true" />{t('board.empty.addPane')}
            </button>
          )}
          {onAddCurrent && (
            <button type="button" className="board-empty-secondary" onClick={onAddCurrent}>
              <MessageSquarePlus size={15} aria-hidden="true" />{t('board.empty.addCurrent')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
