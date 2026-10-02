import { expect, it } from 'vitest'
import { modelDisplayName, modelTechnicalId } from './modelDisplay'

const opus = {
  alias: 'opus',
  provider_model_id: 'opus',
  capabilities: { label: 'Opus 5.5', resolved_model: 'claude-opus-5-5' },
}

it('muestra el nombre real cuando el alias es el que puso Rinari', () => {
  expect(modelDisplayName(opus)).toBe('Opus 5.5')
  expect(modelDisplayName({ ...opus, alias: 'claude-opus-4-6', provider_model_id: 'claude-opus-4-6', capabilities: { label: 'Opus 4.6' } })).toBe('Opus 4.6')
})

it('respeta el alias que eligió el usuario', () => {
  // Es el nombre con el que lo busca y lo usa en comandos: no se pisa.
  expect(modelDisplayName({ ...opus, alias: 'mi-opus' })).toBe('mi-opus')
})

it('sin nombre publicado, nada cambia respecto de antes', () => {
  expect(modelDisplayName({ alias: 'gpt-5', provider_model_id: 'gpt-5', capabilities: {} })).toBe('gpt-5')
  expect(modelDisplayName({ alias: 'local', provider_model_id: 'qwen3', capabilities: null })).toBe('local')
})

it('el subtítulo dice a qué modelo concreto resuelve un alias', () => {
  expect(modelTechnicalId(opus)).toBe('claude-opus-5-5')
  expect(modelTechnicalId({ provider_model_id: 'gpt-5', capabilities: {} })).toBe('gpt-5')
})
