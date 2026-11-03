import { describe, expect, it } from 'vitest'
import { translate } from '../../i18n'
import { windowLabel } from './windowLabel'

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('es', key, vars)

describe('plan window names', () => {
  it('names a window by its length when its id is the API key', () => {
    expect(windowLabel({ id: 'default:primary_window', label: 'default · primary_window', scope: 'default', duration_seconds: 18000 }, t)).toBe('Ventana de 5 horas')
    expect(windowLabel({ id: 'default:secondary_window', label: 'x', scope: 'default', duration_seconds: 604800 }, t)).toBe('Semana')
    expect(windowLabel({ id: 'review:primary_window', label: 'x', scope: 'review', duration_seconds: 3600 }, t)).toBe('review · Ventana de 1 hora')
  })

  it('keeps the known ids and, without a length, the provider label', () => {
    expect(windowLabel({ id: 'weekly', label: 'weekly' }, t)).toBe('Semana')
    expect(windowLabel({ id: 'odd', label: 'Algo raro', duration_seconds: null }, t)).toBe('Algo raro')
  })
})
