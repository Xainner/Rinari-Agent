import { expect, it } from 'vitest'
import { brandForProvider, endpointHost, providerBrand } from './providerBrand'

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
  expect(brandForProvider({ alias: 'z-ai', endpoint: null })).toBeNull()
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
