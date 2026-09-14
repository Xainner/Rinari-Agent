import { useState } from 'react'
import { Box, Eye, EyeOff } from 'lucide-react'
import { useI18n } from '../../i18n'
import { inputClass, labelClass } from '../../components/settings/parts'
import { brandForProvider, providerBrand } from '../../lib/providerBrand'
import ProviderLogo from '../../components/ProviderLogo'
import { PROVIDER_PRESETS, type ProviderPreset } from './presets'

export interface ProviderFormData {
  preset: ProviderPreset
  alias: string
  endpoint: string
  auth: 'api-key' | 'none'
  credentialSource: 'literal' | 'env'
  secret: string
  secret_env: string
  account_hint: string
}

export function initialForm(presetId = 'openai', alias = ''): ProviderFormData {
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? PROVIDER_PRESETS[0]
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

/** Formulario de alta/edición. El secreto vive solo en memoria hasta enviarse al engine. */
export default function ProviderForm({
  form,
  setForm,
  allowPresetChange,
  isEdit,
}: {
  form: ProviderFormData
  setForm: (form: ProviderFormData) => void
  allowPresetChange: boolean
  isEdit: boolean
}) {
  const { t } = useI18n()
  const [showSecret, setShowSecret] = useState(false)
  // El logo se resuelve con los datos reales del formulario (válido también en
  // edición, donde el preset queda neutro); el preset solo aporta su marca.
  const brand =
    brandForProvider({ alias: form.alias, endpoint: form.endpoint }) ??
    (allowPresetChange ? providerBrand(form.preset.brand) : null)

  return (
    <div className="space-y-4">
      {allowPresetChange && (
        <div>
          <label className={labelClass} htmlFor="provider-preset">
            {t('providers.type')}
          </label>
          <div className="flex items-center gap-2">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
              {brand ? (
                <ProviderLogo brand={brand} size={24} />
              ) : (
                <Box size={18} aria-hidden="true" className="text-[var(--text-subtle)]" />
              )}
            </span>
            <select
              id="provider-preset"
              value={form.preset.id}
              onChange={(e) => {
                const preset =
                  PROVIDER_PRESETS.find((p) => p.id === e.target.value) ?? PROVIDER_PRESETS[0]
                setForm({
                  ...form,
                  preset,
                  alias: form.alias === form.preset.id ? preset.id : form.alias,
                  endpoint: preset.endpoint,
                  auth: preset.auth,
                })
              }}
              className={`${inputClass} flex-1`}
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.nameKey)} — {t(p.descKey)}
                </option>
              ))}
            </select>
          </div>
          {form.preset.id !== 'custom' && form.endpoint.trim() !== '' && (
            <p
              className="mt-1.5 truncate font-mono text-[11px] text-[var(--text-subtle)]"
              title={form.endpoint}
            >
              {form.endpoint}
            </p>
          )}
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="provider-alias">
          {t('providers.alias')}
        </label>
        <input
          id="provider-alias"
          value={form.alias}
          onChange={(e) => setForm({ ...form, alias: e.target.value })}
          className={inputClass}
          autoComplete="off"
        />
      </div>

      {form.preset.id === 'custom' && (
        <div>
          <label className={labelClass} htmlFor="provider-endpoint">
            {t('providers.endpoint')}
          </label>
          <input
            id="provider-endpoint"
            value={form.endpoint}
            onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            placeholder="http://host:8000/v1"
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      <div>
        <span className={labelClass}>{t('providers.auth')}</span>
        <div className="flex gap-2">
          {(['api-key', 'none'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setForm({ ...form, auth: mode })}
              aria-pressed={form.auth === mode}
              className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all ${
                form.auth === mode
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {mode === 'api-key' ? t('providers.authKey') : t('providers.authNone')}
            </button>
          ))}
        </div>
      </div>

      {form.auth === 'api-key' && (
        <>
          <div>
            <span className={labelClass}>{t('providers.credentialSource')}</span>
            <div className="flex gap-2">
              {(['literal', 'env'] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, secret: '', secret_env: '' , credentialSource: source})
                  }
                  aria-pressed={form.credentialSource === source}
                  className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all ${
                    form.credentialSource === source
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {source === 'literal'
                    ? t('providers.sourceLiteral')
                    : t('providers.sourceEnv')}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
              {form.credentialSource === 'literal'
                ? t('providers.sourceLiteralHint')
                : t('providers.sourceEnvHint')}
            </p>
          </div>
          {form.credentialSource === 'literal' ? (
            <div>
              <label className={labelClass} htmlFor="provider-secret">
                {t('providers.authKey')}
              </label>
              <div className="flex gap-2">
                <input
                  id="provider-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  placeholder={isEdit ? t('apikey.stored') : t('providers.keyPlaceholder')}
                  className={inputClass}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((s) => !s)}
                  aria-label={showSecret ? t('apikey.hide') : t('apikey.show')}
                  className="flex shrink-0 items-center rounded-xl border border-[var(--border)] px-3 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className={labelClass} htmlFor="provider-secret-env">
                {t('providers.authEnv')}
              </label>
              <input
                id="provider-secret-env"
                value={form.secret_env}
                onChange={(e) => setForm({ ...form, secret_env: e.target.value })}
                placeholder={t('providers.keyEnvPlaceholder')}
                className={inputClass}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </>
      )}

      <div>
        <label className={labelClass} htmlFor="provider-hint">
          {t('providers.accountHint')}
        </label>
        <input
          id="provider-hint"
          value={form.account_hint}
          onChange={(e) => setForm({ ...form, account_hint: e.target.value })}
          className={inputClass}
          autoComplete="off"
        />
      </div>
    </div>
  )
}
