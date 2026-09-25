import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type NativeTool,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { Section } from '../../components/settings/parts'
import SavedGrants from './SavedGrants'

/**
 * Ajustes > Tools: centro de herramientas y permisos. Solo lectura del
 * policy real del engine (modo→perfil) + catálogo de tools nativas.
 * No hay presets que compilen a policy en v1: la UI no inventa semántica.
 */
export default function ToolsView() {
  const { t } = useI18n()
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [tools, setTools] = useState<NativeTool[]>([])
  const [query, setQuery] = useState('')
  const filtered = tools.filter(tool =>
    `${tool.name} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const namespaces = [...new Set(filtered.map(tool => tool.name.split('.')[0]))].sort()

  const reload = useCallback(async () => {
    try {
      const [policy, catalog] = await Promise.all([
        engineApi.policyGet(),
        engineApi.toolList(),
      ])
      setMapping(policy.mode_profile)
      setNote(policy.note)
      setTools(catalog.tools)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-[var(--text)]">
        {t('tools.title')}
      </h2>

      <Section title={t('tools.policy')}>
        <div className="space-y-1 text-sm">
          {Object.entries(mapping).map(([mode, profile]) => (
            <div key={mode} className="flex items-center justify-between">
              <span className="font-semibold uppercase text-[var(--text)]">{mode}</span>
              <span className="font-mono text-xs text-[var(--text-muted)]">{profile}</span>
            </div>
          ))}
        </div>
        {note !== '' && (
          <p className="text-xs text-[var(--text-subtle)]">{note}</p>
        )}
      </Section>

      <SavedGrants />

      <Section title={t('tools.catalog', { n: String(tools.length) })}>
        <p className="text-xs text-[var(--text-subtle)]">{t('tools.catalogNote')}</p>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)}
          aria-label={t('tools.search')} placeholder={t('tools.search')}
          className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm" />
        <div className="max-h-96 space-y-1 overflow-auto">
          {namespaces.map(namespace => <section key={namespace}>
            <h3 className="px-2 py-2 text-xs font-semibold uppercase text-[var(--text-muted)]">{namespace}</h3>
            {filtered.filter(tool => tool.name.startsWith(`${namespace}.`)).map((tool) => (
            <details
              key={tool.name}
              className="rounded-lg px-2 py-1 hover:bg-[var(--bg-hover)]"
            >
              <summary className="cursor-pointer text-xs">
              <span className="font-mono text-xs text-[var(--text)]">{tool.name}</span>
              <span className="ml-3 font-mono text-[11px] text-[var(--text-subtle)]">
                {tool.risk}
              </span>
              </summary>
              <p className="py-2 text-xs text-[var(--text-muted)]">{tool.description}</p>
              {tool.availability?.available === false && <p role="status" className="text-xs text-amber-500">{tool.availability.reason}</p>}
            </details>
          ))}</section>)}
          {filtered.length === 0 && <p className="p-2 text-xs text-[var(--text-muted)]">{t('tools.noResults')}</p>}
        </div>
      </Section>
    </div>
  )
}
