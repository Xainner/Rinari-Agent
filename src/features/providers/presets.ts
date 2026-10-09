import type { I18nKey } from '../../i18n'
import { useEffect, useState } from 'react'
import { engineApi } from '../../services/engine'
import { brandForProduct, type ProviderBrandId } from '../../lib/providerBrand'

export type ProviderAuth = 'api-key' | 'none' | 'oauth' | 'external-cli'

export interface ProviderPreset {
  id: string
  nameKey: I18nKey
  descKey: I18nKey
  provider_type: 'openai' | 'anthropic' | 'custom'
  endpoint: string
  auth: ProviderAuth
  /** Marca con asset en public/logos; ausente cuando no existe logo. */
  brand?: ProviderBrandId
  name?: string
  experimental?: boolean
  authMethods?: ProviderAuth[]
  /** 'http' o un runtime externo ('claude-cli'): decide el alta y la tarjeta. */
  runtime?: string
  /** Ejecutable que instala el usuario; el alta guía en vez de pedir una clave. */
  requiresBinary?: string | null
}

/** Un provider servido por un CLI externo no pide credencial: la tiene el CLI. */
export function isExternalRuntime(preset: Pick<ProviderPreset, 'auth' | 'runtime'>): boolean {
  return preset.auth === 'external-cli' || (preset.runtime ?? 'http') !== 'http'
}

/**
 * Settings del alta. Un producto de runtime externo es privilegiado (sin
 * credencial, lanza procesos), así que el Engine solo se lo concede cuando
 * endpoint, método de auth y transporte coinciden. Vive aquí porque hay dos
 * puntos de alta —el asistente inicial y el modal de Proveedores— y cuando
 * cada uno armó lo suyo, el modal se olvidó del transporte y el Engine
 * rechazaba el provider con «Unsupported external CLI provider».
 */
export function providerCreateSettings(preset: ProviderPreset): Record<string, unknown> {
  return isExternalRuntime(preset)
    ? { product_id: preset.id, transport: preset.runtime ?? 'claude-cli' }
    : { product_id: preset.id }
}

/**
 * Presets de alta. Todo lo OpenAI-compatible entra por `custom` con su endpoint
 * base: el engine le agrega `/chat/completions` y `/models` (sin barra final).
 *
 * OpenCode Zen queda fuera a propósito: su catálogo reparte los modelos entre
 * /chat/completions, /responses (GPT, Grok) y /messages (Claude, Qwen), y el
 * engine (dad9a5c) solo auto-routea cuatro IDs a responses. Se reintroduce
 * cuando exista el enrutamiento por modelo en el engine; la UI no duplica esa
 * decisión.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    nameKey: 'providers.presetOpenAI',
    descKey: 'providers.presetOpenAIDesc',
    provider_type: 'openai',
    endpoint: 'https://api.openai.com/v1',
    auth: 'api-key',
    brand: 'openai',
  },
  {
    id: 'anthropic',
    nameKey: 'providers.presetAnthropic',
    descKey: 'providers.presetAnthropicDesc',
    provider_type: 'anthropic',
    endpoint: '',
    auth: 'api-key',
    brand: 'anthropic',
  },
  {
    id: 'opencode-go',
    nameKey: 'providers.presetOpenCodeGo',
    descKey: 'providers.presetOpenCodeGoDesc',
    provider_type: 'custom',
    endpoint: 'https://opencode.ai/zen/go/v1',
    auth: 'api-key',
    brand: 'opencode',
  },
  {
    id: 'xai',
    nameKey: 'providers.presetXAI',
    descKey: 'providers.presetXAIDesc',
    provider_type: 'custom',
    endpoint: 'https://api.x.ai/v1',
    auth: 'api-key',
    brand: 'xai',
  },
  {
    id: 'deepseek',
    nameKey: 'providers.presetDeepSeek',
    descKey: 'providers.presetDeepSeekDesc',
    provider_type: 'custom',
    endpoint: 'https://api.deepseek.com/v1',
    auth: 'api-key',
    brand: 'deepseek',
  },
  {
    id: 'gemini',
    nameKey: 'providers.presetGemini',
    descKey: 'providers.presetGeminiDesc',
    provider_type: 'custom',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    auth: 'api-key',
    brand: 'gemini',
  },
  {
    id: 'mistral',
    nameKey: 'providers.presetMistral',
    descKey: 'providers.presetMistralDesc',
    provider_type: 'custom',
    endpoint: 'https://api.mistral.ai/v1',
    auth: 'api-key',
    brand: 'mistral',
  },
  {
    id: 'ollama',
    brand: 'ollama',
    nameKey: 'providers.presetOllama',
    descKey: 'providers.presetOllamaDesc',
    provider_type: 'custom',
    endpoint: 'http://127.0.0.1:11434/v1',
    auth: 'none',
  },
  {
    id: 'lmstudio',
    brand: 'lmstudio',
    nameKey: 'providers.presetLMStudio',
    descKey: 'providers.presetLMStudioDesc',
    provider_type: 'custom',
    endpoint: 'http://127.0.0.1:1234/v1',
    auth: 'none',
  },
  {
    id: 'claude-subscription',
    nameKey: 'providers.presetClaudeSubscription',
    descKey: 'providers.presetClaudeSubscriptionDesc',
    provider_type: 'custom',
    endpoint: 'process://claude',
    auth: 'external-cli',
    authMethods: ['external-cli'],
    brand: 'anthropic',
    experimental: true,
    runtime: 'claude-cli',
    requiresBinary: 'claude',
  },
  {
    id: 'custom',
    nameKey: 'providers.presetCustom',
    descKey: 'providers.presetCustomDesc',
    provider_type: 'custom',
    endpoint: '',
    auth: 'api-key',
  },
]

/** Legacy fallback for engines that predate catalog negotiation. */
export function useProviderPresets() {
  // Sin catálogo del Engine no hay forma de saber si el dueño activó un
  // runtime externo: el respaldo local nunca lo ofrece.
  const [presets, setPresets] = useState(() => PROVIDER_PRESETS.filter(p => p.auth !== 'external-cli'))
  useEffect(() => {
    let active = true
    void engineApi.providerCatalog().then(({ presets: remote }) => {
      if (!active) return
      setPresets(remote.filter(p => p.enabled).map(p => ({
        id: p.id, name: p.name, nameKey: 'providers.presetCustom', descKey: 'providers.presetCustomDesc',
        provider_type: p.provider_type as ProviderPreset['provider_type'], endpoint: p.endpoint,
        auth: p.auth_methods[0] as ProviderAuth, authMethods: p.auth_methods as ProviderAuth[],
        experimental: p.experimental, brand: brandForProduct(p.id)?.id,
        runtime: p.runtime, requiresBinary: p.requires_external_binary,
      })))
    }).catch(() => { /* Old engines retain their existing API-key wizard. */ })
    return () => { active = false }
  }, [])
  return presets
}
