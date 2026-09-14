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

it('expone OpenCode Go como endpoint OpenAI-compatible', () => {
  const go = PROVIDER_PRESETS.find((preset) => preset.id === 'opencode-go')
  expect(go?.endpoint).toBe('https://opencode.ai/zen/go/v1')
  expect(go?.provider_type).toBe('custom')
  expect(go?.auth).toBe('api-key')
  expect(go?.brand).toBe('opencode')
})

it('mantiene OpenCode Zen fuera hasta que el engine enrute por modelo', () => {
  // El catálogo de Zen reparte los modelos entre /chat/completions, /responses
  // (GPT, Grok) y /messages (Claude, Qwen); el engine solo auto-routea cuatro
  // IDs a responses. El preset vuelve cuando exista ese enrutamiento y la UI
  // no tenga que decidirlo.
  expect(PROVIDER_PRESETS.some((preset) => preset.id === 'opencode-zen')).toBe(false)
})

it('cada preset con marca tiene su logo en public/logos (y variante clara si aplica)', () => {
  const branded = PROVIDER_PRESETS.filter((preset) => preset.brand)
  expect(branded.map((preset) => preset.id).sort()).toEqual(
    ['anthropic', 'deepseek', 'gemini', 'mistral', 'openai', 'opencode-go', 'xai'].sort(),
  )
  for (const preset of branded) {
    const brand = providerBrand(preset.brand)
    expect(brand, preset.id).not.toBeNull()
    expect(LOGO_ASSETS, `${preset.id} -> ${brand!.src}`).toContain(brand!.src.split('/').pop())
    if (brand!.srcLight) {
      expect(LOGO_ASSETS, `${preset.id} -> ${brand!.srcLight}`).toContain(brand!.srcLight.split('/').pop())
    }
  }
})

it('las marcas monocromas traen variante para el tema claro', () => {
  expect(providerBrand('opencode')?.srcLight).toBe('/logos/opencode-light.png')
  expect(providerBrand('xai')?.srcLight).toBe('/logos/xai-light.png')
  // Las de color se ven en ambos temas con una sola variante.
  expect(providerBrand('anthropic')?.srcLight).toBeUndefined()
  expect(providerBrand('openai')?.srcLight).toBeUndefined()
})

it('no repite ids y todos los endpoints base van sin barra final', () => {
  const ids = PROVIDER_PRESETS.map((preset) => preset.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const preset of PROVIDER_PRESETS) {
    expect(preset.endpoint.endsWith('/'), preset.id).toBe(false)
  }
})
