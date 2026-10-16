import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Plus } from 'lucide-react'
import {
  commandMessage,
  engineApi,
  type ProviderSummary,
} from '../../services/engine'
import { useI18n, type I18nKey } from '../../i18n'
import ProviderLogo from '../../components/ProviderLogo'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
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
import ProviderForm, { initialForm, type ProviderFormData } from './ProviderForm'
import { registerProviderModels } from './registerModels'
import ProviderDetails, { type ProviderTestResult } from './ProviderDetails'
import ProviderUsagePanel from './ProviderUsagePanel'
import ProviderWizard from './ProviderWizard'
import ExperimentalProvidersSetting from './ExperimentalProvidersSetting'
import ResumeSetting from '../resume/ResumeSetting'
import ModelRolesSetting from './ModelRolesSetting'
import DisableProviderDialog from './DisableProviderDialog'
import { Switch } from '../../components/ui/switch'
import { useUIStore, type ProviderTab } from '../../stores/ui'
import { art } from '../rinari/art'

type Status = 'connected' | 'error' | 'noCredential' | 'unchecked' | 'off'
const STATUS_TONE: Record<Status, string | undefined> = { connected: 'success', error: 'danger', noCredential: 'warning', unchecked: undefined, off: undefined }

/** Un dato desconocido no es cero: sin comprobar se dice «Sin comprobar». */
export function providerStatus(provider: ProviderSummary): Status {
  if (provider.enabled === false) return 'off'
  if (provider.auth_method === 'api-key' && !provider.has_credential) return 'noCredential'
  if (provider.status_connected === true) return 'connected'
  if (provider.status_connected === false) return 'error'
  return 'unchecked'
}

const seconds = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/**
 * Ajustes > Proveedores (#97 B). Arriba lo global (respaldo y auxiliar);
 * luego una tarjeta por proveedor con su logo, estado, modelos, el anillo de
 * uso y el interruptor (desactivados al final y atenuados). Al abrir una,
 * sus pestañas y acciones. «Agregar proveedor» es el mismo asistente que el
 * primer arranque.
 */
export default function ProvidersView({
  providers,
  onChanged,
  engineCapabilities,
}: {
  providers: ProviderSummary[]
  onChanged: () => void
  engineCapabilities?: Record<string, boolean>
}) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ProviderSummary | null>(null)
  const [form, setForm] = useState<ProviderFormData>(() => initialForm())
  const [saving, setSaving] = useState(false)
  const [tests, setTests] = useState<Record<string, ProviderTestResult>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ProviderSummary | null>(null)
  const [disabling, setDisabling] = useState<ProviderSummary | null>(null)
  // «Revisar uso y límites» desde un error: abre esa tarjeta en esa pestaña.
  const focus = useUIStore((s) => s.providerFocus)
  const clearFocus = useUIStore((s) => s.clearProviderFocus)
  const [opened, setOpened] = useState<{ alias: string; tab: ProviderTab; at: number } | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  useEffect(() => {
    if (!focus) return
    const target = (focus.providerId ? providers.find((p) => p.id === focus.providerId) : undefined)
      ?? (focus.alias ? providers.find((p) => p.alias === focus.alias) : undefined)
    if (!target) {
      // La lista aún no llegó: se espera. Si llegó y no está, se dice; nunca
      // se abre otro proveedor en su lugar.
      if (providers.length > 0 || !(focus.providerId || focus.alias)) {
        setMissing(focus.alias ?? focus.providerId ?? '')
        clearFocus()
      }
      return
    }
    setMissing(null)
    setExpanded(target.alias)
    setOpened({ alias: target.alias, tab: focus.tab, at: Date.now() })
    clearFocus()
    requestAnimationFrame(() => {
      document.querySelector(`[data-anchor=${JSON.stringify(`provider:${target.id}`)}]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }, [focus, providers, clearFocus])
  const [switchTo, setSwitchTo] = useState('')

  function openEdit(provider: ProviderSummary) {
    // En edición no se cambia el tipo; el tipo real se conserva en el Engine
    // y aquí solo viajan los campos editables.
    setForm({
      ...initialForm(),
      alias: provider.alias,
      endpoint: provider.endpoint ?? '',
      auth: provider.auth_method === 'oauth' || provider.auth_method === 'none' || provider.auth_method === 'external-cli'
        ? provider.auth_method
        : 'api-key',
      credentialSource: 'literal',
      secret: '',
      secret_env: '',
      account_hint: provider.account_hint ?? '',
    })
    setEditing(provider)
  }

  async function saveEdit() {
    if (!editing) return
    const alias = form.alias.trim()
    if (alias === '') return
    setSaving(true)
    try {
      const patch: { alias?: string; endpoint?: string; account_hint?: string; secret?: string; secret_env?: string } = {}
      if (alias !== editing.alias) patch.alias = alias
      const endpoint = form.endpoint.trim()
      // Un runtime externo no tiene endpoint editable ni credencial: su
      // identidad (process://claude) es la que el Engine valida.
      const external = form.auth === 'external-cli'
      if (!external && endpoint !== (editing.endpoint ?? '')) patch.endpoint = endpoint
      if (form.account_hint !== (editing.account_hint ?? '')) patch.account_hint = form.account_hint
      // Solo el campo de la fuente activa puede rotar la credencial.
      if (form.auth === 'api-key') {
        if (form.credentialSource === 'env' && form.secret_env !== '') patch.secret_env = form.secret_env
        else if (form.credentialSource === 'literal' && form.secret !== '') patch.secret = form.secret
      }
      if (Object.keys(patch).length === 0) {
        setEditing(null)
        return
      }
      await engineApi.providerUpdate(editing.alias, patch)
      // Credencial o endpoint nuevos pueden traer otro catálogo.
      if (patch.secret || patch.secret_env || patch.endpoint !== undefined) {
        void registerProviderModels(patch.alias ?? editing.alias).then(onChanged)
      }
      if (patch.alias && expanded === editing.alias) setExpanded(patch.alias)
      setEditing(null)
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function testProvider(alias: string) {
    setTesting(alias)
    const started = performance.now()
    try {
      const result = await engineApi.providerTest(alias)
      setTests((prev) => ({ ...prev, [alias]: { connected: result.connected, detail: result.detail, models: result.models_discovered, ms: performance.now() - started } }))
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setTesting(null)
    }
  }

  async function useProvider(alias: string) {
    try {
      await engineApi.providerUse(alias)
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function removeProvider() {
    if (!deleting) return
    try {
      await engineApi.providerRemove(deleting.alias, deleting.active ? switchTo || undefined : undefined)
      setDeleting(null)
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function enableProvider(alias: string) {
    try {
      await engineApi.providerUpdate(alias, { enabled: true })
      toast.success(t('providers.enabledToast', { name: alias }))
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const others = deleting ? providers.filter((p) => p.alias !== deleting.alias) : []
  // Desactivados al final (#97), sin cambiar el orden de los demás.
  const ordered = [...providers.filter((p) => p.enabled !== false), ...providers.filter((p) => p.enabled === false)]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('providers.list')}</h2>
        <button type="button" onClick={() => setAdding(true)} className="btn btn-primary btn-sm">
          <Plus size={14} aria-hidden="true" /> {t('providers.add')}
        </button>
      </div>

      {missing !== null && (
        <p role="status" className="provider-missing">
          {missing ? t('providers.focusMissing', { name: missing }) : t('providers.focusUnknown')}
        </p>
      )}

      {providers.length > 0 && <ModelRolesSetting />}

      {providers.length === 0 && (
        <div className="dock-empty provider-empty">
          <img src={art.chibi('plug')} alt="" aria-hidden="true" />
          <p className="font-display text-base font-semibold text-[var(--text)]">{t('providers.emptyTitle')}</p>
          <p className="text-sm text-[var(--text-muted)]">{t('wizard.welcome')}</p>
          <button type="button" onClick={() => setAdding(true)} className="btn btn-primary btn-sm"><Plus size={14} aria-hidden="true" /> {t('providers.add')}</button>
        </div>
      )}

      <div className="provider-list">
        {ordered.map((provider) => {
          const isOpen = expanded === provider.alias
          const off = provider.enabled === false
          const status = providerStatus(provider)
          const test = tests[provider.alias]
          return (
            <section key={provider.id} data-anchor={`provider:${provider.id}`} className="settings-card provider-card" data-open={isOpen || undefined} data-off={off || undefined}>
              <h2 className="provider-card-head">
                {/* Toda la cabecera abre la tarjeta; el interruptor va al lado: no cabe dentro de un botón. */}
                <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : provider.alias)} className="provider-card-open">
                  <span className="provider-card-logo"><ProviderLogo productId={provider.product_id} alias={provider.alias} endpoint={provider.endpoint} size={24} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="provider-card-name">
                      <span className="truncate">{provider.alias}</span>
                      {provider.active && <span className="r-chip provider-chip" data-tone="accent">{t('providers.active')}</span>}
                      <span className="r-chip provider-chip" data-tone={STATUS_TONE[status]}>{status === 'off' ? t('providers.disabled') : t(`providers.status.${status}` as I18nKey)}</span>
                    </span>
                    <span className="provider-card-meta">
                      {provider.product_name ?? provider.type}
                      {provider.model_count !== undefined && <> · {t(provider.model_count === 1 ? 'providers.savedModelOne' : 'providers.savedModelCount', { n: provider.model_count })}</>}
                      {test?.connected && <> · {t('providers.lastTest', { s: seconds(test.ms) })}</>}
                    </span>
                  </span>
                  <ChevronDown size={16} aria-hidden="true" className="provider-card-chevron" />
                </button>
                {!off && engineCapabilities?.provider_usage_v1 && <ProviderUsagePanel key={`${provider.id}:${provider.updated_at}`} providerAlias={provider.alias} ring />}
                <Switch
                  data-testid="provider-enabled"
                  checked={!off}
                  aria-label={t('providers.enabledToggle', { name: provider.alias })}
                  onCheckedChange={(checked) => {
                    if (checked) void enableProvider(provider.alias)
                    else setDisabling(provider)
                  }}
                />
              </h2>
              {isOpen && (
                <div className="provider-card-body">
                  <ProviderDetails
                        key={`${provider.id}:${provider.updated_at}:${opened?.alias === provider.alias ? opened.at : 0}`}
                        provider={provider}
                        onChanged={onChanged}
                        initialTab={opened?.alias === provider.alias ? opened.tab : undefined}
                        test={test}
                        testing={testing === provider.alias}
                        onTest={() => void testProvider(provider.alias)}
                        onUse={() => void useProvider(provider.alias)}
                        onEdit={() => openEdit(provider)}
                        usage={engineCapabilities?.provider_usage_v1 === true}
                        onDelete={() => {
                          setDeleting(provider)
                          setSwitchTo(providers.find((p) => p.alias !== provider.alias)?.alias ?? '')
                        }}
                      />
                </div>
              )}
            </section>
          )
        })}
      </div>

      <ResumeSetting />
      <ExperimentalProvidersSetting />

      {adding && <ProviderWizard
        open
        mode="add"
        onClose={() => {
          // Aunque se cierre a medias, lo que ya se guardó tiene que verse.
          setAdding(false)
          onChanged()
        }}
      />}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('providers.edit')}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveEdit() }}>
            <ProviderForm form={form} setForm={setForm} allowPresetChange={false} isEdit />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">{t('providers.cancel')}</button>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{t('providers.save')}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <DisableProviderDialog provider={disabling} onClose={() => setDisabling(null)} onChanged={onChanged} />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('providers.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && t('providers.confirmDelete', { name: deleting.alias })}
              {/* El único proveedor también se puede quitar (plan 0.4.0 #19). */}
              {deleting && others.length === 0 && <> {t('providers.lastOne')}</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleting?.active && others.length > 0 && (
            <div className="px-6">
              <label className="field-label" htmlFor="provider-switch">{t('providers.switchTo')}</label>
              <select id="provider-switch" value={switchTo} onChange={(e) => setSwitchTo(e.target.value)} className="field-input">
                {others.map((p) => (
                  <option key={p.alias} value={p.alias}>{p.alias}</option>
                ))}
              </select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeProvider()}>{t('providers.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
