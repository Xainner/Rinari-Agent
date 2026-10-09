import { Check } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUIStore } from '../../stores/ui'
import { Row, Section } from './parts'
import { Switch } from '../ui/switch'
import { RinariAvatar } from '../../features/rinari/RinariAvatar'

const THEMES = [
  { id: 'obsidian', ready: true, swatch: 'linear-gradient(135deg, #06050b, #20182f 55%, #3b1680)' },
  { id: 'light', ready: false, swatch: 'linear-gradient(135deg, #f6f2ff, #ddd0ff)' },
  { id: 'system', ready: false, swatch: 'linear-gradient(90deg, #06050b 50%, #f6f2ff 50%)' },
] as const

/**
 * Ajustes > Apariencia. Solo ofrece lo que funciona: el tema Obsidiana y las
 * animaciones. El tema claro y los acentos se enseñan como «en preparación»,
 * sin poder elegirse, hasta que todas las pantallas los soporten.
 */
export default function AppearanceSettings() {
  const { t } = useI18n()
  const reduceMotion = useUIStore((s) => s.reduceMotion)
  const setReduceMotion = useUIStore((s) => s.setReduceMotion)

  return (
    <div className="space-y-6">
      <Section title={t('settings.appearance.theme')} desc={t('settings.appearance.themeDesc')}>
        <div role="radiogroup" aria-label={t('settings.appearance.theme')} className="grid grid-cols-3 gap-3">
          {THEMES.map((theme) => (
            <div
              key={theme.id}
              role="radio"
              aria-checked={theme.id === 'obsidian'}
              aria-disabled={!theme.ready || undefined}
              className="theme-card"
              data-ready={theme.ready || undefined}
              data-active={theme.id === 'obsidian' || undefined}
            >
              <span className="theme-card-swatch" style={{ background: theme.swatch }} aria-hidden="true" />
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text)]">
                {t(`settings.appearance.theme.${theme.id}`)}
                {theme.id === 'obsidian' && <Check size={13} aria-hidden="true" className="text-[var(--violet-300)]" />}
              </span>
              <span className="text-[11.5px] text-[var(--text-subtle)]">{theme.ready ? t('settings.appearance.inUse') : t('settings.appearance.preparing')}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('settings.appearance.motion')} desc={t('settings.appearance.motionDesc')}>
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
        <div className="motion-preview" data-calm={reduceMotion || undefined}>
          <RinariAvatar state="working" size={40} />
          <span className="text-[12.5px] text-[var(--text-muted)]">{reduceMotion ? t('settings.appearance.previewCalm') : t('settings.appearance.previewFull')}</span>
        </div>
      </Section>
    </div>
  )
}
