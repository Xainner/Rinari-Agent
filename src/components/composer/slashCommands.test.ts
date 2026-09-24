import { describe, expect, it } from 'vitest'
import type { SlashCommand } from '../../services/engine'
import { matchSlashCommands, parseSlashCommand, planSlash, runsOnPick, slashQuery } from './slashCommands'

const command = (partial: Partial<SlashCommand> & { name: string }): SlashCommand => ({
  kind: 'ui',
  description: '',
  args: '',
  mode: null,
  template: null,
  source: 'builtin',
  ...partial,
})

const catalog = [
  command({ name: 'plan', kind: 'mode', mode: 'plan', args: '[text]' }),
  command({ name: 'review', kind: 'mode', mode: 'review', args: '[text]', template: 'Review the changes' }),
  command({ name: 'test', kind: 'turn', args: '[text]', template: 'Run the tests' }),
  command({ name: 'new' }),
  command({ name: 'research', kind: 'skill', args: '[text]', source: 'skill' }),
]

describe('comandos /', () => {
  it('abre el menú solo mientras se escribe el nombre', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/pl')).toBe('pl')
    expect(slashQuery('/plan algo')).toBeNull()
    expect(slashQuery('hola /plan')).toBeNull()
    expect(slashQuery('/usr/bin')).toBeNull()
  })

  it('prioriza los que empiezan por la consulta', () => {
    expect(matchSlashCommands('re', catalog).map((c) => c.name)).toEqual(['review', 'research'])
    expect(matchSlashCommands('e', catalog).map((c) => c.name)).toEqual(['review', 'test', 'new', 'research'])
  })

  it('reconoce solo comandos del catálogo; una ruta sigue siendo texto', () => {
    expect(parseSlashCommand('/review solo el parser', catalog)).toMatchObject({ command: { name: 'review' }, text: 'solo el parser' })
    expect(parseSlashCommand('/Plan', catalog)?.command.name).toBe('plan')
    expect(parseSlashCommand('/usr/bin/python', catalog)).toBeNull()
    expect(parseSlashCommand('/desconocido hola', catalog)).toBeNull()
  })

  it('decide qué hace cada tipo', () => {
    expect(planSlash(catalog[0], '')).toEqual({ kind: 'mode', mode: 'plan' })
    expect(planSlash(catalog[0], 'diseña X')).toEqual({ kind: 'send', name: 'plan', text: 'diseña X' })
    expect(planSlash(catalog[1], '')).toEqual({ kind: 'send', name: 'review', text: '' })
    expect(planSlash(catalog[3], '')).toEqual({ kind: 'ui', name: 'new', text: '' })
    expect(planSlash(catalog[4], 'precios')).toEqual({ kind: 'send', name: 'research', text: 'precios' })
    expect(runsOnPick(catalog[3])).toBe(true)
    expect(runsOnPick(catalog[0])).toBe(false)
  })
})
