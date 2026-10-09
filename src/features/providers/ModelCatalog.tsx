import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type DiscoveredModel,
  type ModelSummary,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { modelTechnicalId } from '../../lib/modelDisplay'
import { registerProviderModels } from './registerModels'

/**
 * Catálogo de modelos de un proveedor: guardados (usar/probar/quitar) y, si
 * quedara alguno descubierto sin guardar, su alta. Al configurar el proveedor
 * el Engine ya guarda todo el catálogo; «Actualizar» añade los nuevos.
 * Compartido entre Ajustes y el wizard.
 *
 * Con `choice`, «Usar» no cambia el modelo activo del Engine: marca la
 * elección, que el wizard aplica al continuar.
 */
export default function ModelCatalog({
  providerAlias,
  onChanged,
  choice,
}: {
  providerAlias: string
  onChanged: () => void
  choice?: { chosen: string | null; onChoose: (alias: string) => void }
}) {
  const { t, lang } = useI18n()
  const [discovered, setDiscovered] = useState<DiscoveredModel[]>([])
  const [saved, setSaved] = useState<ModelSummary[]>([])
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [found, listed] = await Promise.all([
        engineApi.modelDiscover(providerAlias),
        engineApi.modelList(providerAlias),
      ])
      const items = found.providers[providerAlias] ?? []
      setDiscovered(items)
      setSaved(listed.models)
      setAliases((prev) => {
        const next = { ...prev }
        for (const item of items) {
          if (!(item.provider_model_id in next)) next[item.provider_model_id] = item.provider_model_id
        }
        return next
      })
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [providerAlias])

  useEffect(() => {
    void reload()
  }, [reload])

  const savedIds = new Set(saved.map((m) => m.provider_model_id))
  const pending = discovered.filter((d) => !savedIds.has(d.provider_model_id))

  async function saveModel(item: DiscoveredModel) {
    // The alias is optional: by default the model keeps the name it brings,
    // which is unique within its provider. Rename it later if you want.
    const alias = (aliases[item.provider_model_id] ?? '').trim() || item.provider_model_id
    setBusy(`save:${item.provider_model_id}`)
    try {
      await engineApi.modelAdd({
        provider: providerAlias,
        provider_model_id: item.provider_model_id,
        alias,
        capabilities: item.capabilities,
      })
      toast.success(t('wizard.modelSaved', { alias }))
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function useModel(ref: string) {
    if (choice) {
      choice.onChoose(ref)
      return
    }
    setBusy(`use:${ref}`)
    try {
      await engineApi.modelUse(ref, providerAlias)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function removeModel(ref: string) {
    setBusy(`rm:${ref}`)
    try {
      await engineApi.modelRemove(ref, providerAlias)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function testModel(ref: string) {
    setBusy(`test:${ref}`)
    try {
      const result = await engineApi.modelTest(ref, providerAlias)
      if (result.ok) toast.success(result.detail)
      else toast.error(result.detail)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await registerProviderModels(providerAlias)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-subtle)]">{t('providers.modelRefreshNote')}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
        >
          {refreshing ? t('providers.refreshing') : t('providers.refresh')}
        </button>
      </div>

      {pending.length === 0 && saved.length === 0 && (
        <p className="text-sm text-[var(--text-subtle)]">{t('providers.noDiscovered')}</p>
      )}

      {pending.map((item) => (
        <div
          key={item.provider_model_id}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">
            {typeof item.capabilities?.label === 'string' && item.capabilities.label ? (
              <>
                {item.capabilities.label}{' '}
                <span className="font-mono text-[11px] text-[var(--text-subtle)]">{modelTechnicalId(item)}</span>
              </>
            ) : (
              <span className="font-mono">{item.provider_model_id}</span>
            )}
          </span>
          <input
            value={aliases[item.provider_model_id] ?? ''}
            onChange={(e) =>
              setAliases((prev) => ({ ...prev, [item.provider_model_id]: e.target.value }))
            }
            aria-label={t('providers.modelAlias')}
            placeholder={t('providers.modelAliasOptional')}
            className="w-36 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-xs outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--accent-2)]/60"
          />
          <button
            type="button"
            onClick={() => void saveModel(item)}
            disabled={busy !== null || item.capabilities?.route_supported === false}
            className="btn btn-primary btn-sm"
          >
            {t('providers.save')}
          </button>
          {item.capabilities?.route_supported === false && <p className="w-full text-xs text-[var(--text-muted)]">{t('providers.routeUnsupported')}</p>}
        </div>
      ))}

      {saved.map((model) => (
        <div
          key={model.id}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2"
        >
          <span className="min-w-0 flex-1 basis-44">
            <span className="block truncate text-sm font-semibold text-[var(--text)]">
              {model.alias}
              {(choice ? choice.chosen === model.alias : model.active) && (
                <span className="ml-2 rounded-md bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-2)]">
                  {t('providers.active')}
                </span>
              )}
            </span>
            <span className="block truncate font-mono text-[11px] text-[var(--text-subtle)]">
              {model.provider_model_id}
            </span>
            <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
              {typeof model.capabilities?.max_context_tokens === 'number' && <span>{t('providers.contextTokens', { n: model.capabilities.max_context_tokens.toLocaleString(lang) })}</span>}
              {model.capabilities?.vision === true && <span>{t('providers.visionCapability')}</span>}
              {model.capabilities?.reasoning_effort === true && <span>{t('providers.reasoningCapability')}</span>}
            </span>
          </span>
          {!(choice ? choice.chosen === model.alias : model.active) && (
            <button
              type="button"
              onClick={() => void useModel(model.alias)}
              disabled={busy !== null}
              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              {t('providers.modelUse')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void testModel(model.alias)}
            disabled={busy !== null}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            {t('providers.modelTest')}
          </button>
          <button
            type="button"
            onClick={() => void removeModel(model.alias)}
            disabled={busy !== null}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            {t('providers.modelRemove')}
          </button>
        </div>
      ))}
      {pending.length > 0 && (
        <p className="text-xs text-[var(--text-subtle)]">{t('providers.pendingHint', { n: pending.length })}</p>
      )}
    </div>
  )
}
