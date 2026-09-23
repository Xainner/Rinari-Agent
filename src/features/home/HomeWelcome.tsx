import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Code2, Route, Lightbulb, FileCode2, RefreshCw } from 'lucide-react'
import { useI18n } from '../../i18n'
import { selectDraft, useComposerStore } from '../../stores/composer'
import { useUIStore } from '../../stores/ui'
import { applicableSuggestions, suggestionPage, type HomeContext } from './suggestions'

const icons = { code: Code2, plan: Route, concept: Lightbulb, file: FileCode2 }
export type HomeWelcomeVariant = 'home' | 'pane'

/** Un solo shell conserva el composer al pasar de sesión vacía a conversación. */
export default function HomeWelcome({ sessionId, context, engineReady, children, conversationActive = false, transcript, variant = 'home' }: {
  sessionId: string
  context: Omit<HomeContext, 'attachmentCount'>
  engineReady: boolean
  children: ReactNode
  conversationActive?: boolean
  transcript?: ReactNode
  variant?: HomeWelcomeVariant
}) {
  const { t } = useI18n()
  const draftKey = sessionId || 'draft'
  const draft = useComposerStore(selectDraft(draftKey))
  const attachmentCount = draft.attachments.length
  const showSuggestions = useUIStore((state) => state.showSuggestions)
  const systemReducedMotion = useReducedMotion()
  const reducedMotion = useUIStore((state) => state.reduceMotion) || systemReducedMotion
  const hasDraft = draft.text.trim().length > 0
  const signature = JSON.stringify([sessionId, context.projectName, context.changedFiles, attachmentCount])
  const [selection, setSelection] = useState(() => ({
    signature,
    items: applicableSuggestions({ ...context, attachmentCount }),
    offset: 0,
  }))
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasDraft && selection.signature !== signature) {
      setSelection({ signature, items: applicableSuggestions({ ...context, attachmentCount }), offset: 0 })
    }
  }, [attachmentCount, context, hasDraft, selection.signature, signature])

  const pane = variant === 'pane'
  return (
    <div
      className={`conversation-shell ${conversationActive ? 'is-conversation' : 'is-empty'}${pane ? ' variant-pane' : ''}`}
      ref={container}
      data-presentation={conversationActive ? 'conversation' : 'empty'}
    >
      <div className="conversation-content">
        <div className="conversation-visual-slot">
        {conversationActive && (
          <motion.div
            className="conversation-transcript"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {transcript}
          </motion.div>
        )}
        <AnimatePresence initial={false}>
        {!conversationActive && (
          <motion.div
            key="hero"
            className="home-hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
          >
            <div className="home-art" aria-hidden="true"><img src="/brand/home.png" alt="" draggable={false} /></div>
            <div className="home-greeting"><h1>{t('home.title')}</h1><p>{t('home.subtitle')}</p></div>
          </motion.div>
        )}
        </AnimatePresence>
        </div>

        <div key="composer" className="conversation-composer-slot">{children}</div>

        {!conversationActive && showSuggestions && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
            className="home-suggestions"
            aria-label={t('home.suggestions')}
          >
            <div className="home-card-grid">{suggestionPage(selection.items, selection.offset).map((item) => {
              const Icon = icons[item.icon]
              return (
                <button key={item.id} className="home-card" disabled={hasDraft} onClick={() => {
                  const store = useComposerStore.getState()
                  if (store.getDraft(draftKey).text.trim()) return
                  store.setTextFor(draftKey, t(item.prompt))
                  container.current?.querySelector('textarea')?.focus()
                }}>
                  <span className="home-card-icon"><Icon size={20} /></span>
                  <span><strong>{t(item.title)}</strong><small>{t(item.description)}</small></span>
                </button>
              )
            })}</div>
            <button className="home-more" disabled={hasDraft} onClick={() => setSelection((current) => ({
              ...current,
              offset: (current.offset + 4) % current.items.length,
            }))}><RefreshCw size={12} />{t('home.more')}</button>
          </motion.section>
        )}
      </div>

      {!conversationActive && !pane && (
        <footer className="home-footer">
          <p>“Better tools for brighter minds.”</p>
          <span className="home-footer-rule" />
          <div className="home-status" role="status">
            <span className={engineReady ? 'engine-dot ready' : 'engine-dot'} />
            {t(engineReady ? 'home.ready' : 'home.unavailable')}
            <span className="home-motto">Code · Create · Explore · Together</span>
          </div>
        </footer>
      )}
    </div>
  )
}
