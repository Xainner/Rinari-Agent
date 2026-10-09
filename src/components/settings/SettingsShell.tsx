import type { ReactNode } from 'react'
import {
  ArrowLeft,
  Bot,
  Brain,
  Boxes,
  ChevronRight,
  Cpu,
  Info,
  Keyboard,
  Layers,
  Library,
  Palette,
  Plug,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  Wrench,
  Mic,
  Eye,
  Gauge,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUIStore, type SettingsSection } from '../../stores/ui'

/** Secciones agrupadas por para qué sirven, no por cómo se implementan. */
const GROUPS: Array<{ title: 'settings.group.rinari' | 'settings.group.models' | 'settings.group.tools' | 'settings.group.app'; items: Array<{ id: SettingsSection; icon: typeof Info }> }> = [
  { title: 'settings.group.rinari', items: [
    { id: 'soul', icon: Sparkles },
    { id: 'profiles', icon: Layers },
    { id: 'memory', icon: Brain },
    { id: 'skills', icon: Library },
  ] },
  { title: 'settings.group.models', items: [
    { id: 'providers', icon: Plug },
    { id: 'models', icon: Cpu },
    { id: 'agents', icon: Bot },
    { id: 'vision', icon: Eye },
    { id: 'context', icon: Gauge },
  ] },
  { title: 'settings.group.tools', items: [
    { id: 'mcp', icon: Boxes },
    { id: 'plugins', icon: Puzzle },
    { id: 'tools', icon: ShieldCheck },
    { id: 'terminal', icon: SquareTerminal },
    { id: 'dictation', icon: Mic },
  ] },
  { title: 'settings.group.app', items: [
    { id: 'general', icon: SlidersHorizontal },
    { id: 'appearance', icon: Palette },
    { id: 'shortcuts', icon: Keyboard },
    { id: 'advanced', icon: Wrench },
    { id: 'about', icon: Info },
  ] },
]
const NAV = GROUPS.flatMap((group) => group.items)

/** Shell de ajustes: nav por categorías en desktop, lista→subvista en móvil. Sin cuentas: no hay login. */
export default function SettingsShell({
  onBack,
  children,
}: {
  onBack: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const section = useUIStore((s) => s.settingsSection)
  const setSection = useUIStore((s) => s.setSettingsSection)

  const sectionTitle = t(`settings.nav.${section}`)

  const navList = (
    <nav aria-label={t('settings.title')} className="settings-nav">
      {GROUPS.map((group) => (
        <div key={group.title} className="settings-nav-group">
          <p className="settings-nav-heading">{t(group.title)}</p>
          {group.items.map(({ id, icon: Icon }) => {
            const active = section === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={active ? 'page' : undefined}
                className={`settings-nav-item${active ? ' is-active' : ''}`}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="flex-1 text-left">{t(`settings.nav.${id}`)}</span>
                <ChevronRight size={14} aria-hidden="true" className="text-[var(--text-subtle)] md:hidden" />
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--line-1)] px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('settings.back')}
          className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display text-base font-bold tracking-tight text-[var(--text)]">
          {t('settings.title')}
          <span className="ml-2 font-sans text-sm font-medium text-[var(--text-subtle)] md:hidden">
            · {sectionTitle}
          </span>
        </h1>
      </header>

      {/* Móvil: chips horizontales. Desktop: nav lateral + contenido. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="shrink-0 border-b border-[var(--border)] p-2 md:hidden">
          <nav aria-label={t('settings.title')} className="flex gap-1.5 overflow-x-auto pb-1">
            {NAV.map(({ id, icon: Icon }) => {
              const active = section === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[var(--accent)]/12 text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <Icon
                    size={15}
                    aria-hidden="true"
                    className={active ? 'text-[var(--accent-2)]' : ''}
                  />
                  {t(`settings.nav.${id}`)}
                </button>
              )
            })}
          </nav>
        </div>
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-[var(--line-1)] p-3 md:block">
          {navList}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div key={section} className={`settings-page mx-auto w-full space-y-6 px-4 py-6 ${section === 'about' ? 'max-w-4xl' : 'max-w-2xl'}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
