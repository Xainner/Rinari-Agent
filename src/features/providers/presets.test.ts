import { expect, it } from 'vitest'
import { providerBrand } from '../../lib/providerBrand'
import { PROVIDER_PRESETS } from './presets'

/**
 * Glob de Vite sobre public/: valida que el asset exista de verdad sin
 * depender de tipos de Node (el proyecto no usa @types/node).
 */
const LOGO_ASSETS = Object.keys(import.meta.glob('/public/logos/*.png')).map(
  (path) => path.split('/').pop() ?? '',
)

it('expone OpenCode Zen y OpenCode Go como endpoints OpenAI-compatible', () => {
  const byId = new Map(PROVIDER_PRESETS.map((preset) => [preset.id, preset]))
  expect(byId.get('opencode-zen')?.endpoint).toBe('https://opencode.ai/zen/v1')
  expect(byId.get('opencode-go')?.endpoint).toBe('https://opencode.ai/zen/go/v1')
  for (const id of ['opencode-zen', 'opencode-go']) {
    expect(byId.get(id)?.provider_type).toBe('custom')
    expect(byId.get(id)?.auth).toBe('api-key')
    expect(byId.get(id)?.brand).toBe('opencode')
  }
})

it('cada preset con marca tiene su logo presente en public/logos', () => {
  const branded = PROVIDER_PRESETS.filter((preset) => preset.brand)
  expect(branded.map((preset) => preset.id).sort()).toEqual(
    ['anthropic', 'deepseek', 'gemini', 'mistral', 'openai', 'opencode-go', 'opencode-zen', 'xai'].sort(),
  )
  for (const preset of branded) {
    const brand = providerBrand(preset.brand)
    expect(brand, preset.id).not.toBeNull()
    expect(LOGO_ASSETS, `${preset.id} -> ${brand!.src}`).toContain(brand!.src.split('/').pop())
  }
})

it('no repite ids y todos los endpoints base van sin barra final', () => {
  const ids = PROVIDER_PRESETS.map((preset) => preset.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const preset of PROVIDER_PRESETS) {
    expect(preset.endpoint.endsWith('/'), preset.id).toBe(false)
  }
})
