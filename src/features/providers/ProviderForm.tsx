import { useState } from 'react'
import { ChevronRight, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n, type I18nKey } from '../../i18n'
import { brandForProvider } from '../../lib/providerBrand'
import ProviderLogo from '../../components/ProviderLogo'
import { commandMessage } from '../../services/engine'
import { platform } from '../../platform'
import { PROVIDER_PRESETS, type ProviderPreset, type ProviderAuth } from './presets'
import { keyPage, productDescription } from './productInfo'
import { SegTabPill } from '../../components/ui/SegTabPill'

export interface ProviderFormData {
  preset: ProviderPreset
  alias: string
  endpoint: string
  auth: ProviderAuth
  credentialSource: 'literal' | 'env'
  secret: string
  secret_env: string
  account_hint: string
}

/** El motivo de un fallo, junto al campo que lo causa (#97 C). */
export interface ProviderFieldErrors {
  secret?: string
  endpoint?: string
}

export function initialForm(presetId = 'openai', alias = ''): ProviderFormData {
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? PROVIDER_PRESETS[0]
  return formFor(preset, alias)
}

/** El formulario de un tipo recién elegido: alias propuesto, su endpoint y su autenticación. */
export function formFor(preset: ProviderPreset, alias = ''): ProviderFormData {
  return {
    preset,
    alias: alias || preset.id,
    endpoint: preset.endpoint,
    auth: preset.auth,
    credentialSource: 'literal',
    secret: '',
    secret_env: '',
    account_hint: '',
  }
}

const AUTH_LABEL: Record<ProviderAuth, I18nKey> = {
  oauth: 'providers.login',
  'api-key': 'providers.authKey',
  'external-cli': 'providers.presetClaudeSubscription',
  none: 'providers.authNone',
}

/**
 * Alta y edición de un proveedor (#97 C): solo los campos que ese tipo
 * necesita. La clave con mostrar/ocultar y «¿Dónde la consigo?»; el endpoint
 * a la vista solo en un servidor propio y, en los demás, en «Opciones
 * avanzadas» con la variable de entorno y la pista de cuenta. El secreto
 * vive solo en memoria hasta enviarse al Engine.
 */
export default function ProviderForm({
  form,
  setForm,
  allowPresetChange,
  isEdit,
  onChangePreset,
  errors,
}: {
  form: ProviderFormData
  setForm: (form: ProviderFormData) => void
  /** Muestra el tipo elegido con «Cambiar», que vuelve a la cuadrícula. */
  allowPresetChange: boolean
  isEdit: boolean
  onChangePreset?: () => void
  errors?: ProviderFieldErrors
}) {
  const { t } = useI18n()
  const [showSecret, setShowSecret] = useState(false)
  const brand = brandForProvider({ product_id: form.preset.id, alias: form.alias, endpoint: form.endpoint })
  const custom = form.preset.id === 'custom'
  const external = form.auth === 'external-cli'
  const methods = isEdit ? [form.auth] : form.preset.authMethods ?? (['api-key', 'none'] as ProviderAuth[])
  const page = keyPage(form.preset.id)
  const described = productDescription(form.preset)
  // Las opciones avanzadas se abren solas si ya traen algo o si el fallo está ahí.
  const [advanced, setAdvanced] = useState(() =>
    form.credentialSource === 'env' || form.account_hint !== '' || (!custom && Boolean(errors?.endpoint)))

  const set = (patch: Partial<ProviderFormData>) => setForm({ ...form, ...patch })

  const endpointField = (
    <div>
      <label className="field-label" htmlFor="provider-endpoint">{t('providers.endpoint')}</label>
      <input
        id="provider-endpoint"
        value={form.endpoint}
        onChange={(e) => set({ endpoint: e.target.value })}
        placeholder="http://host:8000/v1"
        className="field-input font-mono"
        aria-invalid={Boolean(errors?.endpoint) || undefined}
        aria-describedby={errors?.endpoint ? 'provider-endpoint-error' : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {errors?.endpoint && <p id="provider-endpoint-error" role="alert" className="provider-field-error">{errors.endpoint}</p>}
    </div>
  )

  return (
    <div className="provider-form">
      {allowPresetChange && (
        <div className="provider-form-type">
          <span className="provider-picker-logo"><ProviderLogo brand={brand} size={26} /></span>
          <span className="min-w-0 flex-1">
            <span className="provider-picker-name">{form.preset.name ?? t(form.preset.nameKey)}</span>
            <span className="provider-picker-line">{described ? t(described) : form.endpoint}</span>
          </span>
          {onChangePreset && <button type="button" className="btn btn-ghost btn-xs" onClick={onChangePreset}>{t('providers.pick.change')}</button>}
        </div>
      )}

      <div>
        <label className="field-label" htmlFor="provider-alias">{t('providers.alias')}</label>
        <input id="provider-alias" value={form.alias} onChange={(e) => set({ alias: e.target.value })} className="field-input" autoComplete="off" />
        <p className="field-hint">{t('providers.aliasHint')}</p>
      </div>

      {custom && endpointField}

      {methods.length > 1 && (
        <div>
          <span className="field-label">{t('providers.auth')}</span>
          <div role="radiogroup" aria-label={t('providers.auth')} className="seg-tabs w-fit">
            {methods.map((mode) => (
              <button key={mode} type="button" role="radio" aria-checked={form.auth === mode} className="seg-tab" onClick={() => set({ auth: mode })}>
                {form.auth === mode && <SegTabPill />}
                <span className="relative">{t(AUTH_LABEL[mode])}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {external && <p className="field-hint">{t('providers.claudeNoCredential')}</p>}

      {form.auth === 'api-key' && form.credentialSource === 'literal' && (
        <div>
          <div className="provider-form-label-row">
            <label className="field-label" htmlFor="provider-secret">{t('providers.authKey')}</label>
            {page && (
              <button
                type="button"
                className="provider-key-link"
                onClick={() => void platform().opener.openUrl(page).catch((error) => toast.error(commandMessage(error)))}
              >
                {t('providers.whereKey')} <ExternalLink size={11} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="provider-secret">
            <input
              id="provider-secret"
              type={showSecret ? 'text' : 'password'}
              value={form.secret}
              onChange={(e) => set({ secret: e.target.value })}
              placeholder={isEdit ? t('apikey.stored') : t('providers.keyPlaceholder')}
              className="field-input font-mono"
              aria-invalid={Boolean(errors?.secret) || undefined}
              aria-describedby={errors?.secret ? 'provider-secret-error' : 'provider-secret-hint'}
              autoComplete="new-password"
              spellCheck={false}
            />
            <button type="button" onClick={() => setShowSecret((s) => !s)} aria-label={showSecret ? t('apikey.hide') : t('apikey.show')} className="btn btn-quiet btn-icon btn-sm">
              {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {errors?.secret
            ? <p id="provider-secret-error" role="alert" className="provider-field-error">{errors.secret}</p>
            : <p id="provider-secret-hint" className="field-hint">{t('providers.sourceLiteralHint')}</p>}
        </div>
      )}

      {!external && (
        <div className="provider-advanced" data-open={advanced || undefined}>
          <button type="button" className="provider-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
            <ChevronRight size={13} aria-hidden="true" />
            {t('providers.advanced')}
          </button>
          {advanced && (
            <div className="provider-advanced-body">
              {!custom && endpointField}
              {form.auth === 'api-key' && (
                <div>
                  <span className="field-label">{t('providers.credentialSource')}</span>
                  <div role="radiogroup" aria-label={t('providers.credentialSource')} className="seg-tabs w-fit">
                    {(['literal', 'env'] as const).map((source) => (
                      <button key={source} type="button" role="radio" aria-checked={form.credentialSource === source} className="seg-tab"
                        onClick={() => set({ secret: '', secret_env: '', credentialSource: source })}>
                        {form.credentialSource === source && <SegTabPill />}
                        <span className="relative">{t(source === 'literal' ? 'providers.sourceLiteral' : 'providers.sourceEnv')}</span>
                      </button>
                    ))}
                  </div>
                  {form.credentialSource === 'env' && (
                    <div className="mt-3">
                      <label className="field-label" htmlFor="provider-secret-env">{t('providers.authEnv')}</label>
                      <input
                        id="provider-secret-env"
                        value={form.secret_env}
                        onChange={(e) => set({ secret_env: e.target.value })}
                        placeholder={t('providers.keyEnvPlaceholder')}
                        className="field-input font-mono"
                        aria-invalid={Boolean(errors?.secret) || undefined}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {errors?.secret
                        ? <p role="alert" className="provider-field-error">{errors.secret}</p>
                        : <p className="field-hint">{t('providers.sourceEnvHint')}</p>}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="field-label" htmlFor="provider-hint">{t('providers.accountHint')}</label>
                <input id="provider-hint" value={form.account_hint} onChange={(e) => set({ account_hint: e.target.value })} className="field-input" autoComplete="off" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
