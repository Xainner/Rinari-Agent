import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Code2, Route, Lightbulb, FileCode2, RefreshCw } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useComposerStore } from '../../stores/composer'
import { useUIStore } from '../../stores/ui'
import { applicableSuggestions, suggestionPage, type HomeContext } from './suggestions'
const icons = { code: Code2, plan: Route, concept: Lightbulb, file: FileCode2 }
export default function HomeWelcome({ sessionId, context, engineReady, children, conversationActive = false, transcript }: {
  sessionId: string; context: Omit<HomeContext, 'attachmentCount'>; engineReady: boolean; children: ReactNode; conversationActive?: boolean; transcript?: ReactNode
}) {
  const { t } = useI18n()
  const text = useComposerStore(s => s.text)
  const attachmentCount = useComposerStore(s => s.attachments.length)
  const showSuggestions = useUIStore(s => s.showSuggestions)
  const systemReducedMotion = useReducedMotion()
  const reducedMotion = useUIStore(s => s.reduceMotion) || systemReducedMotion
  const duration = reducedMotion ? 0 : 0.42
  const hasDraft = text.trim().length > 0
  const signature = JSON.stringify([sessionId, context.projectName, context.changedFiles, attachmentCount])
  const [selection, setSelection] = useState(() => ({ signature, items: applicableSuggestions({ ...context, attachmentCount }), offset: 0 }))
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hasDraft && selection.signature !== signature) setSelection({ signature, items: applicableSuggestions({ ...context, attachmentCount }), offset: 0 })
  }, [signature, selection.signature, hasDraft, context, attachmentCount])
  return <div className={conversationActive ? "conversation-layout" : "home-welcome"} ref={container}>
    <div className={conversationActive ? "conversation-main" : "home-main"}>
      {conversationActive && <motion.div className="conversation-transcript" initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}>{transcript}</motion.div>}
      <AnimatePresence initial={false} mode="popLayout">
      {!conversationActive && <motion.div key="hero" className="home-hero" exit={{ opacity: 0, y: reducedMotion ? 0 : -14 }} transition={{ duration: reducedMotion ? 0 : 0.22 }}>
      <div className="home-art" aria-hidden="true"><img src="/brand/home.png" alt="" draggable={false} /></div>
      <div className="home-greeting"><h1>{t('home.title')}</h1><p>{t('home.subtitle')}</p></div>
      </motion.div>}
      </AnimatePresence>
      <motion.div key="composer" layout="position" layoutDependency={conversationActive} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ layout: { duration, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: reducedMotion ? 0 : 0.18 } }} className={conversationActive ? "conversation-composer" : "home-composer"}>{children}</motion.div>
      <AnimatePresence initial={false} mode="popLayout">
      {!conversationActive && showSuggestions && <motion.section key="suggestions" exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.14 }} className="home-suggestions" aria-label={t('home.suggestions')}>
        <div className="home-card-grid">{suggestionPage(selection.items, selection.offset).map(item => {
          const Icon = icons[item.icon]
          return <button key={item.id} className="home-card" disabled={hasDraft} onClick={() => {
            if (useComposerStore.getState().text.trim()) return
            useComposerStore.getState().setText(t(item.prompt))
            container.current?.querySelector('textarea')?.focus()
          }}><span className="home-card-icon"><Icon size={20} /></span><span><strong>{t(item.title)}</strong><small>{t(item.description)}</small></span></button>
        })}</div>
        <button className="home-more" disabled={hasDraft} onClick={() => setSelection(current => ({ ...current, offset: (current.offset + 4) % current.items.length }))}><RefreshCw size={12} />{t('home.more')}</button>
      </motion.section>}
      </AnimatePresence>
    </div>
    <AnimatePresence initial={false} mode="popLayout">
    {!conversationActive && <motion.footer key="footer" exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.14 }} className="home-footer"><p>“Better tools for brighter minds.”</p><span className="home-footer-rule" /><img src="/brand/icon-no-bg.png" alt="" />
      <div className="home-status" role="status"><span className={engineReady ? 'engine-dot ready' : 'engine-dot'} />{t(engineReady ? 'home.ready' : 'home.unavailable')}<span className="home-motto">Code · Create · Explore · Together</span></div>
    </motion.footer>}
    </AnimatePresence>
  </div>
}
