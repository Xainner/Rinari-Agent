import { describe, expect, it } from 'vitest'
import { translate } from '../../i18n'
import { turnFailure } from './turnFailure'
import { stopText } from './TurnMeta'

describe('a stream that ends without its final event', () => {
  it('is its own cause, worded without blaming anyone', () => {
    const cause = turnFailure({ kind: 'STREAM_INTERRUPTED', close: 'eof', provider_alias: 'opencode-go', request_id: 'req_1' })
    expect(cause).toMatchObject({ kind: 'stream', providerAlias: 'opencode-go', requestId: 'req_1' })
    expect(translate('es', 'failure.stream', { provider: 'opencode-go' })).toBe('La respuesta de opencode-go terminó sin confirmar su final.')
  })

  it('older engines without the close detail keep the plain message', () => {
    expect(turnFailure({ kind: 'STREAM_INTERRUPTED', partial: true })).toBeNull()
  })
})

describe('a loop stop', () => {
  const t = (key: Parameters<typeof translate>[1]) => translate('es', key)
  it('is said in the app language, by detector kind', () => {
    expect(stopText({ code: 'loop', message: 'Stopped: persistent loop detected (repeated-rewrites: a.css)', loop: 'repeated-rewrites' }, t))
      .toBe('Detenido: deshacía y rehacía el mismo cambio en un archivo.')
    expect(stopText({ code: 'loop', message: 'x', loop: 'new-kind' }, t)).toBe('Detenido: se repetía sin avanzar.')
    expect(stopText({ code: 'stagnation', message: 'Stopped by the automatic governor', loop: 'stagnation' }, t))
      .toBe('Detenido: dejó de avanzar después de varios intentos de recuperarse.')
  })

  it('other stops keep the Engine text, or the fallback', () => {
    expect(stopText({ code: 'budget', message: 'Presupuesto agotado' }, t)).toBe('Presupuesto agotado')
    expect(stopText({ code: 'budget', message: '' }, t)).toBe('Turno detenido.')
  })
})

describe('a safety-limit stop', () => {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('es', key, vars)
  it('names the limit and its value in the app language', () => {
    expect(stopText({ code: 'emergency_limit', message: 'Stopped: turn budget exhausted (model-calls: model-call limit reached).', budget: 'model-calls', limit: 500 }, t))
      .toBe('Se pausó al llegar al límite de seguridad de 500 llamadas al modelo en un turno.')
    expect(stopText({ code: 'emergency_limit', message: 'x', budget: 'wall-time', limit: 7200 }, t))
      .toBe('Se pausó al cumplir el tiempo máximo de un turno (120 min).')
    expect(stopText({ code: 'emergency_limit', message: 'x', budget: 'cost' }, t))
      .toBe('Se pausó al llegar a un límite de seguridad del turno.')
  })
})

describe('a turn closed because the Engine exited', () => {
  it('is its own cause, said in the app language', () => {
    expect(turnFailure({ reason: 'engine_exited', recoverable: true, reconciled: true })).toMatchObject({ kind: 'engine' })
    expect(translate('es', 'failure.engine')).toContain('Rinari se cerró mientras este turno trabajaba')
  })
})

describe('notices about the model', () => {
  it('reach the activity: reasoning ignored and no image support', async () => {
    const { projectActivity } = await import('./activityPresentation')
    const timeline = {
      turnId: 't1', sessionId: 's1', status: 'completed' as const, startedAt: 1, completedAt: 2, userMessage: 'hola',
      items: [
        { id: 'system:1', type: 'system' as const, activitySeq: 1, occurredAt: 1, kind: 'reasoning_dropped' as const, label: 'high' },
        { id: 'vision:v1:1', type: 'vision' as const, activitySeq: 2, occurredAt: 1, status: 'failed' as const, route: 'conversation', fallback: 'without_images', modelId: '', providerName: '', modelName: '', question: '', analysis: '', images: [], cached: false },
      ],
    }
    const projection = projectActivity(timeline)
    // Outside the collapsible activity: visible after the turn ends.
    expect(projection.notices.map((item) => item.id)).toEqual(['system:1', 'vision:v1:1'])
    expect(projection.segments.flatMap((segment) => segment.items)).toEqual([])
  })
})
