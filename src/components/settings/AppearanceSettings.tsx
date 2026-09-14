import { Check } from 'lucide-react'
import { useI18n } from '../../i18n'
import { ACCENTS, ACCENT_SWATCH } from '../../lib/appearance'
import { useUIStore } from '../../stores/ui'
import type { Theme } from '../../lib/theme'
import { Row, Section } from './parts'
import { Switch } from '../ui/switch'

const THEMES: Theme[] = ['system', 'light', 'dark']

/** Settings > Apariencia (§20): tema, acento, densidad (fase 2), motion. Inmediato. */
export default function AppearanceSettings() {
  const { t } = useI18n()
  const theme: Theme = 'dark'
  const setTheme = useUIStore((s) => s.setTheme)
  const accent = 'nebula'
  const setAccent = useUIStore((s) => s.setAccent)
  const reduceMotion = useUIStore((s) => s.reduceMotion)
  const setReduceMotion = useUIStore((s) => s.setReduceMotion)

  const themeLabel = (th: Theme) =>
    th === 'system'
      ? t('settings.appearance.system')
      : th === 'light'
        ? t('settings.appearance.light')
        : t('settings.appearance.dark')

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-muted)]">{t('home.fixedTheme')}</p>
      <Section title={t('settings.appearance.theme')}>
        <div
          role="group"
          aria-label={t('settings.appearance.theme')}
          className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1"
        >
          {THEMES.map((th) => (
            <button
              disabled
              key={th}
              type="button"
              onClick={() => setTheme(th)}
              aria-pressed={theme === th}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${
                theme === th
                  ? 'bg-[var(--accent)] text-white shadow'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {themeLabel(th)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('settings.appearance.accent')} desc={t('settings.appearance.accentDesc')}>
        <div
          role="group"
          aria-label={t('settings.appearance.accent')}
          className="flex flex-wrap gap-2"
        >
          {ACCENTS.map((a) => {
            const active = accent === a
            return (
              <button
                disabled
                key={a}
                type="button"
                onClick={() => setAccent(a)}
                aria-pressed={active}
                title={a === 'nebula' ? 'Nebula' : a[0].toUpperCase() + a.slice(1)}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="size-4 rounded-full"
                  style={{ background: ACCENT_SWATCH[a] }}
                />
                {a === 'nebula' ? 'Nebula' : a[0].toUpperCase() + a.slice(1)}
                {active && <Check size={14} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title={t('settings.appearance.density')}>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label={t('settings.appearance.density')}
            className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1 opacity-60"
          >
            <span className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white">
              {t('settings.appearance.comfortable')}
            </span>
            <span className="cursor-not-allowed px-4 py-1.5 text-sm font-semibold text-[var(--text-muted)]">
              {t('settings.appearance.compact')}
            </span>
          </div>
          <span className="rounded-lg bg-[var(--bg-hover)] px-2 py-0.5 text-xs text-[var(--text-subtle)]">
            {t('settings.appearance.soon')}
          </span>
        </div>
      </Section>

      <Section title={t('settings.appearance.motion')}>
        <Row
          title={t('settings.appearance.reduceMotion')}
          desc={t('settings.appearance.reduceMotionDesc')}
          control={
            <Switch
              checked={reduceMotion}
              onCheckedChange={setReduceMotion}
              aria-label={t('settings.appearance.reduceMotion')}
            />
          }
        />
      </Section>
    </div>
  )
}
