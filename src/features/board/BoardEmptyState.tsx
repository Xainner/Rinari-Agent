import { Columns3, FolderGit2, Globe, Heart, LayoutGrid, MessageSquarePlus, Paperclip, Plus, Sparkle } from 'lucide-react'
import { useI18n } from '../../i18n'

interface BoardEmptyStateProps {
  onAddPane?: () => void
  /** Vincula la sesión Normal actual como primer panel; ausente si no hay sesión. */
  onAddCurrent?: () => void
}

const FILES: readonly (readonly ['M' | 'A', string])[] = [
  ['M', 'app/package-lock.json'],
  ['M', 'app/src/main.ts'],
  ['A', 'src/components/BoardPanel.tsx'],
  ['M', 'styles/boards.css'],
  ['A', 'README.md'],
]

/** Panel plegado del board: el título en vertical y su estado. */
function FoldedPane({ label }: { label?: string }) {
  return (
    <div className={`board-hero-fold${label ? '' : ' is-empty'}`}>
      {label && <><span className="board-hero-dot" /><span className="board-hero-fold-label">{label}</span></>}
    </div>
  )
}

function AddPaneCard({ label }: { label: string }) {
  return (
    <div className="board-hero-add"><Plus size={16} /><span>{label}</span></div>
  )
}

/**
 * Board sin paneles: Rinari en el centro y, a los lados, una maqueta del
 * board (paneles plegados, un chat y el Workspace) en perspectiva. La
 * maqueta es decorativa; las acciones abren el diálogo o vinculan una sesión
 * existente, nunca envían prompts ni crean chats en silencio.
 */
export default function BoardEmptyState({ onAddPane, onAddCurrent }: BoardEmptyStateProps) {
  const { t } = useI18n()
  return (
    <section className="board-empty" aria-label={t('board.title')}>
      <div className="board-hero" aria-hidden="true">
        <div className="board-hero-side is-left">
          <FoldedPane label={t('board.hero.pane1')} />
          <FoldedPane label={t('board.hero.pane2')} />
          <FoldedPane label={t('board.hero.pane3')} />
          <AddPaneCard label={t('board.empty.addPane')} />
          <div className="board-hero-card board-hero-chat">
            <div className="board-hero-card-head">
              <LayoutGrid size={11} /><strong>{t('board.hero.chatTitle')}</strong>
              <span className="board-hero-badge">{t('board.hero.done')}</span>
            </div>
            <div className="board-hero-msg is-rinari">
              <img src="/brand/icon-no-bg.png" alt="" />
              <span>{t('board.hero.greeting')}</span>
            </div>
            <div className="board-hero-msg is-rinari-text"><span>{t('board.hero.reply')} <Sparkle size={10} /></span></div>
            <div className="board-hero-composer">
              <span>{t('composer.placeholder')}</span>
              <div className="board-hero-composer-row">
                <Paperclip size={11} />
                <span className="board-hero-modes"><i>PLAN</i><b>BUILD</b><i>REVIEW</i></span>
              </div>
            </div>
          </div>
        </div>

        <img className="board-hero-rinari" src="/brand/boards.webp" alt="" draggable={false} />

        <div className="board-hero-side is-right">
          <div className="board-hero-card board-hero-workspace">
            <div className="board-hero-tabs">
              <span><FolderGit2 size={11} />{t('board.hero.files')}</span>
              <span><Globe size={11} />{t('board.hero.browser')}</span>
              <b><LayoutGrid size={11} />Workspace</b>
            </div>
            <div className="board-hero-subtabs">
              <b>{t('board.hero.changes')}</b><span>{t('board.hero.tasks')}</span><span>{t('board.hero.verification')}</span>
            </div>
            <div className="board-hero-path"><em>{t('board.hero.project')}</em>C:\Users\rinari\project</div>
            {FILES.map(([kind, path]) => (
              <div key={path} className="board-hero-file"><b data-kind={kind}>{kind}</b>{path}</div>
            ))}
          </div>
          <FoldedPane />
          <FoldedPane />
          <AddPaneCard label={t('board.empty.addPane')} />
        </div>

        <p className="board-hero-note is-top">{t('board.hero.noteTop')}<Heart size={16} /></p>
        <p className="board-hero-note is-left">{t('board.hero.noteLeft')}<Heart size={14} /></p>
        <p className="board-hero-note is-right">{t('board.hero.noteRight')}<Heart size={14} /></p>
        <Sparkle className="board-hero-spark is-a" size={16} />
        <Sparkle className="board-hero-spark is-b" size={22} />
      </div>

      <h1>{t('board.empty.titleLead')} <span>Boards</span></h1>
      <p>{t('board.empty.body')}</p>
      {(onAddPane || onAddCurrent) && (
        <div className="board-empty-actions">
          {onAddPane && (
            <button type="button" className="board-empty-primary" onClick={onAddPane}>
              <Columns3 size={17} aria-hidden="true" />{t('board.empty.addPane')}
            </button>
          )}
          {onAddCurrent && (
            <button type="button" className="board-empty-secondary" onClick={onAddCurrent}>
              <MessageSquarePlus size={17} aria-hidden="true" />{t('board.empty.addCurrent')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
