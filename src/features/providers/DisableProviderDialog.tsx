import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type ModelSummary, type ProviderSummary } from '../../services/engine'
import { useI18n } from '../../i18n'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { dependenciesOf, disableWithReplacement, hasDependencies, type ProviderDependencies } from './providerDependencies'
import { Select } from '../../components/ui/select'
import ProviderLogo from '../../components/ProviderLogo'

/**
 * Desactivar un proveedor (plan 0.4.0 #97): antes de confirmar dice qué
 * depende de él y deja elegir un modelo de otro proveedor activo para lo
 * global (modelo activo, respaldo, auxiliar y agentes).
 */
export default function DisableProviderDialog({
  provider,
  onClose,
  onChanged,
}: {
  provider: ProviderSummary | null
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [deps, setDeps] = useState<ProviderDependencies | null>(null)
  const [candidates, setCandidates] = useState<ModelSummary[]>([])
  const [replacement, setReplacement] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!provider) return
    let live = true
    setDeps(null)
    void Promise.all([
      engineApi.modelList(provider.alias, true),
      engineApi.modelList(),
      engineApi.modelRoles().catch(() => ({ roles: null })),
      engineApi.agentList().catch(() => ({ agents: [] })),
    ]).then(([own, enabled, roles, agents]) => {
      if (!live) return
      const found = dependenciesOf(provider, own.models, roles.roles, agents.agents)
      // Solo modelos de otros proveedores activos pueden reemplazarlo
      // (`model.list` sin `include_disabled` ya deja fuera los apagados).
      const others = enabled.models.filter((model) => model.provider_id !== provider.id)
      setDeps(found)
      setCandidates(others)
      setReplacement(others[0]?.id ?? '')
    }).catch((err: unknown) => {
      if (live) toast.error(commandMessage(err))
    })
    return () => { live = false }
  }, [provider])

  async function confirm() {
    if (!provider || !deps) return
    setBusy(true)
    try {
      const chosen = hasDependencies(deps) ? candidates.find((model) => model.id === replacement) ?? null : null
      await disableWithReplacement(provider, deps, chosen)
      toast.success(t('providers.disabledToast', { name: provider.alias }))
      onClose()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const lines = deps ? [
    deps.active && t('providers.disable.dependsActive'),
    deps.fallback && t('providers.disable.dependsFallback'),
    deps.auxiliary && t('providers.disable.dependsAuxiliary'),
    deps.agents.length > 0 && t('providers.disable.dependsAgents', { n: deps.agents.length, names: deps.agents.join(', ') }),
  ].filter((line): line is string => Boolean(line)) : []

  return (
    <AlertDialog open={provider !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-testid="disable-provider-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{provider ? t('providers.disable.title', { name: provider.alias }) : ''}</AlertDialogTitle>
          <AlertDialogDescription>{t('providers.disable.body')}</AlertDialogDescription>
        </AlertDialogHeader>
        {lines.length > 0 && (
          <div className="disable-provider-body">
            <ul className="disable-provider-deps" data-testid="disable-provider-deps">
              {lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {candidates.length > 0 ? (
              <div>
                <label className="field-label" htmlFor="provider-replacement">
                  {t('providers.disable.replacement')}
                </label>
                <Select
                  id="provider-replacement"
                  value={replacement}
                  onChange={setReplacement}
                  options={candidates.map((model) => ({ value: model.id, label: model.alias, detail: model.provider ?? undefined, icon: <ProviderLogo alias={model.provider ?? undefined} size={16} /> }))}
                />
              </div>
            ) : (
              <p className="field-hint">{t('providers.disable.noReplacement')}</p>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
          <AlertDialogAction disabled={busy || deps === null} onClick={(event) => { event.preventDefault(); void confirm() }}>
            {t('providers.disable.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
