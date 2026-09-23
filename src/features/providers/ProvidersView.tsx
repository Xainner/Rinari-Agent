import { useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type ProviderHealth,
  type ProviderSummary,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { Section } from '../../components/settings/parts'
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
import ProviderDetails from './ProviderDetails'
import ProviderUsagePanel from './ProviderUsagePanel'
import ModelCatalog from './ModelCatalog'

/** Ajustes > Proveedores: tarjetas con estado, probar, usar, editar y eliminar. */
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
  const [dialog, setDialog] = useState<
    | { mode: 'add' }
    | { mode: 'edit'; provider: ProviderSummary }
    | null
  >(null)
  const [form, setForm] = useState<ProviderFormData>(() => initialForm())
  const [saving, setSaving] = useState(false)
  const [health, setHealth] = useState<Record<string, ProviderHealth>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ProviderSummary | null>(null)
  const [switchTo, setSwitchTo] = useState('')

  function openAdd() {
    setForm(initialForm())
    setDialog({ mode: 'add' })
  }

  function openEdit(provider: ProviderSummary) {
    // En edición no se cambia el preset (selector oculto); el tipo real se
    // conserva en el engine y aquí solo viajan los campos editables.
    setForm({
      ...initialForm(),
      alias: provider.alias,
      endpoint: provider.endpoint ?? '',
      auth: provider.auth_method === 'oauth' ? 'oauth' : provider.auth_method === 'none' ? 'none' : 'api-key',
      credentialSource: 'literal',
      secret: '',
      secret_env: '',
      account_hint: provider.account_hint ?? '',
    })
    setDialog({ mode: 'edit', provider })
  }

  async function save() {
    const alias = form.alias.trim()
    if (alias === '') return
    if (!form.preset?.provider_type) {
      toast.error(t('providers.noType'))
      return
    }
    if (form.auth === 'api-key' && dialog?.mode === 'add' && form.secret === '' && form.secret_env === '') {
      toast.error(t('providers.noCredential'))
      return
    }
    setSaving(true)
    try {
      if (dialog?.mode === 'add') {
        await engineApi.providerCreate({
          alias,
          provider_type: form.preset.provider_type,
          auth_method: form.auth,
          settings: { product_id: form.preset.id },
          endpoint: form.endpoint.trim() === '' ? undefined : form.endpoint.trim(),
          account_hint: form.account_hint.trim() === '' ? undefined : form.account_hint.trim(),
          // Solo viaja el campo de la fuente activa; el incompatible queda vacío.
          ...(form.auth !== 'api-key' ? {} : form.credentialSource === 'env'
            ? { secret_env: form.secret_env === '' ? undefined : form.secret_env }
            : { secret: form.secret === '' ? undefined : form.secret }),
        })
        toast.success(t('wizard.saved'))
        setExpanded(alias)
      } else if (dialog?.mode === 'edit') {
        const patch: {
          alias?: string
          endpoint?: string
          account_hint?: string
          secret?: string
          secret_env?: string
        } = {}
        if (alias !== dialog.provider.alias) patch.alias = alias
        const endpoint = form.endpoint.trim()
        if (endpoint !== (dialog.provider.endpoint ?? '')) patch.endpoint = endpoint
        if (form.account_hint !== (dialog.provider.account_hint ?? '')) {
          patch.account_hint = form.account_hint
        }
        // Solo el campo de la fuente activa puede rotar la credencial;
        // el incompatible nunca se envía.
        if (form.credentialSource === 'env' && form.secret_env !== '') {
          patch.secret_env = form.secret_env
        } else if (form.credentialSource === 'literal' && form.secret !== '') {
          patch.secret = form.secret
        }
        if (Object.keys(patch).length === 0) {
          setDialog(null)
          return
        }
        await engineApi.providerUpdate(dialog.provider.alias, patch)
      }
      setDialog(null)
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function testProvider(alias: string) {
    setTesting(alias)
    try {
      const result = await engineApi.providerTest(alias)
      setHealth((prev) => ({ ...prev, [alias]: result }))
      if (result.connected) toast.success(t('providers.healthOk', { n: result.models_discovered }))
      else toast.error(t('providers.healthFail', { detail: result.detail }))
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
      const active = deleting.active
      await engineApi.providerRemove(
        deleting.alias,
        active ? switchTo || undefined : undefined,
      )
      setDeleting(null)
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  const others = deleting ? providers.filter((p) => p.alias !== deleting.alias) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-[var(--text)]">
          {t('providers.list')}
        </h2>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110"
        >
          {t('providers.add')}
        </button>
      </div>

      {providers.length === 0 && (
        <Section title={t('providers.list')}>
          <p className="text-sm text-[var(--text-subtle)]">{t('wizard.welcome')}</p>
        </Section>
      )}

      {providers.map((provider) => {
        const h = health[provider.alias]
        const isOpen = expanded === provider.alias
        return (
          <Section
            key={provider.id}
            title={
              <span className="flex items-center gap-2.5">
                <ProviderLogo alias={provider.alias} endpoint={provider.endpoint} size={22} />
                <span>{`${provider.alias}${provider.active ? ` · ${t('providers.active')}` : ''}`}</span>
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-subtle)]">
              <span>{provider.product_name ?? provider.type}</span>
              {provider.experimental && <span>{t('providers.experimental')}</span>}
              {provider.account_hint && <span>{provider.account_hint}</span>}
              {provider.model_count !== undefined && <span>{t('providers.savedModelCount', { n: provider.model_count })}</span>}
              {provider.endpoint && <span className="truncate font-mono">{provider.endpoint}</span>}
              <span>
                {provider.has_credential ? t('providers.credentialOk') : t('providers.noCredential')}
              </span>
              <span>
                {provider.status_connected === true
                  ? t('settings.connection.connected')
                  : provider.status_connected === false
                    ? t('providers.offline')
                    : t('settings.connection.notChecked')}
              </span>
            </div>
            {h && (
              <p className={h.connected ? 'text-xs text-emerald-400' : 'text-xs text-red-400'}>
                {h.connected
                  ? t('providers.healthOk', { n: h.models_discovered })
                  : t('providers.healthFail', { detail: h.detail })}
              </p>
            )}
            {!isOpen && engineCapabilities?.provider_usage_v1 && <ProviderUsagePanel key={`${provider.id}:${provider.updated_at}`} providerAlias={provider.alias} compact />}
            <div className="flex flex-wrap gap-2">
              {!provider.active && (
                <button
                  type="button"
                  onClick={() => void useProvider(provider.alias)}
                  className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {t('providers.use')}
                </button>
              )}
              <button
                type="button"
                onClick={() => void testProvider(provider.alias)}
                disabled={testing !== null}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                {testing === provider.alias ? t('providers.testing') : t('providers.test')}
              </button>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : provider.alias)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              >
                {t('providers.details')}
              </button>
              <button
                type="button"
                onClick={() => openEdit(provider)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)]"
              >
                {t('providers.edit')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleting(provider)
                  setSwitchTo(providers.find((p) => p.alias !== provider.alias)?.alias ?? '')
                }}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-[var(--bg-hover)]"
              >
                {t('providers.delete')}
              </button>
            </div>
            {isOpen && (engineCapabilities?.provider_catalog_v1
              ? <ProviderDetails key={`${provider.id}:${provider.updated_at}`} provider={provider} onChanged={onChanged} />
              : <ModelCatalog providerAlias={provider.alias} onChanged={onChanged} />)}
          </Section>
        )
      })}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'edit' ? t('providers.edit') : t('providers.add')}
            </DialogTitle>
          </DialogHeader>
          <ProviderForm
            form={form}
            setForm={setForm}
            allowPresetChange={dialog?.mode === 'add'}
            isEdit={dialog?.mode === 'edit'}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
            >
              {t('providers.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
            >
              {t('providers.save')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('providers.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && t('providers.confirmDelete', { name: deleting.alias })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleting?.active && others.length > 0 && (
            <div className="px-6">
              <label
                className="mb-1.5 block text-sm font-medium text-[var(--text)]"
                htmlFor="provider-switch"
              >
                {t('providers.switchTo')}
              </label>
              <select
                id="provider-switch"
                value={switchTo}
                onChange={(e) => setSwitchTo(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[var(--bg-subtle)] px-3 py-2 text-sm"
              >
                {others.map((p) => (
                  <option key={p.alias} value={p.alias}>
                    {p.alias}
                  </option>
                ))}
              </select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeProvider()}>
              {t('providers.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
