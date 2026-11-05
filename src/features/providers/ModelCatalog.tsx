import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Eye, EyeOff, LoaderCircle, Pencil, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  onEngineEvent,
  type ModelSummary,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { useConfirm } from '../../components/ui/useConfirm'
import { inputClass } from '../../components/settings/parts'
import { registerProviderModels } from './registerModels'
import { ModelOutputCap } from './ProviderConnectionSettings'

/**
 * Los modelos de un proveedor (#92, #93). Lo que el proveedor anuncia ya está
 * guardado: no hay «Guardar». Cada modelo es una fila de solo lectura con
 * «Editar» (alias y máximo de salida), «Usar», «Probar» y «Quitar»; quitar lo
 * oculta y «Ocultos (n)» lo recupera. La lista se recarga sola con
 * `models.changed`. Compartido entre Ajustes y el wizard.
 *
 * Con `choice`, «Usar» no cambia el modelo activo del Engine: marca la
 * elección, que el wizard aplica al continuar. Ahí también se elige solo
 * (hallazgo del primer uso): el modelo que se vuelve a mostrar o que pasa la
 * prueba, el único del proveedor, y el nuevo alias si se renombra el elegido.
 * Con uno elegido, la lista queda plegada tras «Ver los N modelos».
 */
export default function ModelCatalog({
  providerAlias,
  onChanged,
  choice,
}: {
  providerAlias: string
  onChanged: () => void
  choice?: { chosen: string | null; onChoose: (alias: string | null) => void }
}) {
  const { t, lang } = useI18n()
  const [saved, setSaved] = useState<ModelSummary[] | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const confirm = useConfirm()
  const savingFirst = useRef(false)
  // El ID del modelo que se acaba de volver a mostrar: se elige al llegar.
  const shown = useRef<string | null>(null)
  // El alias nuevo del elegido, hasta que la lista recargada lo traiga.
  const renamed = useRef<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [listed, hiddenList] = await Promise.all([
        engineApi.modelList(providerAlias, true),
        engineApi.modelHiddenList(providerAlias).catch(() => ({ hidden: [] as string[] })),
      ])
      setSaved(listed.models)
      setHidden(Array.isArray(hiddenList?.hidden) ? hiddenList.hidden : [])
    } catch (err) {
      setSaved((current) => current ?? [])
      toast.error(commandMessage(err))
    }
  }, [providerAlias])

  useEffect(() => { void reload() }, [reload])
  // Every list reloads on its own when models change (#93).
  useEffect(() => {
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event === 'models.changed') void reload()
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => { disposed = true; stop?.() }
  }, [reload])
  // A provider just added has nothing yet: its models are being saved.
  useEffect(() => {
    if (saved === null || saved.length > 0 || savingFirst.current) return
    savingFirst.current = true
    setRefreshing(true)
    void registerProviderModels(providerAlias).then(() => reload()).finally(() => setRefreshing(false))
  }, [saved, providerAlias, reload])

  const chosen = choice?.chosen ?? null
  const onChoose = choice?.onChoose
  useEffect(() => {
    if (!onChoose || saved === null) return
    const back = shown.current ? saved.find((model) => model.provider_model_id === shown.current) : undefined
    if (back) {
      shown.current = null
      if (back.alias !== chosen) onChoose(back.alias)
      return
    }
    if (renamed.current && saved.some((model) => model.alias === renamed.current)) renamed.current = null
    // Un elegido que ya no está (quitado) deja de estarlo; el único, se elige.
    if (chosen && chosen !== renamed.current && !saved.some((model) => model.alias === chosen)) onChoose(null)
    else if (!chosen && saved.length === 1) onChoose(saved[0].alias)
  }, [saved, chosen, onChoose])

  const act = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await work()
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }
  const useModel = (ref: string) => {
    if (choice) { choice.onChoose(ref); return }
    void act(`use:${ref}`, () => engineApi.modelUse(ref, providerAlias))
  }
  const testModel = async (ref: string) => {
    setBusy(`test:${ref}`)
    try {
      const result = await engineApi.modelTest(ref, providerAlias)
      if (result.ok) toast.success(result.detail)
      else toast.error(result.detail)
      // Probado y funcionando: en el asistente, es el que queda elegido.
      if (result.ok && onChoose) onChoose(ref)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(null)
    }
  }
  const removeModel = async (model: ModelSummary) => {
    const sure = await confirm.ask({
      title: t('models.removeTitle', { alias: model.alias }),
      body: t('models.removeBody'),
      confirmLabel: t('providers.modelRemove'),
      cancelLabel: t('common.cancel'),
    })
    if (sure) void act(`rm:${model.alias}`, () => engineApi.modelRemove(model.alias, providerAlias))
  }
  const refresh = async () => {
    setRefreshing(true)
    try {
      await registerProviderModels(providerAlias)
      await reload()
      onChanged()
    } finally {
      setRefreshing(false)
    }
  }

  if (saved === null) return <div className="h-20 rounded-[var(--r-md)] bg-[var(--bg-active)] motion-safe:animate-pulse" aria-busy="true" />
  // En el asistente, el elegido va primero; con él a la vista, el resto se pliega.
  const chosenRow = choice && chosen ? saved.find((model) => model.alias === chosen) : undefined
  const ordered = chosenRow ? [chosenRow, ...saved.filter((model) => model !== chosenRow)] : saved
  const folds = Boolean(chosenRow) && saved.length > 1
  const rows = folds && !showAll ? [chosenRow!] : ordered
  return (
    <div className="space-y-3" data-testid="model-catalog">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-subtle)]">{t('providers.modelRefreshNote')}</p>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="btn btn-secondary btn-sm">
          {refreshing ? <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
          {refreshing ? t('providers.refreshing') : t('providers.refresh')}
        </button>
      </div>

      {saved.length === 0 && (
        <p className="text-sm text-[var(--text-subtle)]" role="status">{refreshing ? t('models.saving') : t('providers.noDiscovered')}</p>
      )}

      {rows.map((model) => {
        const active = choice ? choice.chosen === model.alias : model.active
        return (
          <div key={model.id} className="model-row" data-testid="model-row" data-editing={editing === model.id || undefined}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 basis-44">
                <span className="block truncate text-sm font-semibold text-[var(--text)]">
                  {model.alias}
                  {active && <span className="r-chip ml-2" data-tone="accent">{t('providers.active')}</span>}
                </span>
                <span className="block truncate font-mono text-[11px] text-[var(--text-subtle)]">{model.provider_model_id}</span>
                <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                  {typeof model.capabilities?.max_context_tokens === 'number' && <span>{t('providers.contextTokens', { n: model.capabilities.max_context_tokens.toLocaleString(lang) })}</span>}
                  {model.capabilities?.vision === true && <span>{t('providers.visionCapability')}</span>}
                  {model.capabilities?.reasoning_effort === true && <span>{t('providers.reasoningCapability')}</span>}
                </span>
              </span>
              <button type="button" className="btn btn-quiet btn-sm" aria-expanded={editing === model.id} onClick={() => setEditing(editing === model.id ? null : model.id)}>
                <Pencil size={12} aria-hidden="true" /> {t('models.edit')}
              </button>
              {!active && <button type="button" onClick={() => useModel(model.alias)} disabled={busy !== null} className="btn btn-secondary btn-sm">{t('providers.modelUse')}</button>}
              <button type="button" onClick={() => void testModel(model.alias)} disabled={busy !== null} className="btn btn-ghost btn-sm">
                {busy === `test:${model.alias}` && <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" />} {t('providers.modelTest')}
              </button>
              <button type="button" onClick={() => void removeModel(model)} disabled={busy !== null} className="btn btn-ghost btn-sm model-row-remove">{t('providers.modelRemove')}</button>
            </div>
            {editing === model.id && (
              <ModelEditor
                model={model}
                providerAlias={providerAlias}
                onDone={(alias) => {
                  if (onChoose && chosen === model.alias) { renamed.current = alias; onChoose(alias) }
                  setEditing(null)
                  void reload()
                  onChanged()
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>
        )
      })}

      {folds && (
        <button type="button" className="btn btn-quiet btn-sm model-catalog-more" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)} data-testid="model-catalog-more">
          <ChevronDown size={13} aria-hidden="true" className={showAll ? 'rotate-180' : undefined} />
          {showAll ? t('models.onlyChosen') : t('models.showAll', { n: saved.length })}
        </button>
      )}

      {hidden.length > 0 && (
        <div className="model-hidden">
          <button type="button" className="btn btn-quiet btn-sm" aria-expanded={showHidden} onClick={() => setShowHidden((value) => !value)}>
            <EyeOff size={12} aria-hidden="true" /> {t('models.hidden', { n: hidden.length })}
          </button>
          {showHidden && (
            <ul className="mt-2 space-y-1" data-testid="hidden-models">
              {hidden.map((id) => (
                <li key={id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-muted)]">{id}</span>
                  <button type="button" className="btn btn-quiet btn-xs" disabled={busy !== null} onClick={() => { if (onChoose) shown.current = id; void act(`show:${id}`, () => engineApi.modelUnhide(providerAlias, id)) }}>
                    <Eye size={12} aria-hidden="true" /> {t('models.show')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {confirm.dialog}
    </div>
  )
}

/** «Editar»: el alias (Enter guarda, Esc cancela) y el máximo de salida (#92, #96). */
function ModelEditor({ model, providerAlias, onDone, onCancel }: { model: ModelSummary; providerAlias: string; onDone: (alias: string) => void; onCancel: () => void }) {
  const { t } = useI18n()
  const [alias, setAlias] = useState(model.alias)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const next = alias.trim()
    if (!next || next === model.alias) { onCancel(); return }
    setBusy(true)
    setError('')
    try {
      await engineApi.modelAlias(model.alias, next, providerAlias)
      toast.success(t('adv.saved'))
      onDone(next)
    } catch (err) {
      setError(commandMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="model-editor" data-testid="model-editor">
      <label className="adv-field" data-invalid={error ? true : undefined}>
        <span>{t('providers.modelAlias')}</span>
        <input autoFocus className={inputClass} value={alias} onChange={(event) => setAlias(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') void save()
          if (event.key === 'Escape') onCancel()
        }} />
        {error && <small role="alert">{error}</small>}
      </label>
      <ModelOutputCap modelId={model.id} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{t('providers.save')}</button>
      </div>
    </div>
  )
}
