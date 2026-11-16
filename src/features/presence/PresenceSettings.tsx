import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage } from '../../services/engine'
import { Row, Section } from '../../components/settings/parts'
import { Switch } from '../../components/ui/switch'
import { usePresenceStore } from '../../stores/presence'

/**
 * Ajustes → Presencia: encender o apagar la conversación continua con Rinari.
 * Apagarla no borra nada: la conversación se queda y vuelve al encenderla.
 */
export default function PresenceSettings() {
  const { t } = useI18n()
  const supported = usePresenceStore((state) => state.supported)
  const loaded = usePresenceStore((state) => state.loaded)
  const enabled = usePresenceStore((state) => state.enabled)
  const setEnabled = usePresenceStore((state) => state.setEnabled)
  const [saving, setSaving] = useState(false)

  if (!supported) {
    return (
      <Section title={t('presence.settings.title')} desc={t('presence.settings.unsupported')}>
        <span />
      </Section>
    )
  }

  async function toggle(next: boolean) {
    setSaving(true)
    try {
      await setEnabled(next)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="presence-settings">
      <Section title={t('presence.settings.title')} desc={t('presence.settings.desc')}>
        <Row
          title={t('presence.settings.enable')}
          desc={t('presence.settings.enableHint')}
          control={
            <Switch
              checked={enabled}
              disabled={!loaded || saving}
              onCheckedChange={(next) => void toggle(next)}
              aria-label={t('presence.settings.enable')}
              data-testid="presence-switch"
            />
          }
        />
        <p className="text-xs text-[var(--text-subtle)]">{t('presence.settings.access')}</p>
      </Section>
    </div>
  )
}
