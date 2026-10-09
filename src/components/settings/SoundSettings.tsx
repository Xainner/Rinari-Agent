import { Play } from 'lucide-react'
import { useI18n, type I18nKey } from '../../i18n'
import { previewSound } from '../../services/notificationSounds'
import { SOUND_CATEGORIES, SOUND_PACKS, useSoundPrefs, type SoundCategory } from '../../stores/soundPrefs'
import { Switch } from '../ui/switch'
import { inputClass, Row, Section } from './parts'

const CATEGORY_KEYS: Record<SoundCategory, { title: I18nKey; hint: I18nKey }> = {
  attention: { title: 'settings.sounds.attention', hint: 'settings.sounds.attentionHint' },
  success: { title: 'settings.sounds.success', hint: 'settings.sounds.successHint' },
  error: { title: 'settings.sounds.error', hint: 'settings.sounds.errorHint' },
  reminder: { title: 'settings.sounds.reminder', hint: 'settings.sounds.reminderHint' },
}

/**
 * Ajustes > General > Sonidos: tonos propios de Rinari para los avisos. Con
 * ellos activos, la notificación del sistema llega sin su sonido: un solo
 * emisor audible por aviso.
 */
export default function SoundSettings() {
  const { t } = useI18n()
  const prefs = useSoundPrefs()
  return (
    <Section title={t('settings.sounds.title')}>
      <Row
        title={t('settings.sounds.enabled')}
        desc={t('settings.sounds.enabledHint')}
        control={<Switch checked={prefs.enabled} onCheckedChange={(value) => prefs.update({ enabled: value })} aria-label={t('settings.sounds.enabled')} />}
      />
      <Row
        title={t('settings.sounds.pack')}
        desc={t('settings.sounds.packHint')}
        control={
          <select
            value={prefs.pack}
            disabled={!prefs.enabled}
            onChange={(event) => prefs.update({ pack: event.target.value as typeof prefs.pack })}
            aria-label={t('settings.sounds.pack')}
            className={inputClass}
          >
            {SOUND_PACKS.map((pack) => <option key={pack} value={pack}>{t(`settings.sounds.pack.${pack}` as I18nKey)}</option>)}
          </select>
        }
      />
      <Row
        title={t('settings.sounds.volume')}
        control={
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(prefs.volume * 100)}
            disabled={!prefs.enabled}
            onChange={(event) => prefs.update({ volume: Number(event.target.value) / 100 })}
            aria-label={t('settings.sounds.volume')}
            className="w-36 accent-[var(--accent)]"
          />
        }
      />
      {SOUND_CATEGORIES.map((category) => (
        <Row
          key={category}
          title={t(CATEGORY_KEYS[category].title)}
          desc={t(CATEGORY_KEYS[category].hint)}
          control={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => previewSound(category)}
                aria-label={t('settings.sounds.preview', { name: t(CATEGORY_KEYS[category].title) })}
                title={t('settings.sounds.preview', { name: t(CATEGORY_KEYS[category].title) })}
                className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              >
                <Play size={13} />
              </button>
              <Switch
                checked={prefs.categories[category]}
                disabled={!prefs.enabled}
                onCheckedChange={(value) => prefs.update({ categories: { [category]: value } })}
                aria-label={t(CATEGORY_KEYS[category].title)}
              />
            </div>
          }
        />
      ))}
      <Row
        title={t('settings.sounds.whileAttended')}
        desc={t('settings.sounds.whileAttendedHint')}
        control={<Switch checked={prefs.whileAttended} disabled={!prefs.enabled} onCheckedChange={(value) => prefs.update({ whileAttended: value })} aria-label={t('settings.sounds.whileAttended')} />}
      />
    </Section>
  )
}
