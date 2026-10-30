import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, engineApi, type ModelRoles } from '../../services/engine'
import { useOptionalEngineData } from '../engine/EngineContext'
import { Section } from '../../components/settings/parts'

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
      className="field-input"
    >
      <option value="">{t('modelRoles.none')}</option>
      {models.map((model) => <option key={model.id} value={model.id}>{model.alias}{model.provider ? ` · ${model.provider}` : ''}</option>)}
    </select>
  )

  return (
    <div data-testid="model-roles">
      <Section title={t('modelRoles.title')} desc={t('modelRoles.desc')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="model-role-fallback" className="field-label">{t('modelRoles.fallback')}</label>
            {select('fallback')}
            <p className="field-hint">{t('modelRoles.fallbackHint')}</p>
          </div>
          <div>
            <label htmlFor="model-role-auxiliary" className="field-label">{t('modelRoles.auxiliary')}</label>
            {select('auxiliary')}
            <p className="field-hint">{t('modelRoles.auxiliaryHint')}</p>
          </div>
        </div>
        <label className="model-roles-compaction" data-disabled={!roles.auxiliary || undefined}>
          <input
            type="checkbox"
            className="r-checkbox"
            checked={roles.auxiliary_compaction}
            disabled={!roles.auxiliary}
            onChange={(event) => void change({ auxiliary_compaction: event.target.checked })}
          />
          {t('modelRoles.compaction')}
        </label>
      </Section>
    </div>
  )
}
