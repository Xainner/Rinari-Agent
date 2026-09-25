import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type PluginInfo,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { Section } from '../../components/settings/parts'

/** Ajustes > Plugins: lista con diagnósticos del doctor, enable/disable. */
export default function PluginsView({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n()
  const [plugins, setPlugins] = useState<PluginInfo[]>([])

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.pluginList()
      setPlugins(result.plugins)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function toggle(plugin: PluginInfo) {
    try {
      await engineApi.pluginSetEnabled(plugin.name, !plugin.enabled)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-[var(--text)]">
        {t('plugins.title')}
      </h2>
      {plugins.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-center">
          <p className="text-sm text-[var(--text)]">{t('plugins.empty')}</p>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">{t('plugins.emptyHint')}</p>
        </div>
      )}
      {plugins.map((plugin) => {
        const failing = plugin.diagnostics.filter((d) => d.code !== 'OK')
        return (
          <Section
            key={`${plugin.source}/${plugin.name}`}
            title={`${plugin.name} v${plugin.version}${plugin.enabled ? '' : ` · ${t('plugins.disabled')}`}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-subtle)]">
              <span>{plugin.source}</span>
              <span className="font-mono">{plugin.path}</span>
            </div>
            {plugin.capabilities.length > 0 && (
              <p className="text-xs text-[var(--text-subtle)]">
                {plugin.capabilities.join(', ')}
              </p>
            )}
            {failing.length > 0 ? (
              <div className="space-y-1">
                {failing.map((d, i) => (
                  <p key={i} className="rounded-lg bg-red-500/10 px-2.5 py-1.5 font-mono text-xs text-red-300">
                    {d.code}: {d.message}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-400">{t('plugins.healthy')}</p>
            )}
            <div>
              <button
                type="button"
                onClick={() => void toggle(plugin)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              >
                {plugin.enabled ? t('plugins.disable') : t('plugins.enable')}
              </button>
            </div>
          </Section>
        )
      })}
    </div>
  )
}
