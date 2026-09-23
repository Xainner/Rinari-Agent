// @vitest-environment jsdom
// Derivaciones de presentación del flujo. Sin Engine y sin render: aquí se
// comprueban las reglas que el canvas aplica, no cómo se ven.
import { describe, expect, it } from 'vitest'
import type { ModelSummary } from '../../services/engine'
import { resolveExecutor } from './FlowStageCard'
import { clockLabel, groupByCycle } from './flowModel'
import { stageFixture } from './flowFixtures'

function model(overrides: Partial<ModelSummary> & Pick<ModelSummary, 'id'>): ModelSummary {
  return {
    alias: overrides.id,
    provider_id: 'prov',
    provider: 'prov',
    provider_model_id: overrides.id,
    capabilities: null,
    availability: 'ready',
    settings: {},
    active: false,
    ...overrides,
  }
}

describe('groupByCycle', () => {
  it('lleva la posición global de cada grupo, sin buscarla en el render', () => {
    const stages = [
      stageFixture({ id: 'a', index: 1, cycle_index: 1 }),
      stageFixture({ id: 'b', index: 2, cycle_index: 1 }),
      stageFixture({ id: 'c', index: 3, cycle_index: 2 }),
      stageFixture({ id: 'd', index: 4, cycle_index: 2 }),
    ]
    const groups = groupByCycle(stages)
    expect(groups.map((group) => [group.cycle, group.offset, group.stages.length])).toEqual([
      [1, 0, 2],
      [2, 2, 2],
    ])
  })

  it('un ciclo que reaparece abre grupo nuevo y conserva su posición', () => {
    const stages = [
      stageFixture({ id: 'a', index: 1, cycle_index: 1 }),
      stageFixture({ id: 'b', index: 2, cycle_index: 2 }),
      stageFixture({ id: 'c', index: 3, cycle_index: 1 }),
    ]
    expect(groupByCycle(stages).map((group) => group.offset)).toEqual([0, 1, 2])
  })
})

describe('resolveExecutor: identidad canónica primero', () => {
  const catalogue = [
    // El alias de este registro coincide con el id canónico de otro. Buscando
    // id/alias/provider_model_id a la vez, modelo a modelo, ganaba éste por ir
    // antes en la lista.
    model({ id: 'mdl_otro', alias: 'mdl_bueno' }),
    model({ id: 'mdl_bueno', alias: 'opus', provider_model_id: 'claude-opus' }),
  ]

  it('el `model_id` del evento resuelve al registro con ese id, no al que lo lleva de alias', () => {
    expect(resolveExecutor('mdl_bueno', catalogue)?.id).toBe('mdl_bueno')
  })

  it('el alias vale como respaldo sólo si es inequívoco', () => {
    expect(resolveExecutor('opus', catalogue)?.id).toBe('mdl_bueno')
    const ambiguo = [model({ id: 'a', alias: 'sonnet' }), model({ id: 'b', alias: 'sonnet' })]
    // Dos candidatos: se prefiere no resolver y mostrar la cadena cruda antes
    // que atribuir las llamadas a un modelo que puede no ser el que corrió.
    expect(resolveExecutor('sonnet', ambiguo)).toBeNull()
  })

  it('el mismo `provider_model_id` en dos proveedores no resuelve', () => {
    const compartido = [
      model({ id: 'a', alias: 'a', provider_model_id: 'gpt-4o', provider: 'uno' }),
      model({ id: 'b', alias: 'b', provider_model_id: 'gpt-4o', provider: 'dos' }),
    ]
    expect(resolveExecutor('gpt-4o', compartido)).toBeNull()
  })

  it('un modelo que el catálogo no tiene no se resuelve', () => {
    expect(resolveExecutor('mdl_desconocido', catalogue)).toBeNull()
  })
})

describe('clockLabel', () => {
  it('sin lectura previa no inventa una hora', () => {
    expect(clockLabel(null)).toBe('—')
  })

  it('fecha la lectura con la hora local', () => {
    const at = Date.UTC(2026, 8, 21, 10, 5, 0)
    expect(clockLabel(at)).toBe(new Date(at).toLocaleTimeString())
  })
})
