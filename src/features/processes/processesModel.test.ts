import { describe, expect, it } from 'vitest'
import {
  deriveStatusKey,
  durationMs,
  elapsedMsSinceStarted,
  exitReasonLabelKey,
  isExternalPreview,
  kindLabel,
  orderPresentations,
  readinessLabelKey,
  resourceTitle,
  scopeKey,
  summarizeStrip,
  type ProcessPresentation,
} from './processesModel'
import type { ManagedProcess } from '../../types/protocol.generated'

function row(overrides: Partial<ManagedProcess> & { id: string }): ManagedProcess {
  return {
    kind: 'process',
    command: 'npm run dev',
    cwd: 'C:/site',
    running: true,
    can_stop: true,
    ...overrides,
  }
}

function presentation(resource: ManagedProcess, extra: Partial<ProcessPresentation> = {}): ProcessPresentation {
  return {
    resource,
    firstObservedAt: 1000,
    lastVerifiedAt: 2000,
    dismissedFromStrip: false,
    attentionAcknowledged: false,
    ...extra,
  }
}

describe('scopeKey', () => {
  it('aísla el mismo ID entre sesiones y épocas', () => {
    expect(scopeKey(1, 'A', 'process:proc_001')).not.toBe(scopeKey(1, 'B', 'process:proc_001'))
    expect(scopeKey(1, 'A', 'process:proc_001')).not.toBe(scopeKey(2, 'A', 'process:proc_001'))
  })

  it('trata el ID como opaco', () => {
    expect(scopeKey(1, 'A', 'process:proc_001')).not.toBe(scopeKey(1, 'A', 'proc_001'))
  })
})

describe('deriveStatusKey', () => {
  it('activo nunca es listo ni saludable', () => {
    expect(deriveStatusKey(row({ id: 'a', running: true }))).toBe('running')
  })

  it('distingue códigos de salida', () => {
    expect(deriveStatusKey(row({ id: 'a', running: false, exit_code: 0 }))).toBe('finished_ok')
    expect(deriveStatusKey(row({ id: 'a', running: false, exit_code: 1 }))).toBe('finished_error')
    expect(deriveStatusKey(row({ id: 'a', running: false, exit_code: -9 }))).toBe('finished_error')
  })

  it('desconexión no se representa como finalizado', () => {
    expect(deriveStatusKey(row({ id: 'a', running: true }), { online: false })).toBe('unverified')
  })

  it('preview externa sin propiedad no es proceso activo', () => {
    const preview = row({ id: 'p', kind: 'preview', command: 'Vista previa HTML', running: false, exit_code: null, can_stop: false })
    expect(deriveStatusKey(preview)).toBe('external')
    expect(isExternalPreview(preview)).toBe(true)
  })

  it('kind desconocido es estado no determinado, no crash', () => {
    expect(deriveStatusKey(row({ id: 'x', kind: 'futura', running: false, exit_code: null, can_stop: false }))).toBe('unknown')
  })
})

describe('tiempo', () => {  it('rechaza segundos Unix inválidos sin NaN ni 1970', () => {
    const now = Date.now()
    expect(elapsedMsSinceStarted(undefined, now)).toBeNull()
    expect(elapsedMsSinceStarted(NaN, now)).toBeNull()
    expect(elapsedMsSinceStarted(-5, now)).toBeNull()
    expect(elapsedMsSinceStarted(0, now)).toBeNull()
    expect(elapsedMsSinceStarted(123, now)).toBeNull()
    expect(elapsedMsSinceStarted(now / 1000 + 3600, now)).toBeNull()
  })

  it('acepta started_at en segundos', () => {
    const now = 1_700_000_000_000
    const startedAt = now / 1000 - 90
    expect(elapsedMsSinceStarted(startedAt, now)).toBe(90_000)
  })

  it('duración exacta con ended_at; nunca inventada sin él', () => {
    const now = 1_700_000_100_000
    const finished = row({ id: 'a', running: false, exit_code: 0, started_at: 1_700_000_000, ended_at: 1_700_000_060 })
    expect(durationMs(finished, now)).toBe(60_000)
    const noEnd = row({ id: 'b', running: false, exit_code: 0, started_at: 1_700_000_000 })
    expect(durationMs(noEnd, now)).toBeNull()
    const active = row({ id: 'c', running: true, started_at: 1_700_000_050 })
    expect(durationMs(active, now)).toBe(50_000)
  })
})

describe('etiquetas de identidad', () => {
  it('mapea readiness y exit_reason conocidos, null en el resto', () => {
    expect(readinessLabelKey('listening')).toBe('processes.readyListening')
    expect(readinessLabelKey('not_listening')).toBe('processes.readyNotListening')
    expect(readinessLabelKey('unknown')).toBeNull()
    expect(readinessLabelKey(undefined)).toBeNull()
    expect(exitReasonLabelKey('stopped')).toBe('processes.exitStopped')
    expect(exitReasonLabelKey('exited')).toBe('processes.exitExited')
    expect(exitReasonLabelKey('bogus')).toBeNull()
    expect(exitReasonLabelKey(undefined)).toBeNull()
  })
})

describe('orden estable', () => {
  it('atención > activos > terminados > externos, estable dentro del grupo', () => {
    const failed = presentation(row({ id: 'f', running: false, exit_code: 1 }))
    const activeB = presentation(row({ id: 'b', running: true, command: 'b' }))
    const activeA = presentation(row({ id: 'a', running: true, command: 'a' }))
    const done = presentation(row({ id: 'd', running: false, exit_code: 0 }), { completionObservedAt: 3000 })
    const external = presentation(
      row({ id: 'e', kind: 'preview', command: 'Vista previa HTML', running: false, exit_code: null, can_stop: false }),
    )
    const ordered = orderPresentations([
      { presentation: activeB, selected: false, pinned: false },
      { presentation: external, selected: false, pinned: false },
      { presentation: done, selected: false, pinned: false },
      { presentation: activeA, selected: false, pinned: false },
      { presentation: failed, selected: false, pinned: false },
    ])
    expect(ordered.map((item) => item.resource.id)).toEqual(['f', 'b', 'a', 'd', 'e'])
  })

  it('selección y fijado van primero sin reordenar el resto por reloj', () => {
    const a = presentation(row({ id: 'a', running: true }))
    const b = presentation(row({ id: 'b', running: true }))
    const first = orderPresentations([
      { presentation: a, selected: false, pinned: false },
      { presentation: b, selected: true, pinned: false },
    ])
    expect(first[0]!.resource.id).toBe('b')
    const second = orderPresentations([
      { presentation: a, selected: false, pinned: false },
      { presentation: b, selected: true, pinned: false },
    ])
    expect(second.map((item) => item.resource.id)).toEqual(first.map((item) => item.resource.id))
  })
})

describe('franja', () => {
  it('un recurso no muestra cabecera; varios limitan a dos filas + contador', () => {
    const one = summarizeStrip([presentation(row({ id: 'a' }))], { listTruncated: false })
    expect(one.showHeader).toBe(false)
    expect(one.visible).toHaveLength(1)
    const three = summarizeStrip(
      [presentation(row({ id: 'a' })), presentation(row({ id: 'b' })), presentation(row({ id: 'c' }))],
      { listTruncated: false },
    )
    expect(three.showHeader).toBe(true)
    expect(three.visible).toHaveLength(2)
    expect(three.hiddenCount).toBe(1)
  })

  it('propaga lista parcial sin inventar el total', () => {
    const summary = summarizeStrip([presentation(row({ id: 'a' }))], { listTruncated: true })
    expect(summary.partialList).toBe(true)
  })
})

describe('etiquetas', () => {
  it('no usa LLM y distingue PTY/preview', () => {
    expect(kindLabel('pty')).toBe('Terminal')
    expect(kindLabel('preview')).toBe('Vista previa')
    expect(resourceTitle(row({ id: 'a', kind: 'pty', command: 'pwsh' }))).toBe('pwsh')
  })
})
