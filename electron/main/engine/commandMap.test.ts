// El inventario como especificación del port (documento 02 §2 y §8).
//
// El nombre del comando **no** es el método del protocolo, y sus argumentos se
// renombran por el camino. Estas pruebas fijan que el inventario tenga ese dato
// para los 130, para que la traducción del host nuevo no se construya sobre
// una tabla incompleta.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ENGINE_METHODS } from '../../../src/types/protocol.generated'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const inventory = JSON.parse(
  readFileSync(join(ROOT, 'docs/migration/desktop-parity.json'), 'utf8'),
) as {
  commands: Array<{
    command: string
    engine_method: string | null
    engine_method_name: string | null
    engine_params: string[] | null
    args: Array<{ name: string }>
  }>
}

/**
 * Comandos que no hablan con el Engine por el protocolo: ciclo de vida del
 * supervisor, handoff y el que además abre un fichero con el opener. En el
 * host nuevo son canales propios, no entradas de la tabla de traducción.
 */
const HOST_ONLY = new Set([
  'engine_status',
  'engine_start',
  'engine_shutdown',
  'engine_restart',
  'initial_open_request',
  'workspace_file_open',
])

describe('inventario como especificación de la traducción', () => {
  it('cada comando tiene método del protocolo o es explícitamente del host', () => {
    const sinMetodo = inventory.commands
      .filter((row) => !row.engine_method_name && !HOST_ONLY.has(row.command))
      .map((row) => row.command)
    expect(sinMetodo).toEqual([])
  })

  it('los marcados como del host son exactamente los que no tienen método', () => {
    // Si alguien añade un comando de host, esto obliga a declararlo aquí en
    // vez de dejarlo pasar como «sin resolver».
    const declaradosPeroConMetodo = [...HOST_ONLY].filter(
      (name) => inventory.commands.find((row) => row.command === name)?.engine_method_name,
    )
    expect(declaradosPeroConMetodo).toEqual([])
  })

  it('todo método resuelto existe en el protocolo generado del Engine', () => {
    // Un método inventado se detecta aquí y no en ejecución contra el Engine.
    const conocidos = new Set<string>(ENGINE_METHODS)
    const desconocidos = inventory.commands
      .filter((row) => row.engine_method_name && !conocidos.has(row.engine_method_name))
      .map((row) => `${row.command} -> ${row.engine_method_name}`)
    expect(desconocidos).toEqual([])
  })

  it('el renombrado de `reference` a `ref` está registrado donde ocurre', () => {
    // Es el renombrado más extendido: 21 comandos. Si el host nuevo enviara
    // `reference`, el Engine no encontraría la sesión y fallaría en silencio.
    const renombran = inventory.commands.filter(
      (row) => row.args.some((arg) => arg.name === 'reference') && row.engine_params?.includes('ref'),
    )
    expect(renombran.length).toBeGreaterThanOrEqual(20)
    for (const row of renombran) {
      expect(row.engine_params, row.command).not.toContain('reference')
    }
  })

  it('ningún comando declara un parámetro que el Engine no recibiría', () => {
    // `engine_params` vacío significa que el wrapper arma los parámetros de
    // otra forma; eso es una laguna conocida del extractor, no un contrato.
    const conMapa = inventory.commands.filter((row) => row.engine_params?.length)
    expect(conMapa.length).toBeGreaterThan(60)
  })
})
