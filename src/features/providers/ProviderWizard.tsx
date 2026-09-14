import { useEffect, useState } from 'react'
import { Box } from 'lucide-react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type ProviderHealth,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { providerBrand } from '../../lib/providerBrand'
import ProviderLogo from '../../components/ProviderLogo'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import ProviderForm, { initialForm, type ProviderFormData } from './ProviderForm'
import ModelCatalog from './ModelCatalog'
import { PROVIDER_PRESETS } from './presets'

type Step = 'preset' | 'fields' | 'testing' | 'models' | 'done'
const WIZARD_DRAFT_KEY = 'rinari.provider-wizard.v1'

interface WizardDraft {
  step: Step
  form: ProviderFormData
  createdAlias: string | null
  createdType: string | null
  createdAuth: string | null
}

export function loadWizardDraft(storage: Pick<Storage, 'getItem'> = localStorage): WizardDraft | null {
  try {
    const raw = storage.getItem(WIZARD_DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as WizardDraft
    if (!['preset', 'fields', 'testing', 'models'].includes(draft.step) || !draft.form) return null
    return { ...draft, form: { ...draft.form, secret: '' } }
  } catch {
    return null
  }
}

export function saveWizardDraft(
  draft: WizardDraft,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  const safe = { ...draft, form: { ...draft.form, secret: '' } }
  storage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(safe))
}

export function clearWizardDraft(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(WIZARD_DRAFT_KEY)
}

/**
 * Alta guiada de proveedor (primer arranque y botón Agregar).
 * Crea → prueba → descubre → guarda aliases → termina con modelo activo.
 * El secreto viaja solo en memoria hacia el engine.
 */
export default function ProviderWizard({
  open,
  onClose,
}: {
  open: boolean
  onClose: (finished: boolean) => void
}) {
  const { t } = useI18n()
  const [draft] = useState(() => loadWizardDraft())
  const [step, setStep] = useState<Step>(draft?.step ?? 'preset')
  const [form, setForm] = useState<ProviderFormData>(() => draft?.form ?? initialForm())
  const [createdAlias, setCreatedAlias] = useState<string | null>(draft?.createdAlias ?? null)
  const [createdType, setCreatedType] = useState<string | null>(draft?.createdType ?? null)
  const [createdAuth, setCreatedAuth] = useState<string | null>(draft?.createdAuth ?? null)
  const [health, setHealth] = useState<ProviderHealth | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  function reset() {
    clearWizardDraft()
    setStep('preset')
    setForm(initialForm())
    setCreatedAlias(null)
    setCreatedType(null)
    setCreatedAuth(null)
    setHealth(null)
    setError('')
    setWorking(false)
  }

  useEffect(() => {
    if (step === 'done') return
    saveWizardDraft({ step, form, createdAlias, createdType, createdAuth })
  }, [step, form, createdAlias, createdType, createdAuth])

  function trackPersisted(alias: string) {
    setCreatedAlias(alias)
    setCreatedType(form.preset?.provider_type ?? null)
    setCreatedAuth(form.auth)
  }

  async function createProvider(): Promise<string | null> {
    const alias = form.alias.trim()
    const preset = form.preset
    if (!preset?.provider_type) {
      setError(t('providers.noType'))
      return null
    }
    try {
      await engineApi.providerCreate({
        alias,
        provider_type: preset.provider_type,
        auth_method: form.auth,
        endpoint: form.endpoint.trim() === '' ? undefined : form.endpoint.trim(),
        account_hint:
          form.account_hint.trim() === '' ? undefined : form.account_hint.trim(),
        secret: form.secret === '' ? undefined : form.secret,
        secret_env: form.secret_env === '' ? undefined : form.secret_env,
      })
    } catch (err) {
      // Adoptar en conflicto: otra corrida (StrictMode) o un huérfano ganó
      // la carrera por el alias. Solo se muestra error si nadie lo tiene.
      const list = await engineApi.providerList().catch(() => null)
      if (!list?.providers.some((p) => p.alias === alias)) {
        setError(commandMessage(err))
        return null
      }
    }
    trackPersisted(alias)
    toast.success(t('wizard.saved'))
    return alias
  }

  async function updateProvider(reference: string): Promise<string | null> {
    const alias = form.alias.trim()
    try {
      await engineApi.providerUpdate(reference, {
        alias: alias === reference ? undefined : alias,
        endpoint: form.endpoint.trim() === '' ? undefined : form.endpoint.trim(),
        account_hint:
          form.account_hint.trim() === '' ? undefined : form.account_hint.trim(),
        secret: form.secret === '' ? undefined : form.secret,
        secret_env: form.secret_env === '' ? undefined : form.secret_env,
      })
    } catch (err) {
      setError(commandMessage(err))
      return null
    }
    if (alias !== reference) setCreatedAlias(alias)
    return alias
  }

  async function removeProvider(reference: string): Promise<void> {
    try {
      const list = await engineApi.providerList()
      const target = list.providers.find((p) => p.alias === reference)
      if (target) {
        const other = list.providers.find((p) => p.alias !== reference)
        await engineApi.providerRemove(reference, target.active ? other?.alias : undefined)
      }
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  /**
   * draft → persisted → test. Una vez persistido, re-entrar a testing
   * actualiza (nunca duplica): tipo/auth incompatibles recrean, el resto
   * usa provider.update; un alias preexistente se adopta.
   */
  async function persist(): Promise<string | null> {
    const alias = form.alias.trim()
    const preset = form.preset
    if (!preset?.provider_type) {
      setError(t('providers.noType'))
      return null
    }
    if (createdAlias) {
      if (preset.provider_type === createdType && form.auth === createdAuth) {
        return updateProvider(createdAlias)
      }
      await removeProvider(createdAlias)
      setCreatedAlias(null)
      setCreatedType(null)
      setCreatedAuth(null)
    }
    const list = await engineApi.providerList().catch(() => null)
    if (list?.providers.some((p) => p.alias === alias)) {
      trackPersisted(alias)
      toast.success(t('wizard.saved'))
      return updateProvider(alias)
    }
    return createProvider()
  }

  // Secuencia persistir → probar al entrar al paso testing.
  useEffect(() => {
    if (!open || step !== 'testing') return
    let cancelled = false
    async function run() {
      setWorking(true)
      setError('')
      try {
        const persisted = await persist()
        if (cancelled) return
        if (!persisted) return
        const result = await engineApi.providerTest(persisted)
        if (cancelled) return
        setHealth(result)
        if (result.connected) {
          toast.success(t('providers.healthOk', { n: result.models_discovered }))
          setStep('models')
        }
      } catch (err) {
        if (!cancelled) setError(commandMessage(err))
      } finally {
        if (!cancelled) setWorking(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step])

  async function retryTest() {
    if (!createdAlias) return
    setWorking(true)
    setError('')
    try {
      const result = await engineApi.providerTest(createdAlias)
      setHealth(result)
      if (result.connected) {
        toast.success(t('providers.healthOk', { n: result.models_discovered }))
        setStep('models')
      }
    } catch (err) {
      setError(commandMessage(err))
    } finally {
      setWorking(false)
    }
  }

  async function deleteAndBack() {
    if (createdAlias) {
      await removeProvider(createdAlias)
    }
    setCreatedAlias(null)
    setCreatedType(null)
    setCreatedAuth(null)
    setHealth(null)
    setStep('fields')
  }

  async function finish() {
    if (!createdAlias) return
    try {
      const listed = await engineApi.modelList(createdAlias)
      const active = listed.models.find((m) => m.active)
      if (!active) {
        toast.error(t('providers.savedHint'))
        return
      }
      setStep('done')
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  function close(finished: boolean) {
    if (finished) reset()
    onClose(finished)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close(false)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('wizard.title')}</DialogTitle>
        </DialogHeader>

        {step === 'preset' && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">{t('wizard.welcome')}</p>
            <div className="grid gap-2">
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      preset,
                      alias: preset.id,
                      endpoint: preset.endpoint,
                      auth: preset.auth,
                    }))
                    setStep('fields')
                  }}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-left transition-all hover:border-[var(--accent)]/50 active:scale-[0.99]"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center">
                    {preset.brand ? (
                      <ProviderLogo brand={providerBrand(preset.brand)} size={26} />
                    ) : (
                      <Box size={18} aria-hidden="true" className="text-[var(--text-subtle)]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--text)]">
                      {t(preset.nameKey)}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-subtle)]">
                      {t(preset.descKey)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-xl px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              >
                {t('wizard.later')}
              </button>
            </div>
          </div>
        )}

        {step === 'fields' && (
          <div className="space-y-4">
            <ProviderForm form={form} setForm={setForm} allowPresetChange isEdit={false} />
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep('preset')}
                className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
              >
                {t('wizard.back')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (form.alias.trim() === '') return
                  if (
                    form.auth === 'api-key' &&
                    form.secret === '' &&
                    form.secret_env === ''
                  ) {
                    toast.error(t('providers.noCredential'))
                    return
                  }
                  // No se limpia createdAlias: re-entrar a testing actualiza
                  // el provider persistido en vez de duplicarlo.
                  setHealth(null)
                  setStep('testing')
                }}
                className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110"
              >
                {t('wizard.next')}
              </button>
            </div>
          </div>
        )}

        {step === 'testing' && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              {working ? t('providers.testing') : (health ? t('providers.healthFail', { detail: health.detail }) : '')}
            </p>
            {error !== '' && <p className="text-sm text-red-400">{error}</p>}
            {health && !health.connected && !working && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void retryTest()}
                  className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {t('providers.retry')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('fields')}
                  className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {t('providers.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAndBack()}
                  className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {t('providers.delete')}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'models' && createdAlias && (
          <div className="space-y-4">
            <ModelCatalog providerAlias={createdAlias} onChanged={() => {}} />
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep('fields')}
                className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
              >
                {t('wizard.back')}
              </button>
              <button
                type="button"
                onClick={() => void finish()}
                className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110"
              >
                {t('wizard.next')}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">{t('wizard.ready')}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => close(true)}
                className="rounded-xl bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110"
              >
                {t('wizard.finish')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
