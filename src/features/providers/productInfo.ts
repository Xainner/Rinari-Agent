import type { I18nKey } from '../../i18n'
import type { ProviderPreset } from './presets'

/**
 * Lo que la app sabe de cada producto del catálogo para elegirlo (#97 C): una
 * línea de qué es y la página donde se saca la clave. Son datos del producto,
 * no de una cuenta; un producto que no está aquí cae en su endpoint.
 */
const DESCRIBED = new Set([
  'openai', 'anthropic', 'openrouter', 'deepseek', 'groq', 'together', 'mistral', 'xai',
  'opencode-zen', 'opencode-go', 'gemini', 'deepinfra', 'fireworks', 'zai', 'zai-coding',
  'moonshot', 'kimi-coding', 'minimax', 'minimax-coding', 'chatgpt', 'github-copilot',
  'claude-subscription', 'ollama', 'lmstudio', 'custom',
])

/** Solo páginas conocidas y estables; sin enlace antes que uno equivocado. */
const KEY_PAGES: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  openrouter: 'https://openrouter.ai/keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  groq: 'https://console.groq.com/keys',
  together: 'https://api.together.ai/settings/api-keys',
  mistral: 'https://console.mistral.ai/api-keys',
  xai: 'https://console.x.ai',
  gemini: 'https://aistudio.google.com/apikey',
  deepinfra: 'https://deepinfra.com/dash/api_keys',
  fireworks: 'https://fireworks.ai/account/api-keys',
  moonshot: 'https://platform.moonshot.ai/console/api-keys',
}

export function productDescription(preset: Pick<ProviderPreset, 'id'>): I18nKey | null {
  return DESCRIBED.has(preset.id) ? (`providers.product.${preset.id}` as I18nKey) : null
}

export function keyPage(productId: string | undefined): string | null {
  return productId ? KEY_PAGES[productId] ?? null : null
}

export type ProductGroup = 'subscription' | 'api' | 'local'
export const PRODUCT_GROUPS: readonly ProductGroup[] = ['subscription', 'api', 'local']

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/i

/** Suscripción (se entra con la cuenta o su CLI), por API (con clave) o local. */
export function productGroup(preset: Pick<ProviderPreset, 'id' | 'auth' | 'authMethods' | 'endpoint' | 'local'>): ProductGroup {
  const methods = preset.authMethods ?? [preset.auth]
  if (methods.includes('oauth') || methods.includes('external-cli')) return 'subscription'
  if (preset.local || preset.id === 'custom' || LOCAL_HOST.test(preset.endpoint)) return 'local'
  return 'api'
}
