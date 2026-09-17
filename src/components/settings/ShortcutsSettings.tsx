import { useState, type KeyboardEvent } from 'react'
import { RotateCcw } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUIStore, type ShortcutAction } from '../../stores/ui'
import { Section } from './parts'

const SHORTCUTS: Array<{ id: ShortcutAction; label: 'settings.shortcuts.new' | 'settings.shortcuts.palette' | 'settings.shortcuts.settings' | 'settings.shortcuts.sidebar' | 'settings.shortcuts.boards' | 'settings.shortcuts.collapsePane' | 'settings.shortcuts.expandPane' }> = [
  { id: 'newChat', label: 'settings.shortcuts.new' },
  { id: 'palette', label: 'settings.shortcuts.palette' },
  { id: 'settings', label: 'settings.shortcuts.settings' },
  { id: 'sidebar', label: 'settings.shortcuts.sidebar' },
  { id: 'boards', label: 'settings.shortcuts.boards' },
  { id: 'collapsePane', label: 'settings.shortcuts.collapsePane' },
  { id: 'expandPane', label: 'settings.shortcuts.expandPane' },
]

function shortcutFromEvent(event: KeyboardEvent<HTMLButtonElement>): string | null {
  if (event.key === 'Escape') return null
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key === ',' ? ',' : null
  // Alt solo (sin Ctrl/Meta) sigue siendo válido para colapso/expansión.
  if (!key || (!event.ctrlKey && !event.metaKey && !event.altKey)) return null
  return `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${key}`
}

/** Atajos del shell: se guardan localmente y se aplican sin reiniciar. */
export default function ShortcutsSettings() {
  const { t } = useI18n()
  const bindings = useUIStore((s) => s.shortcutBindings)
  const setShortcutBinding = useUIStore((s) => s.setShortcutBinding)
  const resetShortcutBindings = useUIStore((s) => s.resetShortcutBindings)
  const [recording, setRecording] = useState<ShortcutAction | null>(null)

  return (
    <div className="space-y-6">
      <Section title={t('settings.nav.shortcuts')}>
        <p className="mb-3 text-sm text-[var(--text-muted)]">{t('settings.shortcuts.subtitle')}</p>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          {SHORTCUTS.map(({ id, label }) => (
            <div key={id} className="flex min-h-14 items-center gap-4 border-b border-[var(--border)] px-3 last:border-b-0">
              <span className="min-w-0 flex-1 text-sm text-[var(--text)]">{t(label)}</span>
              <button
                type="button"
                onClick={() => setRecording(id)}
                onBlur={() => setRecording((current) => current === id ? null : current)}
                onKeyDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  const shortcut = shortcutFromEvent(event)
                  if (shortcut) {
                    setShortcutBinding(id, shortcut)
                    setRecording(null)
                  }
                }}
                className="min-w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                aria-label={`${t(label)}: ${bindings[id]}`}
              >
                {recording === id ? 'Pulsa una combinación…' : bindings[id]}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-subtle)]">Usa Ctrl, Alt o Shift junto a otra tecla. Esc cancela. {t('settings.shortcuts.closeContext')}</p>
          <button type="button" onClick={resetShortcutBindings} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
            <RotateCcw size={13} /> Restaurar
          </button>
        </div>
      </Section>
    </div>
  )
}
