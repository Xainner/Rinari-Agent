import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  onEngineEvent,
  type DiscoveredModel,
  type ModelRefreshResult,
  type ModelSummary,
  type ProviderSummary,
} from '../../services/engine'

/**
 * CatalogState: proveedores y modelos. Degradado independiente — un fallo
 * aquí nunca bloquea el shell; la sección se reintenta por separado.
 */
export function useCatalog() {
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [models, setModels] = useState<ModelSummary[]>([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const providersRef = useRef<ProviderSummary[]>([])

  const mergeDiscovered = useCallback((found: Record<string, DiscoveredModel[]>) => {
    setModels((current) => {
      const saved = current.filter((model) => model.saved !== false)
      const savedKeys = new Set(saved.map((model) => `${model.provider_id}\0${model.provider_model_id}`))
      const discovered = providersRef.current.flatMap((provider) =>
        (found[provider.alias] ?? []).map<ModelSummary>((model) => ({
          id: `catalog:${provider.id}:${model.provider_model_id}`,
          alias: model.provider_model_id,
          provider_id: provider.id,
          provider: provider.alias,
          provider_model_id: model.provider_model_id,
          capabilities: model.capabilities,
          availability: model.availability,
          settings: {},
          active: false,
          saved: false,
        })),
      )
      const retained = current.filter(
        (model) => model.saved === false && !(model.provider && found[model.provider]),
      )
      return [
        ...saved,
        ...retained,
        ...discovered.filter(
          (model) => !savedKeys.has(`${model.provider_id}\0${model.provider_model_id}`),
        ),
      ]
    })
  }, [])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void onEngineEvent((event) => {
      if (event.event === 'model.discovery.completed' && event.payload.providers) {
        mergeDiscovered(event.payload.providers as Record<string, DiscoveredModel[]>)
      }
      if (event.event === 'model.discovery.failed') {
        const error = event.payload.error as { message?: string } | undefined
        setCatalogError(error?.message ?? 'Model discovery failed')
      }
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [mergeDiscovered])

  const refreshCatalog = useCallback(async (discover = true): Promise<void> => {
    try {
      const [p, m] = await Promise.all([engineApi.providerList(), engineApi.modelList()])
      providersRef.current = p.providers
      setProviders(p.providers)
      setModels(m.models.map((model) => ({ ...model, saved: true })))
      setCatalogError(null)
      if (discover) {
        for (const provider of p.providers) {
          void engineApi.modelDiscoveryStart(provider.alias).then((job) => {
            if (job.providers) mergeDiscovered(job.providers)
          }).catch((err: unknown) => setCatalogError(commandMessage(err)))
        }
      }
    } catch (err) {
      // Catálogo degradado, nunca bloqueo del shell: el engine sigue usable
      // y la sección se puede reintentar de forma independiente.
      setCatalogError(commandMessage(err))
      toast.error(commandMessage(err))
    } finally {
      setCatalogLoaded(true)
    }
  }, [mergeDiscovered])

  /**
   * Re-reads every provider: availability, capabilities and context windows
   * of the saved models, plus the models a provider started offering, which
   * are saved. The list is reloaded when it finishes.
   */
  const refreshModels = useCallback(async (): Promise<ModelRefreshResult> => {
    const result = await engineApi.modelRefresh(undefined, true)
    await refreshCatalog(false)
    return result
  }, [refreshCatalog])

  return {
    providers,
    models,
    catalogLoaded,
    catalogError,
    refreshCatalog,
    discoverCatalog: () => refreshCatalog(true),
    refreshModels,
  }
}

export type Catalog = ReturnType<typeof useCatalog>
