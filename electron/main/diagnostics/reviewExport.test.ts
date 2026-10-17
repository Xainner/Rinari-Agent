// «Exportar para revisión» (#79): las líneas de los registros de esas horas.
import { describe, expect, it } from 'vitest'

import { linesBetween } from './reviewExport'

describe('registros del intervalo', () => {
  it('keeps the lines inside the interval with a 10-minute margin, continuations included', () => {
    const log = [
      '2026-10-17T09:00:00.000Z INFO  far before',
      '2026-10-17T09:55:00.000Z WARN  just before',
      '  continuation of the warning',
      '2026-10-17T10:30:00.000Z ERROR inside',
      '2026-10-17T11:20:00.000Z INFO  far after',
    ].join('\n')
    const from = Date.parse('2026-10-17T10:00:00Z')
    const to = Date.parse('2026-10-17T11:00:00Z')
    expect(linesBetween(log, from, to).split('\n')).toEqual([
      '2026-10-17T09:55:00.000Z WARN  just before',
      '  continuation of the warning',
      '2026-10-17T10:30:00.000Z ERROR inside',
    ])
  })
})
