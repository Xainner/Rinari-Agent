/**
 * Marcas visuales de proveedores: resuelve qué logo (public/logos) corresponde
 * a un proveedor a partir de su identidad de producto, endpoint y alias.
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
  | 'openrouter'
  | 'groq'
  | 'together'
  | 'ollama'
  | 'lmstudio'
  | 'deepinfra'
  | 'fireworks'
  | 'zai'
  | 'moonshot'
  | 'kimi'
  | 'minimax'
  | 'github-copilot'

export interface ProviderBrand {
  id: ProviderBrandId
  /** Nombre legible de la marca (title del logo). */
  label: string
  /** Asset para el tema oscuro (servido desde public/logos). */
  src: string
  /** Variante para el tema claro; solo en marcas monocromas. */
  srcLight?: string
}

export const PROVIDER_BRANDS: Record<ProviderBrandId, ProviderBrand> = {
  openai: { id: 'openai', label: 'OpenAI', src: '/logos/openai.png' },
  anthropic: { id: 'anthropic', label: 'Anthropic', src: '/logos/claude.png' },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    src: '/logos/opencode.png',
    srcLight: '/logos/opencode-light.png',
  },
  deepseek: { id: 'deepseek', label: 'DeepSeek', src: '/logos/deepseek.png' },
  gemini: { id: 'gemini', label: 'Google Gemini', src: '/logos/gemini.png' },
  mistral: { id: 'mistral', label: 'Mistral', src: '/logos/mistral.png' },
  xai: { id: 'xai', label: 'xAI', src: '/logos/xai.png', srcLight: '/logos/xai-light.png' },
  openrouter: { id: 'openrouter', label: 'OpenRouter', src: '/logos/openrouter.svg', srcLight: '/logos/openrouter-light.svg' },
  groq: { id: 'groq', label: 'Groq', src: '/logos/groq.svg' },
  together: { id: 'together', label: 'Together AI', src: '/logos/together.svg' },
  ollama: { id: 'ollama', label: 'Ollama', src: '/logos/ollama.png', srcLight: '/logos/ollama-light.png' },
  lmstudio: { id: 'lmstudio', label: 'LM Studio', src: '/logos/lmstudio.svg' },
  deepinfra: { id: 'deepinfra', label: 'DeepInfra', src: '/logos/deepinfra.png' },
  fireworks: { id: 'fireworks', label: 'Fireworks', src: '/logos/fireworks.svg' },
  zai: { id: 'zai', label: 'Z.ai', src: '/logos/zai.png' },
  moonshot: { id: 'moonshot', label: 'Moonshot', src: '/logos/moonshot.png' },
  kimi: { id: 'kimi', label: 'Kimi', src: '/logos/kimi.svg', srcLight: '/logos/kimi-light.svg' },
  minimax: { id: 'minimax', label: 'MiniMax', src: '/logos/minimax.png' },
  'github-copilot': { id: 'github-copilot', label: 'GitHub Copilot', src: '/logos/github-copilot.svg', srcLight: '/logos/github-copilot-light.svg' },
}

/** Presentation only: the Engine remains the owner of the available catalog. */
export const PROVIDER_PRODUCT_BRANDS: Readonly<Record<string, ProviderBrandId | null>> = {
  openai: 'openai', anthropic: 'anthropic', openrouter: 'openrouter', deepseek: 'deepseek',
  groq: 'groq', together: 'together', mistral: 'mistral', xai: 'xai',
  'opencode-zen': 'opencode', 'opencode-go': 'opencode', ollama: 'ollama', lmstudio: 'lmstudio',
  custom: null, gemini: 'gemini', deepinfra: 'deepinfra', fireworks: 'fireworks',
  zai: 'zai', 'zai-coding': 'zai', moonshot: 'moonshot', 'kimi-coding': 'kimi',
  minimax: 'minimax', 'minimax-coding': 'minimax', chatgpt: 'openai', 'github-copilot': 'github-copilot',
  'claude-subscription': 'anthropic',
}

export function brandForProduct(productId: string | null | undefined): ProviderBrand | null {
  return productId && Object.hasOwn(PROVIDER_PRODUCT_BRANDS, productId)
    ? providerBrand(PROVIDER_PRODUCT_BRANDS[productId]) : null
}

export function providerBrand(id: ProviderBrandId | null | undefined): ProviderBrand | null {
  return id ? PROVIDER_BRANDS[id] ?? null : null
}

export interface ProviderBrandSource {
  product_id?: string | null
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
  [/(^|\.)chatgpt\.com$/, 'openai'],
  [/(^|\.)openrouter\.ai$/, 'openrouter'],
  [/(^|\.)groq\.com$/, 'groq'],
  [/(^|\.)together\.(ai|xyz)$/, 'together'],
  [/(^|\.)ollama\.com$/, 'ollama'],
  [/(^|\.)lmstudio\.ai$/, 'lmstudio'],
  [/(^|\.)deepinfra\.com$/, 'deepinfra'],
  [/(^|\.)fireworks\.ai$/, 'fireworks'],
  [/(^|\.)(z\.ai|bigmodel\.cn)$/, 'zai'],
  [/(^|\.)moonshot\.(ai|cn)$/, 'moonshot'],
  [/(^|\.)kimi\.(com|ai)$/, 'kimi'],
  [/(^|\.)minimax\.(io|chat)$/, 'minimax'],
  [/(^|\.)githubcopilot\.com$/, 'github-copilot'],
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
  [/(^|[^a-z0-9])(opencode)([^a-z0-9]|$)/, 'opencode'],
  [/(^|[^a-z0-9])(anthropic|claude)([^a-z0-9]|$)/, 'anthropic'],
  [/(^|[^a-z0-9])(openai|chatgpt|gpt)([^a-z0-9]|$)/, 'openai'],
  [/(^|[^a-z0-9])deepseek([^a-z0-9]|$)/, 'deepseek'],
  [/(^|[^a-z0-9])(gemini|google)([^a-z0-9]|$)/, 'gemini'],
  [/(^|[^a-z0-9])mistral([^a-z0-9]|$)/, 'mistral'],
  [/(^|[^a-z0-9])(grok|x-?ai)([^a-z0-9]|$)/, 'xai'],
  [/(^|[^a-z0-9])openrouter([^a-z0-9]|$)/, 'openrouter'],
  [/(^|[^a-z0-9])groq([^a-z0-9]|$)/, 'groq'],
  [/(^|[^a-z0-9])together([^a-z0-9]|$)/, 'together'],
  [/(^|[^a-z0-9])ollama([^a-z0-9]|$)/, 'ollama'],
  [/(^|[^a-z0-9])lm[- ]?studio([^a-z0-9]|$)/, 'lmstudio'],
  [/(^|[^a-z0-9])deepinfra([^a-z0-9]|$)/, 'deepinfra'],
  [/(^|[^a-z0-9])fireworks([^a-z0-9]|$)/, 'fireworks'],
  [/(^|[^a-z0-9])z[. -]?ai([^a-z0-9]|$)/, 'zai'],
  [/(^|[^a-z0-9])moonshot([^a-z0-9]|$)/, 'moonshot'],
  [/(^|[^a-z0-9])kimi([^a-z0-9]|$)/, 'kimi'],
  [/(^|[^a-z0-9])minimax([^a-z0-9]|$)/, 'minimax'],
  [/(^|[^a-z0-9])github[- ]copilot([^a-z0-9]|$)/, 'github-copilot'],
]

/**
 * Identidad del Engine, dominio conocido, y alias solo para Engines antiguos.
 * `custom` con un dominio privado conserva el icono neutro aunque su alias
 * mencione una marca. Ni el protocolo ni los modelos identifican compañías.
 */
export function brandForProvider(source: ProviderBrandSource): ProviderBrand | null {
  const productBrand = brandForProduct(source.product_id)
  if (productBrand) return productBrand
  const host = endpointHost(source.endpoint)
  if (host !== null) {
    for (const [pattern, id] of ENDPOINT_BRANDS) {
      if (pattern.test(host)) return PROVIDER_BRANDS[id]
    }
  }
  if (source.product_id) return null
  const alias = (source.alias ?? '').trim().toLowerCase()
  if (alias !== '') {
    for (const [pattern, id] of ALIAS_BRANDS) {
      if (pattern.test(alias)) return PROVIDER_BRANDS[id]
    }
  }
  return null
}
