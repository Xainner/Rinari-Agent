import { useState } from 'react'
import { Command } from 'cmdk'
import {
  ArrowLeft,
  Cpu,
  GitBranch,
  Languages,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Settings2,
  Sun,
} from 'lucide-react'
import type { SessionSummary } from '../services/engine'
import type { Language } from '../types'
import { dispatchAction } from '../services/actions'
import type { Theme } from '../lib/theme'
import { useI18n } from '../i18n'
import type { SettingsSection } from '../stores/ui'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  sessions: SessionSummary[]
  activeId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  /** Abre Boards y el diálogo de alta de panel. */
  onNewPane?: () => void
  onOpenSettings: (section?: SettingsSection) => void
  onOpenEngine: () => void
  onOpenWorkspace: () => void
  onEngineRestart: () => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  lang: Language
  onLanguageChange: (lang: Language) => void
}

type Page = 'root' | 'themes'

/** Paleta de comandos: acciones + sesiones con búsqueda local. Modelos y perfiles llegan en Fase 3. */
export default function CommandPalette({
  open,
  onClose,
  sessions,
  activeId,
  onSelectSession,
  onNewSession,
  onNewPane,
  onOpenSettings,
  onOpenEngine,
  onOpenWorkspace,
  onEngineRestart,
  theme,
  onThemeChange,
  lang,
  onLanguageChange,
}: CommandPaletteProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<Page>('root')

  function handleOpenChange(v: boolean) {
    if (!v) {
      setQuery('')
      setPage('root')
      onClose()
    }
  }

  function run(fn: () => void) {
    fn()
    onClose()
  }

  const q = query.trim().toLowerCase()
  const filtered =
    q.length === 0
      ? sessions.slice(0, 6)
      : sessions.filter((s) => (s.title ?? s.id).toLowerCase().includes(q)).slice(0, 12)

  const itemClass =
    'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-sm text-[var(--text)] select-none aria-selected:bg-[var(--bg-hover)] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--text-muted)]'

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label={t('cmd.placeholder')}
      className="fixed top-1/2 left-1/2 z-[100] max-h-[70vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[0_8px_30px_rgba(0,0,0,0.24)] outline-none"
      overlayClassName="fixed inset-0 z-[99] bg-black/60 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 transition-colors focus-within:border-[var(--accent-2)]/60 focus-within:ring-1 focus-within:ring-inset focus-within:ring-[var(--accent-2)]/25">
        {page !== 'root' && (
          <button
            type="button"
            aria-label={t('deleteChat.cancel')}
            onClick={() => setPage('root')}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('cmd.placeholder')}
          className="command-search-input h-12 w-full border-0 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:outline-none"
        />
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--text-subtle)]">
          {t('cmd.noResults')}
        </Command.Empty>

        {page === 'root' && (
          <>
            <Command.Group
              heading={t('cmd.actions')}
              className="px-2 py-1.5 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase [&_[cmdk-group-heading]]:px-1"
            >
              <Command.Item
                value={t('sidebar.newChat')}
                onSelect={() => run(onNewSession)}
                className={itemClass}
              >
                <Plus />
                {t('sidebar.newChat')}
              </Command.Item>
              {onNewPane && (
                <Command.Item value={t('cmd.addPane')} onSelect={() => run(onNewPane)} className={itemClass}>
                  <Plus />
                  {t('cmd.addPane')}
                </Command.Item>
              )}
              {([['view-normal', t('nav.normal')], ['view-boards', t('nav.boards')]] as const).map(([action, label]) => <Command.Item key={action} value={label} onSelect={() => run(() => dispatchAction(action))} className={itemClass}><Monitor />{label}</Command.Item>)}
              {([['open-folder', 'Abrir carpeta'], ['files', 'Panel de archivos'], ['sidebar', 'Barra lateral'], ['updates', 'Buscar actualizaciones'], ['about', 'Acerca de Rinari Agent']] as const).map(([action, label]) => <Command.Item key={action} value={label} onSelect={() => run(() => dispatchAction(action))} className={itemClass}><Monitor />{label}</Command.Item>)}
              <Command.Item
                value={t('engine.restart')}
                onSelect={() => run(onEngineRestart)}
                className={itemClass}
              >
                <Cpu />
                {t('engine.restart')}
              </Command.Item>
              <Command.Item
                value={t('nav.engine')}
                onSelect={() => run(onOpenEngine)}
                className={itemClass}
              >
                <Cpu />
                {t('nav.engine')}
              </Command.Item>
              <Command.Item
                value={t('nav.workspace')}
                onSelect={() => run(onOpenWorkspace)}
                className={itemClass}
              >
                <GitBranch />
                {t('nav.workspace')}
              </Command.Item>
              <Command.Item
                value={t('nav.settings')}
                onSelect={() => run(() => onOpenSettings())}
                className={itemClass}
              >
                <Settings2 />
                {t('nav.settings')}
              </Command.Item>
              <Command.Item
                value={t('cmd.changeTheme')}
                onSelect={() => setPage('themes')}
                className={itemClass}
              >
                <Monitor />
                {t('cmd.changeTheme')}
              </Command.Item>
              <Command.Item
                value={t('cmd.changeLanguage')}
                onSelect={() => run(() => onLanguageChange(lang === 'es' ? 'en' : 'es'))}
                className={itemClass}
              >
                <Languages />
                {lang === 'es' ? 'English' : 'Español'}
              </Command.Item>
            </Command.Group>
            {filtered.length > 0 && (
              <Command.Group
                heading={t('cmd.chats')}
                className="px-2 py-1.5 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase [&_[cmdk-group-heading]]:px-1"
              >
                {filtered.map((s) => (
                  <Command.Item
                    key={s.id}
                    value={s.title || s.id}
                    onSelect={() => run(() => onSelectSession(s.id))}
                    className={itemClass}
                  >
                    <MessageSquare />
                    <span className="truncate">{s.title || t('sidebar.newChat')}</span>
                    {s.id === activeId && (
                      <span className="ml-auto text-[11px] text-[var(--accent-2)]">●</span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </>
        )}

        {page === 'themes' && (
          <Command.Group
            heading={t('settings.appearance.theme')}
            className="px-2 py-1.5 text-[11px] font-semibold tracking-widest text-[var(--text-subtle)] uppercase [&_[cmdk-group-heading]]:px-1"
          >
            {(['system', 'light', 'dark'] as const).map((th) => {
              const Icon = th === 'system' ? Monitor : th === 'light' ? Sun : Moon
              return (
                <Command.Item
                  key={th}
                  value={t(`theme.${th}`)}
                  onSelect={() => run(() => onThemeChange(th))}
                  className={itemClass}
                >
                  <Icon />
                  {t(`theme.${th}`)}
                  {th === theme && <span className="ml-auto text-[var(--accent-2)]">✓</span>}
                </Command.Item>
              )
            })}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
