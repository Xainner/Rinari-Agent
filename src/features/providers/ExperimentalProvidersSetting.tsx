import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '../../components/ui/switch'
import { commandMessage, engineApi } from '../../services/engine'
import { useI18n } from '../../i18n'

/**
 * Interruptor de Claude Subscription (experimental), apagado por defecto.
 *
 * Anthropic permite usar el plan con `claude -p` desde apps de terceros, pero
 * no está claro que una app pública pueda ofrecerlo de serie, así que nadie
 * lo recibe sin pedirlo. El valor lo guarda el Engine (lo comparte con la
 * CLI): apagado, el catálogo no ofrece el producto, no se puede dar de alta y
 * los proveedores guardados fallan antes de lanzar ningún proceso.
 */
export default function ExperimentalProvidersSetting({ onChanged }: { onChanged?: () => void }) {
  const { t } = useI18n()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    engineApi.providerSettingsGet()
      .then(({ external_runtimes }) => { if (active) setEnabled(external_runtimes) })
      // Un Engine sin el ajuste no ofrece el producto: no hay nada que mostrar.
      .catch(() => { if (active) setEnabled(null) })
    return () => { active = false }
  }, [])

  if (enabled === null) return null

  async function change(next: boolean) {
    setSaving(true)
    try {
      const saved = await engineApi.providerSettingsSet({ external_runtimes: next })
      setEnabled(saved.external_runtimes)
      onChanged?.()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="experimental-providers"
      className="flex items-start justify-between gap-6 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4"
    >
      <div className="min-w-0">
        <div id="claude-subscription-toggle" className="text-sm font-medium text-[var(--text)]">
          {t('providers.experimentalClaude')}
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t('providers.experimentalClaudeHint')}</p>
        {enabled && <p className="mt-1 text-xs text-[var(--text-muted)]">{t('providers.claudeDisclosure')}</p>}
      </div>
      <Switch
        checked={enabled}
        disabled={saving}
        onCheckedChange={(next) => void change(next)}
        aria-labelledby="claude-subscription-toggle"
      />
    </div>
  )
}
