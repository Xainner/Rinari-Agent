import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import type { BackgroundPatch, BackgroundSettings as Settings } from '../../platform/contract'
import { Switch } from '../ui/switch'
import { Row, Section } from './parts'

/**
 * Ajustes > General > Segundo plano: seguir en la bandeja al cerrar e iniciar
 * con el sistema. La preferencia vive en main (la necesita antes que el
 * renderer) y el estado de inicio de sesión es el del sistema: se muestra lo
 * que el host confirma, no lo que se pidió.
 */
export default function BackgroundSettings() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    platform()
      .app.backgroundSettings()
      .then((value) => {
        if (!cancelled) setSettings(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!settings) return null

  const update = async (patch: BackgroundPatch) => {
    setSaving(true)
    try {
      setSettings(await platform().app.setBackgroundSettings(patch))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={t('settings.general.background')}>
      <Row
        title={t('settings.general.backgroundMode')}
        desc={t('settings.general.backgroundModeDesc')}
        control={
          <Switch
            checked={settings.backgroundMode}
            disabled={saving}
            onCheckedChange={(value) => void update({ backgroundMode: value })}
            aria-label={t('settings.general.backgroundMode')}
          />
        }
      />
      <Row
        title={t('settings.general.launchAtLogin')}
        desc={settings.launchAtLoginSupported ? t('settings.general.launchAtLoginDesc') : t('settings.general.launchAtLoginUnsupported')}
        control={
          <Switch
            checked={settings.launchAtLogin}
            disabled={saving || !settings.launchAtLoginSupported}
            onCheckedChange={(value) => void update({ launchAtLogin: value })}
            aria-label={t('settings.general.launchAtLogin')}
          />
        }
      />
    </Section>
  )
}
