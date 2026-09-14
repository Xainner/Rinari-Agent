/**
 * Marcas visuales de proveedores: resuelve qué logo (public/logos) corresponde
 * a un proveedor a partir de su endpoint y su alias.
 *
 * El `type` del engine ('openai' | 'anthropic' | 'custom') describe la familia
 * de protocolo, no la compañía, así que no se usa para inferir la marca.
 */

export type ProviderBrandId =
  | 'openai'
  | 'anthropic'
  | 'opencode'
  | 'deepseek'
  | 'gemini'
  | 'mistral'
  | 'xai'

export interface ProviderBrand {
  id: ProviderBrandId
  /** Nombre legible de la marca (title del logo). */
  label: string
  /** Asset servido desde public/logos. */
  src: string
}

export const PROVIDER_BRANDS: Record<ProviderBrandId, ProviderBrand> = {
  openai: { id: 'openai', label: 'OpenAI', src: '/logos/openai.png' },
  anthropic: { id: 'anthropic', label: 'Anthropic', src: '/logos/claude.png' },
  opencode: { id: 'opencode', label: 'OpenCode', src: '/logos/opencode.png' },
  deepseek: { id: 'deepseek', label: 'DeepSeek', src: '/logos/deepseek.png' },
  gemini: { id: 'gemini', label: 'Google Gemini', src: '/logos/gemini.png' },
  mistral: { id: 'mistral', label: 'Mistral', src: '/logos/mistral.png' },
  xai: { id: 'xai', label: 'xAI', src: '/logos/xai.png' },
}

export function providerBrand(id: ProviderBrandId | null | undefined): ProviderBrand | null {
  return id ? PROVIDER_BRANDS[id] ?? null : null
}

export interface ProviderBrandSource {
  alias?: string | null
  endpoint?: string | null
}

/** Host del endpoint; acepta URLs completas o hosts sin esquema. */
export function endpointHost(endpoint: string | null | undefined): string | null {
  const value = (endpoint ?? '').trim()
  if (value === '') return null
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** El host manda: es el dato que identifica al servicio real detrás del alias. */
const ENDPOINT_BRANDS: ReadonlyArray<readonly [RegExp, ProviderBrandId]> = [
  [/(^|\.)opencode\.ai$/, 'opencode'],
  [/(^|\.)openai\.com$/, 'openai'],
  [/(^|\.)anthropic\.com$/, 'anthropic'],
  [/(^|\.)deepseek\.com$/, 'deepseek'],
  [/(^|\.)googleapis\.com$/, 'gemini'],
  [/(^|\.)mistral\.ai$/, 'mistral'],
  [/(^|\.)x\.ai$/, 'xai'],
]

/**
 * Heurística para alias de proveedores propios o gateways sin host conocido.
 * Los límites evitan falsos positivos: `xainner` no es xAI, `z-ai` no es xAI.
 */
const ALIAS_BRANDS: ReadonlyArray<readonly [RegExp, ProviderBrandId]> = [
  [/opencode/, 'opencode'],
  [/anthropic|claude/, 'anthropic'],
  [/openai|chatgpt|(^|[^a-z])gpt([^a-z]|$)/, 'openai'],
  [/deepseek/, 'deepseek'],
  [/gemini|google/, 'gemini'],
  [/mistral/, 'mistral'],
  [/grok|(^|[^a-z])x-?ai([^a-z]|$)/, 'xai'],
]

/**
 * Marca de un proveedor: primero el endpoint (puerto/alias no importan),
 * después el alias. Sin coincidencia devuelve null y la UI no pinta logo.
 */
export function brandForProvider(source: ProviderBrandSource): ProviderBrand | null {
  const host = endpointHost(source.endpoint)
  if (host !== null) {
    for (const [pattern, id] of ENDPOINT_BRANDS) {
      if (pattern.test(host)) return PROVIDER_BRANDS[id]
    }
  }
  const alias = (source.alias ?? '').trim().toLowerCase()
  if (alias !== '') {
    for (const [pattern, id] of ALIAS_BRANDS) {
      if (pattern.test(alias)) return PROVIDER_BRANDS[id]
    }
  }
  return null
}
