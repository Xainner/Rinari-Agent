import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENGINE_METHODS } from '../../../src/types/protocol.generated'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const contract = JSON.parse(
  readFileSync(join(ROOT, 'docs/migration/desktop-command-contract.json'), 'utf8'),
) as {
  commands: Array<{
    command: string
    engine_method: string | null
    engine_params: Array<{ key: string; from: string | null }> | null
    args: Array<{ name: string }>
  }>
}

const HOST_ONLY = new Set([
  'engine_status',
  'engine_start',
  'engine_shutdown',
  'engine_restart',
  'initial_open_request',
  'workspace_file_open',
])

describe('inventario de comandos: traducción al Engine', () => {
  it('cada comando tiene método del protocolo o es explícitamente del host', () => {
    expect(contract.commands
      .filter((row) => !row.engine_method && !HOST_ONLY.has(row.command))
      .map((row) => row.command)).toEqual([])
  })

  it('los comandos del host son exactamente los que no tienen método', () => {
    expect(contract.commands
      .filter((row) => !row.engine_method)
      .map((row) => row.command)
      .sort()).toEqual([...HOST_ONLY].sort())
  })

  it('todo método resuelto existe en el protocolo generado del Engine', () => {
    const known = new Set<string>(ENGINE_METHODS)
    expect(contract.commands
      .filter((row) => row.engine_method && !known.has(row.engine_method))
      .map((row) => `${row.command} -> ${row.engine_method}`)).toEqual([])
  })

  it('el renombrado de reference a ref sigue explícito', () => {
    const renamed = contract.commands.filter((row) =>
      row.args.some((arg) => arg.name === 'reference')
      && row.engine_params?.some((param) => param.key === 'ref' && param.from === 'reference'),
    )
    expect(renamed.length).toBeGreaterThanOrEqual(20)
  })
})
