import { useEffect, useState } from 'react'
import { Box, Check, ChevronDown, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '../../i18n'
import { commandMessage, type ModelRefreshResult, type ModelSummary, type ProviderSummary } from '../../services/engine'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { brandForProvider } from '../../lib/providerBrand'
import ProviderLogo from '../ProviderLogo'
import { cn } from '../../lib/utils'

export interface ModelPickerProps {
  models: ModelSummary[]
  /** Catálogo de proveedores para resolver el logo por alias/endpoint. */
  providers?: ProviderSummary[]
  /** Alias mostrado en el disparador; `null` sin modelo. */
  activeAlias: string | null
  activeModel?: ModelSummary | null
  /** Selección efectiva de esta sesión; el picker no decide default global ni sesión. */
  onUseModel: (model: ModelSummary) => void
  onDiscoverModels: () => void
  /** Vuelve a leer los proveedores y guarda sus modelos nuevos; sin él no se ofrece. */
  onRefreshModels?: () => Promise<ModelRefreshResult>
  onOpenProviders: () => void
  disabled?: boolean
  /** Header de panel: disparador más estrecho. */
  compact?: boolean
  /** Etiqueta cuando el modelo guardado no existe en el catálogo. */
  missingLabel?: string
  /** Cada incremento abre el selector (comando `/model`). */
  openSignal?: number
}

/** Qué contar de un refresco: los alias añadidos y los proveedores que fallaron. */
export function refreshSummary(result: ModelRefreshResult): { added: string[]; failed: string[] } {
  const rows = Object.entries(result.providers)
  return {
    added: rows.flatMap(([, row]) => row.added ?? []),
    failed: rows.filter(([, row]) => row.error).map(([alias, row]) => `${alias}: ${row.error}`),
  }
}

/**
 * Selector de modelo compartido por el Composer y el header de cada panel.
 * Mantiene su propio estado de búsqueda/colapso: escribir en A no afecta a B.
 * No importa `modelUse`, la sesión activa ni el store del board.
 */
export default function ModelPicker({
  models,
  providers,
  activeAlias,
  activeModel,
  onUseModel,
  onDiscoverModels,
  onRefreshModels,
  onOpenProviders,
  disabled = false,
  compact = false,
  openSignal,
  missingLabel,
}: ModelPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!openSignal) return
    setOpen(true)
    setQuery('')
    onDiscoverModels()
    // Solo reacciona al incremento de la señal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    if (!onRefreshModels || refreshing) return
    setRefreshing(true)
    try {
      const { added, failed } = refreshSummary(await onRefreshModels())
      const names = added.length > 3 ? `${added.slice(0, 3).join(', ')} +${added.length - 3}` : added.join(', ')
      const description = [
        added.length > 0 ? t('composer.refreshModels.added', { names }) : null,
        failed.length > 0 ? t('composer.refreshModels.partial', { providers: failed.join(' · ') }) : null,
      ].filter(Boolean).join(' · ')
      toast(t('composer.refreshModels.done'), { id: 'rinari-model-refresh', description: description || undefined })
    } catch (error) {
      toast.error(t('composer.refreshModels.failed', { detail: commandMessage(error) }), { id: 'rinari-model-refresh' })
    } finally {
      setRefreshing(false)
    }
  }
  const providerGroups = [...new Set(models.map((model) => model.provider ?? 'Otros'))]
  const providerEndpoint = (alias: string | null | undefined) =>
    providers?.find((provider) => provider.alias === alias)?.endpoint ?? null
  const activeProvider =
    (activeModel ?? models.find((model) => model.alias === activeAlias))?.provider ?? activeAlias
  const activeBrand = brandForProvider({ alias: activeProvider, endpoint: providerEndpoint(activeProvider) })
  const normalizedQuery = query.trim().toLowerCase()
  const matchingModels = normalizedQuery
    ? models.filter((model) => [model.alias, model.provider, model.provider_model_id].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
    : models
  const label = activeAlias ?? missingLabel ?? t('composer.noModel')

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setQuery(''); onDiscoverModels() } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={t('composer.chooseModel')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text)] disabled:opacity-40',
            compact ? 'max-w-[180px] px-2.5 py-1' : 'max-w-[220px] px-3 py-1.5',
            !activeAlias && missingLabel && 'text-[var(--text-subtle)]',
          )}
        >
          {activeBrand ? (
            <ProviderLogo brand={activeBrand} size={14} />
          ) : (
            <Box size={13} aria-hidden="true" className="shrink-0" />
          )}
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex min-h-0 w-64 flex-col overflow-hidden p-1.5"
        style={{
          maxHeight: 'min(32rem, var(--radix-popover-content-available-height))',
        }}
      >
        <div className="shrink-0 border-b border-[var(--border)] p-1.5">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 focus-within:border-[var(--border-strong)]">
            <Search size={13} aria-hidden="true" className="text-[var(--text-subtle)]" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('composer.searchModels')} className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
          {models.length === 0 && (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenProviders() }}
              className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              {t('composer.noModelsSetup')}
            </button>
          )}
          {models.length > 0 && matchingModels.length === 0 && <p className="px-2.5 py-6 text-center text-xs text-[var(--text-subtle)]">No se encontraron modelos.</p>}
          {providerGroups.filter((provider) => matchingModels.some((model) => (model.provider ?? 'Otros') === provider)).map((provider) => <section key={provider} aria-label={provider}>
            <h3 className="text-[11px] font-semibold text-[var(--text-subtle)]">
              <button type="button" aria-expanded={Boolean(query.trim()) || !collapsedProviders.has(provider)} onClick={() => setCollapsedProviders((current) => { const next = new Set(current); if (next.has(provider)) next.delete(provider); else next.add(provider); return next })} disabled={Boolean(query.trim())} className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] disabled:cursor-default">
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  <ProviderLogo alias={provider} endpoint={providerEndpoint(provider)} size={13} />
                </span>
                <span className="flex-1">{provider}</span>
                <ChevronDown size={13} aria-hidden="true" className={`transition-transform ${!query.trim() && collapsedProviders.has(provider) ? '-rotate-90' : ''}`} />
              </button>
            </h3>
            {(Boolean(query.trim()) || !collapsedProviders.has(provider)) && matchingModels.filter((model) => (model.provider ?? 'Otros') === provider).map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => { setOpen(false); onUseModel(model) }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--text)]">
                    {model.alias}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-[var(--text-subtle)]">
                    {model.provider ?? ''} · {model.provider_model_id}
                  </span>
                </span>
                {(activeModel ? activeModel.id === model.id : model.active) && (
                  <Check size={14} aria-hidden="true" className="shrink-0 text-[var(--accent-2)]" />
                )}
              </button>
            ))}</section>)}
        </div>
        {(models.length > 0 || onRefreshModels) && (
          <div className="shrink-0 border-t border-[var(--border)] pt-1">
            {onRefreshModels && (
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-busy={refreshing}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-60"
              >
                <RefreshCw size={13} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
                {refreshing ? t('composer.refreshingModels') : t('composer.refreshModels')}
              </button>
            )}
            {models.length > 0 && (
              <button
                type="button"
                onClick={() => { setOpen(false); onOpenProviders() }}
                className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              >
                {t('composer.manageModels')}
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
