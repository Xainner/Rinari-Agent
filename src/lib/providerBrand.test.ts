import { expect, it } from 'vitest'
import { brandForProduct, brandForProvider, endpointHost, providerBrand, PROVIDER_BRANDS, PROVIDER_PRODUCT_BRANDS } from './providerBrand'

it('resuelve la marca por host del endpoint antes que por alias', () => {
  expect(brandForProvider({ alias: 'mi-gateway', endpoint: 'https://opencode.ai/zen/go/v1' })?.id).toBe('opencode')
  expect(
    brandForProvider({ alias: 'claude-work', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai' })?.id,
  ).toBe('gemini')
  expect(brandForProvider({ alias: 'proxy', endpoint: 'https://api.x.ai/v1' })?.id).toBe('xai')
})

it('resuelve por alias y no marca proveedores propios ni nombres parecidos', () => {
  expect(brandForProvider({ alias: 'opencode-go', endpoint: null })?.id).toBe('opencode')
  expect(brandForProvider({ alias: 'Anthropic', endpoint: '' })?.id).toBe('anthropic')
  expect(brandForProvider({ alias: 'grok', endpoint: null })?.id).toBe('xai')
  expect(brandForProvider({ alias: 'xAInner', endpoint: 'https://api.xainner.com/v1' })).toBeNull()
  expect(brandForProvider({ alias: 'z-ai', endpoint: null })?.id).toBe('zai')
  expect(brandForProvider({ alias: 'Local', endpoint: 'http://127.0.0.1:11434/v1' })).toBeNull()
})

it('acepta hosts sin esquema y expone el asset de cada marca', () => {
  expect(endpointHost('api.openai.com/v1')).toBe('api.openai.com')
  expect(endpointHost('  https://API.X.AI/v1  ')).toBe('api.x.ai')
  expect(endpointHost(null)).toBeNull()
  expect(endpointHost('')).toBeNull()
  expect(brandForProvider({ endpoint: 'https://api.deepseek.com/v1' })?.src).toBe('/logos/deepseek.png')
  expect(providerBrand('mistral')?.label).toBe('Mistral')
  expect(providerBrand(null)).toBeNull()
})

it('prioriza el producto reconocido aunque el alias o endpoint sugieran otra marca', () => {
  expect(brandForProvider({ product_id: 'ollama', alias: 'Trabajo', endpoint: 'http://localhost:1234/v1' })?.id).toBe('ollama')
  expect(brandForProvider({ product_id: 'chatgpt', alias: 'Claude', endpoint: 'https://api.groq.com/v1' })?.id).toBe('openai')
  expect(brandForProvider({ product_id: 'lmstudio', alias: 'Equipo' })?.id).toBe('lmstudio')
  expect(brandForProvider({ product_id: 'future', endpoint: 'https://api.fireworks.ai/inference/v1' })?.id).toBe('fireworks')
})

it('no infiere marca de protocolos, modelos, puertos locales ni dominios parecidos', () => {
  for (const endpoint of ['http://localhost:1234/v1', 'http://127.0.0.1:11434/v1', 'https://openai.com.private.test/v1', 'https://fakeopenrouter.ai/v1']) {
    expect(brandForProvider({ alias: 'Privado', endpoint })).toBeNull()
  }
  for (const alias of ['mygroqservice', 'minimaximum', 'notollama', 'xAInner']) expect(brandForProvider({ alias })).toBeNull()
  for (const product_id of ['custom', 'future']) {
    expect(brandForProvider({ product_id, alias: 'OpenAI', endpoint: 'https://private.test/v1' })).toBeNull()
  }
  const privateProvider = { alias: 'Interno', type: 'openai', provider_model_id: 'gpt-5', endpoint: 'http://localhost:1234/v1' }
  expect(brandForProvider(privateProvider)).toBeNull()
  expect(brandForProduct('constructor')).toBeNull()
})

it.each([
  ['openrouter.ai', 'openrouter'], ['api.groq.com', 'groq'], ['api.together.xyz', 'together'],
  ['api.deepinfra.com', 'deepinfra'], ['api.fireworks.ai', 'fireworks'], ['api.z.ai', 'zai'],
  ['api.moonshot.ai', 'moonshot'], ['api.kimi.com', 'kimi'], ['api.minimax.io', 'minimax'],
  ['api.githubcopilot.com', 'github-copilot'],
])('resuelve el dominio oficial %s', (host, brand) => {
  expect(brandForProvider({ alias: 'Mi cuenta', endpoint: `https://${host}/v1` })?.id).toBe(brand)
})

it('cubre el catálogo fijado sin depender de presets antiguos y empaqueta todos los recursos', () => {
  const products = 'openai anthropic openrouter deepseek groq together mistral xai opencode-zen opencode-go ollama lmstudio custom gemini deepinfra fireworks zai zai-coding moonshot kimi-coding minimax minimax-coding chatgpt github-copilot claude-subscription'.split(' ')
  expect(Object.keys(PROVIDER_PRODUCT_BRANDS).sort()).toEqual(products.sort())
  for (const id of products) expect(brandForProduct(id)?.id ?? null, id).toBe(PROVIDER_PRODUCT_BRANDS[id])
  expect(brandForProduct('custom')).toBeNull()
  const files = Object.keys(import.meta.glob('/public/logos/*.{png,svg}'))
  expect(Object.keys(PROVIDER_BRANDS)).toHaveLength(19)
  for (const brand of Object.values(PROVIDER_BRANDS)) {
    for (const src of [brand.src, brand.srcLight].filter(Boolean)) expect(files).toContain(`/public${src}`)
  }
})
