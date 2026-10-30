import { useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  isCommandError,
  type ProviderHealth,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import ProviderForm, { formFor, initialForm, type ProviderFieldErrors, type ProviderFormData } from './ProviderForm'
import ProviderTypePicker from './ProviderTypePicker'
import ModelCatalog from './ModelCatalog'
import { registerProviderModels } from './registerModels'
import { providerCreateSettings, useProviderPresets } from './presets'
import ProviderAuthPanel from './ProviderAuthPanel'
import ExternalRuntimePanel from './ExternalRuntimePanel'

type Step = 'preset' | 'fields' | 'testing' | 'models' | 'done'
const WIZARD_DRAFT_KEY = 'rinari.provider-wizard.v1'

interface WizardDraft {
  step: Step
  form: ProviderFormData
  createdAlias: string | null
  createdType: string | null
  createdAuth: string | null
}

/** Campos borrables del formulario: nunca persisten credenciales (plan seccion 4). */
const DRAFT_SAFE_FIELDS: readonly (keyof ProviderFormData)[] = [
  'preset',
  'alias',
  'endpoint',
  'auth',
  'credentialSource',
  'account_hint',
]

function sanitizeDraftForm(form: ProviderFormData): ProviderFormData {
  const clean = {} as ProviderFormData
  for (const key of DRAFT_SAFE_FIELDS) {
    // @ts-expect-error: asignación controlada desde la lista segura.
    clean[key] = form[key]
  }
  clean.secret = ''
  clean.secret_env = ''
  return clean
}

export function loadWizardDraft(storage: Pick<Storage, 'getItem'> = localStorage): WizardDraft | null {
  try {
    const raw = storage.getItem(WIZARD_DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as WizardDraft
    if (!['preset', 'fields', 'testing', 'models'].includes(draft.step) || !draft.form) return null
    return { ...draft, form: sanitizeDraftForm(draft.form) }
  } catch {
    return null
  }
}

export function saveWizardDraft(
  draft: WizardDraft,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  const safe = { ...draft, form: sanitizeDraftForm(draft.form) }
  storage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(safe))
}

export function clearWizardDraft(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(WIZARD_DRAFT_KEY)
}

/** El campo que causó un fallo al probar, por lo que dijo el proveedor. */
export function fieldForFailure(detail: string, form: Pick<ProviderFormData, 'auth' | 'credentialSource'>): keyof ProviderFieldErrors | null {
  if (form.auth === 'api-key' && /\b(401|403)\b|unauthori[sz]ed|forbidden|invalid[^.]*(key|token)|api[ _-]?key|credential|authentication/i.test(detail)) return 'secret'
  if (/econnrefused|enotfound|getaddrinfo|unreachable|timed? ?out|timeout|connection (refused|reset|error)|could not connect|failed to connect|\b404\b|not found|name resolution/i.test(detail)) return 'endpoint'
  return null
}

const seconds = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/**
 * Alta de un proveedor: el asistente del primer arranque y «Agregar
 * proveedor» de Ajustes son este mismo componente (#97 C).
 * 1. El tipo, en la cuadrícula con logo, grupos y búsqueda.
 * 2. Solo los campos que ese tipo necesita.
 * 3. «Probar y guardar»: conecta, cuenta los modelos y mide cuánto tardó; si
 *    falla, el motivo vuelve junto al campo que lo causa.
 * 4. Los modelos se guardan solos y se puede usar uno ahora (en el primer
 *    arranque, elegir uno es obligatorio).
 * El secreto viaja solo en memoria hacia el Engine; el borrador del primer
 * arranque nunca lo guarda.
 */
export default function ProviderWizard({
  open,
  onClose,
  mode = 'onboarding',
}: {
  open: boolean
  onClose: (finished: boolean) => void
  /** `add`: desde Ajustes; sin borrador y sin obligar a cambiar de modelo. */
  mode?: 'onboarding' | 'add'
}) {
  const { t } = useI18n()
  const presets = useProviderPresets()
  const onboarding = mode === 'onboarding'
  const [draft] = useState(() => (onboarding ? loadWizardDraft() : null))
  const [step, setStep] = useState<Step>(draft?.step ?? 'preset')
  const [form, setForm] = useState<ProviderFormData>(() => draft?.form ?? initialForm())
  const [createdAlias, setCreatedAlias] = useState<string | null>(draft?.createdAlias ?? null)
  const [createdType, setCreatedType] = useState<string | null>(draft?.createdType ?? null)
  const [createdAuth, setCreatedAuth] = useState<string | null>(draft?.createdAuth ?? null)
  const [health, setHealth] = useState<ProviderHealth | null>(null)
  const [took, setTook] = useState<number | null>(null)
  const [phase, setPhase] = useState<'connecting' | 'saving'>('connecting')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<ProviderFieldErrors>({})
  const [working, setWorking] = useState(false)
  /** Modelo que eliges en el paso de modelos; se aplica al continuar. */
  const [chosenModel, setChosenModel] = useState<string | null>(null)
  // Un servidor que pide sesión o un CLI se resuelven en el paso de prueba, no en los campos.
  const interactive = form.auth === 'oauth' || form.auth === 'external-cli'
  const name = form.preset.name ?? t(form.preset.nameKey)

  function reset() {
    clearWizardDraft()
    setStep('preset')
    setForm(initialForm())
    setCreatedAlias(null)
    setCreatedType(null)
    setCreatedAuth(null)
    setHealth(null)
    setTook(null)
    setError('')
    setFieldErrors({})
    setWorking(false)
    setChosenModel(null)
  }

  useEffect(() => {
    if (!onboarding || step === 'done') return
    saveWizardDraft({ step, form, createdAlias, createdType, createdAuth })
  }, [onboarding, step, form, createdAlias, createdType, createdAuth])

  function trackPersisted(alias: string) {
    setCreatedAlias(alias)
    setCreatedType(form.preset?.provider_type ?? null)
    setCreatedAuth(form.auth)
  }

  function credentialSourceFields(): { secret?: string; secret_env?: string } {
    if (form.auth !== 'api-key') return {}
    return form.credentialSource === 'env'
      ? { secret_env: form.secret_env }
      : { secret: form.secret }
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
        settings: providerCreateSettings(preset),
        endpoint: form.endpoint.trim() === '' ? undefined : form.endpoint.trim(),
        account_hint:
          form.account_hint.trim() === '' ? undefined : form.account_hint.trim(),
        ...credentialSourceFields(),
      })
    } catch (err) {
      // Adoptar SOLO en el conflicto de identidad concreto: otra corrida
      // (StrictMode) o un huérfano ganó la carrera por el alias. Los demás
      // errores de validación/persistencia se muestran tal cual (plan
      // sección 4); adoptar ante ellos ocultaría fallos reales.
      const conflict =
        isCommandError(err) && err.code === 'CONFLICT' &&
        typeof err.message === 'string' &&
        err.message.toLowerCase().includes('alias already exists')
      if (conflict) {
        const list = await engineApi.providerList().catch(() => null)
        if (list?.providers.some((p) => p.alias === alias)) {
          trackPersisted(alias)
          return alias
        }
      }
      setError(commandMessage(err))
      return null
    }
    trackPersisted(alias)
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
        ...credentialSourceFields(),
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
      return updateProvider(alias)
    }
    return createProvider()
  }

  /** Prueba lo guardado; si conecta, guarda sus modelos y pasa a elegir. */
  async function testAndSave(alias: string, isCancelled: () => boolean): Promise<void> {
    setPhase('connecting')
    const started = performance.now()
    const result = await engineApi.providerTest(alias)
    if (isCancelled()) return
    setTook(performance.now() - started)
    setHealth(result)
    if (!result.connected) {
      // Con clave o sin autenticación, el motivo vuelve al campo que lo causa.
      if (!interactive) {
        const field = fieldForFailure(result.detail, form)
        setFieldErrors(field ? { [field]: result.detail } : {})
        setError(field ? '' : t('providers.healthFail', { detail: result.detail }))
        setStep('fields')
      }
      return
    }
    setPhase('saving')
    await registerProviderModels(alias)
    if (isCancelled()) return
    setStep('models')
  }

  // Secuencia persistir → probar al entrar al paso testing.
  useEffect(() => {
    if (!open || step !== 'testing') return
    let cancelled = false
    async function run() {
      setWorking(true)
      setError('')
      setFieldErrors({})
      try {
        const persisted = await persist()
        if (cancelled) return
        if (!persisted) { if (!interactive) setStep('fields'); return }
        if (form.auth === 'oauth') {
          const account = await engineApi.providerGet(persisted)
          if (!account.provider.has_credential) return
        }
        await testAndSave(persisted, () => cancelled)
      } catch (err) {
        if (!cancelled) {
          setError(commandMessage(err))
          if (!interactive) setStep('fields')
        }
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
      await testAndSave(createdAlias, () => false)
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

  async function useChosen() {
    if (!createdAlias) return
    // El orden del endpoint no decide el modelo en uso: lo eliges tú.
    if (!chosenModel) {
      toast.error(t('wizard.chooseModel'))
      return
    }
    try {
      await engineApi.modelUse(chosenModel, createdAlias)
      if (onboarding) setStep('done')
      else close(true)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  function close(finished: boolean) {
    if (finished || !onboarding) reset()
    onClose(finished)
  }

  function connect() {
    if (form.alias.trim() === '') return
    if (form.auth === 'api-key' && form.secret === '' && form.secret_env === '') {
      setFieldErrors({ secret: t('providers.noCredential') })
      return
    }
    // No se limpia createdAlias: re-entrar a testing actualiza el provider
    // persistido en vez de duplicarlo.
    setHealth(null)
    setStep('testing')
  }

  const models = health?.models_discovered ?? 0

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close(false)
      }}
    >
      <DialogContent className="provider-wizard max-h-[85vh] max-w-2xl overflow-y-auto" data-testid="provider-wizard" data-step={step}>
        <DialogHeader>
          <DialogTitle>{onboarding ? t('wizard.title') : t('providers.add')}</DialogTitle>
          {step === 'preset' && <DialogDescription>{onboarding ? t('wizard.welcome') : t('providers.pick.desc')}</DialogDescription>}
        </DialogHeader>

        {step === 'preset' && (
          <div className="space-y-3">
            <ProviderTypePicker
              presets={presets}
              onPick={(preset) => {
                setForm(formFor(preset))
                setFieldErrors({})
                setError('')
                setStep('fields')
              }}
            />
            {onboarding && (
              <div className="flex justify-end">
                <button type="button" onClick={() => close(false)} className="btn btn-quiet btn-sm">
                  {t('wizard.later')}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'fields' && (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); connect() }}>
            <ProviderForm form={form} setForm={setForm} allowPresetChange isEdit={false} onChangePreset={() => setStep('preset')} errors={fieldErrors} />
            {error !== '' && <p role="alert" className="provider-wizard-error">{error}</p>}
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setStep('preset')} className="btn btn-ghost btn-sm">
                {t('wizard.back')}
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                {interactive ? t('wizard.next') : t('wizard.connect')}
              </button>
            </div>
          </form>
        )}

        {step === 'testing' && (
          <div className="space-y-3">
            {form.auth === 'oauth' && createdAlias && <ProviderAuthPanel providerAlias={createdAlias} onConnected={() => void retryTest()} />}
            {form.auth === 'external-cli' && (
              <ExternalRuntimePanel
                runtime={form.preset.runtime ?? 'claude-cli'}
                providerRef={createdAlias ?? undefined}
                // Tras instalar o iniciar sesión y comprobar de nuevo, la
                // prueba del provider se repite sola en vez de dejar el error
                // anterior junto a un «Conectado».
                onStateChange={(next) => {
                  if (next?.state === 'connected' && health && !health.connected && !working) void retryTest()
                }}
              />
            )}
            {working && (
              <p role="status" className="provider-wizard-progress">
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                {phase === 'saving' ? t('wizard.savingModels', { n: models }) : t('wizard.connecting', { name })}
              </p>
            )}
            {!working && health && !health.connected && <p role="alert" className="provider-wizard-error">{t('providers.healthFail', { detail: health.detail })}</p>}
            {error !== '' && <p role="alert" className="provider-wizard-error">{error}</p>}
            {health && !health.connected && !working && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void retryTest()} className="btn btn-secondary btn-sm">{t('providers.retry')}</button>
                <button type="button" onClick={() => setStep('fields')} className="btn btn-ghost btn-sm">{t('providers.edit')}</button>
                <button type="button" onClick={() => void deleteAndBack()} className="btn btn-ghost btn-sm text-[var(--danger)]">{t('providers.delete')}</button>
              </div>
            )}
          </div>
        )}

        {step === 'models' && createdAlias && (
          <div className="space-y-4">
            <p className="provider-wizard-ok" data-testid="provider-wizard-connected">
              <span className="provider-wizard-check" aria-hidden="true"><Check size={13} /></span>
              <span>
                <strong>{took !== null ? t('wizard.connected', { n: models, s: seconds(took) }) : t('providers.healthOk', { n: models })}</strong>
                <span className="block text-[var(--text-subtle)]">{t('wizard.savedModels', { n: models })}</span>
              </span>
            </p>
            <p className="text-sm text-[var(--text-muted)]">{onboarding ? t('wizard.chooseModel') : t('wizard.chooseOptional')}</p>
            <ModelCatalog providerAlias={createdAlias} onChanged={() => {}} choice={{ chosen: chosenModel, onChoose: setChosenModel }} />
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setStep('fields')} className="btn btn-ghost btn-sm">
                {t('wizard.back')}
              </button>
              <span className="flex gap-2">
                {!onboarding && <button type="button" onClick={() => close(true)} className="btn btn-secondary btn-sm">{t('wizard.finishAdd')}</button>}
                <button type="button" onClick={() => void useChosen()} disabled={!onboarding && !chosenModel} className="btn btn-primary btn-sm">
                  {onboarding ? t('wizard.next') : t('wizard.useNow')}
                </button>
              </span>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">{t('wizard.ready')}</p>
            <div className="flex justify-end">
              <button type="button" onClick={() => close(true)} className="btn btn-primary btn-sm">
                {t('wizard.finish')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
