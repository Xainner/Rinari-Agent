import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  onEngineEvent,
  type ModelRefreshResult,
  type ModelSummary,
  type ProviderSummary,
} from '../../services/engine'
import { translate } from '../../i18n'
import { useUIStore } from '../../stores/ui'

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

  const refreshRef = useRef<(discover?: boolean) => Promise<void>>(async () => {})
  // What a provider offers is saved by the Engine (#93): a discovery that
  // added models, or any change, reloads the saved list. Nothing is listed
  // «sin guardar» any more.
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void onEngineEvent((event) => {
      if (event.event === 'models.changed') void refreshRef.current(false)
      if (event.event === 'model.discovery.completed') {
        const added = event.payload.added as Record<string, string[]> | undefined
        if (added && Object.keys(added).length > 0) {
          void refreshRef.current(false)
          // «OpenCode Go: 2 modelos nuevos» (#93): the start-up discovery saved them.
          const lang = useUIStore.getState().lang
          for (const [provider, aliases] of Object.entries(added)) {
            if (aliases.length > 0) toast(translate(lang, aliases.length === 1 ? 'models.newOne' : 'models.new', { provider, n: aliases.length }))
          }
        }
      }
      if (event.event === 'model.discovery.failed') {
        const error = event.payload.error as { message?: string } | undefined
        setCatalogError(error?.message ?? translate(useUIStore.getState().lang, 'models.discoveryFailed'))
      }
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const refreshCatalog = useCallback(async (discover = true): Promise<void> => {
    try {
      const [p, m] = await Promise.all([engineApi.providerList(), engineApi.modelList()])
      providersRef.current = p.providers
      setProviders(p.providers)
      setModels(m.models.map((model) => ({ ...model, saved: true })))
      setCatalogError(null)
      if (discover) {
        // A turned-off provider gets no call at all (#97).
        for (const provider of p.providers.filter((item) => item.enabled !== false)) {
          void engineApi.modelDiscoveryStart(provider.alias).then((job) => {
            if (job.added && Object.keys(job.added).length > 0) void refreshRef.current(false)
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
  }, [])
  refreshRef.current = refreshCatalog

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
