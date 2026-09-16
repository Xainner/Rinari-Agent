import { describe, expect, it } from 'vitest'
import {
  deriveStatusKey,
  durationMs,
  elapsedMsSinceStarted,
  exitReasonLabelKey,
  isExternalPreview,
  isFailureStatus,
  kindLabelKey,
  orderPresentations,
  readinessLabelKey,
  resourceTitle,
  sameResource,
  stopResultKey,
  statusTextKey,
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

describe('igualdad de presentación', () => {  it('detecta cambios en readiness, pid y motivo de fin', () => {
    const a = row({ id: 'a', running: true, readiness: 'unknown' })
    expect(sameResource(a, { ...a })).toBe(true)
    expect(sameResource(a, { ...a, readiness: 'listening' })).toBe(false)
    expect(sameResource(a, { ...a, pid: 123 })).toBe(false)
    expect(sameResource(a, { ...a, exit_reason: 'stopped', running: false })).toBe(false)
    expect(sameResource(a, { ...a, command: 'otro' })).toBe(false)
  })
})

describe('estado sin propiedad y mapa de etiquetas', () => {  it('sin proceso gestionado no inventa código ni control', () => {
    const orphan = row({ id: 'a', running: false, exit_code: null, can_stop: false })
    expect(deriveStatusKey(orphan)).toBe('no_owned_process')
  })

  it('statusTextKey cubre los ocho estados', () => {
    expect(statusTextKey('running')).toBe('processes.running')
    expect(statusTextKey('finished_ok')).toBe('processes.finishedOk')
    expect(statusTextKey('finished_error')).toBe('processes.finishedError')
    expect(statusTextKey('stop_confirmed')).toBe('processes.stopConfirmed')
    expect(statusTextKey('no_owned_process')).toBe('processes.noOwnedProcess')
    expect(statusTextKey('external')).toBe('processes.external')
    expect(statusTextKey('unknown')).toBe('processes.unknownState')
    expect(statusTextKey('unverified')).toBe('processes.unverified')
  })

  it('exitReasonLabelKey cubre falló, señal y desconocido', () => {
    expect(exitReasonLabelKey('failed')).toBe('processes.exitFailed')
    expect(exitReasonLabelKey('signaled')).toBe('processes.exitSignaled')
    expect(exitReasonLabelKey('unknown')).toBe('processes.exitUnknown')
  })
})

describe('etiquetas de identidad', () => {  it('mapea readiness y exit_reason conocidos, null en el resto', () => {
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
    expect(kindLabelKey('pty')).toBe('processes.kindPty')
    expect(kindLabelKey('preview')).toBe('processes.kindPreview')
    expect(kindLabelKey('process')).toBe('processes.kindProcess')
    expect(resourceTitle(row({ id: 'a', kind: 'pty', command: 'pwsh' }))).toBe('pwsh')
  })

  it('sin comando no inventa texto: la vista traduce el tipo', () => {
    expect(resourceTitle(row({ id: 'a', kind: 'preview', command: '' }))).toBeNull()
    expect(resourceTitle(row({ id: 'b', kind: 'pty', command: '   ' }))).toBeNull()
  })
})

describe('stopResultKey', () => {
  it('STALE_RESOURCE no se anuncia como "sigue activo"', () => {
    expect(
      stopResultKey({ state: 'failed', requestId: 'r', reason: 'stale_resource', message: '' }),
    ).toBe('processes.stopStaleResource')
  })

  it('el engine que reporta el recurso vivo sí es "sigue activo"', () => {
    expect(
      stopResultKey({ state: 'failed', requestId: 'r', reason: 'still_running', message: '' }),
    ).toBe('processes.stillActive')
  })

  it('un error no clasificado queda incierto y nunca muestra el crudo', () => {
    expect(
      stopResultKey({ state: 'uncertain', requestId: 'r', reason: 'unknown', message: 'timeout' }),
    ).toBe('processes.stopUncertain')
    expect(stopResultKey({ state: 'idle' })).toBeNull()
    expect(stopResultKey({ state: 'confirmed', requestId: 'r' })).toBeNull()
  })
})

describe('orden', () => {
  it('una preview externa se ordena después de un terminado corriente', () => {
    const finished = presentation(row({ id: 'fin', running: false, exit_code: 0 }))
    const external = presentation(row({ id: 'ext', kind: 'preview', running: false }))
    const ordered = orderPresentations([
      { presentation: external, selected: false, pinned: false },
      { presentation: finished, selected: false, pinned: false },
    ])
    expect(ordered.map((item) => item.resource.id)).toEqual(['fin', 'ext'])
  })
})

describe('detención propia no es fallo', () => {
  it('stopped nunca requiere atención aunque el código sea distinto de cero', () => {
    const stopped = row({ id: 'a', running: false, can_stop: false, exit_code: 137, exit_reason: 'stopped' })
    expect(isFailureStatus(stopped, false)).toBe(false)
    const crashed = row({ id: 'b', running: false, can_stop: false, exit_code: 1 })
    expect(isFailureStatus(crashed, false)).toBe(true)
  })
})
