import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type ModelRoles } from '../../services/engine'
import { useOptionalEngineData } from '../engine/EngineContext'

/**
 * Ajustes → Proveedores: el modelo de respaldo (sigue el turno cuando el
 * principal falla) y el auxiliar (llamadas internas, como los títulos), y si
 * la compactación usa el auxiliar (plan 0.4.0 #80). Sin elegir, todo usa el
 * modelo de la conversación, como antes.
 */
export default function ModelRolesSetting() {
  const { t } = useI18n()
  const models = useOptionalEngineData()?.models ?? []
  const [roles, setRoles] = useState<ModelRoles | null>(null)

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => engineApi.modelRoles())
      .then((result) => { if (alive) setRoles(result.roles) })
      .catch(() => { /* an older Engine: the setting is not shown */ })
    return () => { alive = false }
  }, [])

  if (!roles) return null

  async function change(next: Partial<{ fallback: string | null; auxiliary: string | null; auxiliary_compaction: boolean }>) {
    try {
      setRoles((await engineApi.setModelRoles(next)).roles)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const select = (role: 'fallback' | 'auxiliary') => (
    <select
      id={`model-role-${role}`}
      value={roles[role] ?? ''}
      onChange={(event) => void change({ [role]: event.target.value || null })}
      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm"
    >
      <option value="">{t('modelRoles.none')}</option>
      {models.map((model) => <option key={model.id} value={model.id}>{model.alias}{model.provider ? ` · ${model.provider}` : ''}</option>)}
    </select>
  )

  return (
    <section data-testid="model-roles" className="space-y-3 rounded-2xl border border-[var(--line-1)] px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="model-role-fallback" className="text-sm font-medium text-[var(--text)]">{t('modelRoles.fallback')}</label>
          {select('fallback')}
          <p className="text-xs text-[var(--text-subtle)]">{t('modelRoles.fallbackHint')}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="model-role-auxiliary" className="text-sm font-medium text-[var(--text)]">{t('modelRoles.auxiliary')}</label>
          {select('auxiliary')}
          <p className="text-xs text-[var(--text-subtle)]">{t('modelRoles.auxiliaryHint')}</p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <input
          type="checkbox"
          className="accent-[var(--accent)]"
          checked={roles.auxiliary_compaction}
          disabled={!roles.auxiliary}
          onChange={(event) => void change({ auxiliary_compaction: event.target.checked })}
        />
        {t('modelRoles.compaction')}
      </label>
    </section>
  )
}
