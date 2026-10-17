import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi } from '../../services/engine'
import { useI18n } from '../../i18n'
import { Switch } from '../../components/ui/switch'
import { Section } from '../../components/settings/parts'

const KEY = 'permissions.ask_new_destinations'

/**
 * «Preguntar antes de enviar datos a destinos nuevos» (plan-permisos-v4):
 * off by default, Full access asks nothing; on, it asks only before sending
 * to a destination that is not trusted after reading outside content.
 */
export default function NewDestinationsSwitch() {
  const { t } = useI18n()
  const [value, setValue] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    engineApi.advancedSettingsGet()
      .then((result) => {
        const row = result.limits.find((item) => item.key === KEY)
        if (!cancelled) setValue(row ? Boolean(row.value) : false)
      })
      .catch(() => { if (!cancelled) setValue(false) })
    return () => { cancelled = true }
  }, [])
  const change = async (next: boolean) => {
    setBusy(true)
    setValue(next)
    try {
      await engineApi.advancedSettingsSet({ [KEY]: next })
      toast.success(t('perm.newDestinationsSaved'))
    } catch (error) {
      setValue(!next)
      toast.error(commandMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title={t('perm.newDestinations')}>
      <label className="flex items-start justify-between gap-4 text-sm" data-testid="new-destinations">
        <span className="text-xs text-[var(--text-subtle)]">{t('perm.newDestinationsHint')}</span>
        <Switch checked={value === true} disabled={value === null || busy} onCheckedChange={(next) => void change(next)} aria-label={t('perm.newDestinations')} />
      </label>
    </Section>
  )
}
