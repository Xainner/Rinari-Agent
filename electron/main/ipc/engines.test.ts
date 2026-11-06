// «Conectar a mi servidor»: lo que main acepta del renderer.
import { describe, expect, it } from 'vitest'

import { ValidationError } from '../../shared/validation'
import { assertEngineId, assertPairRequest } from './register'

describe('assertEngineId', () => {
  it('accepts this computer and paired server ids', () => {
    expect(assertEngineId('local')).toBe('local')
    expect(assertEngineId('3f2b8c1e-9d4a-4b6f-8e2d-1a2b3c4d5e6f')).toBe('3f2b8c1e-9d4a-4b6f-8e2d-1a2b3c4d5e6f')
  })

  it('rejects anything else', () => {
    for (const value of [undefined, null, 1, '', 'LOCAL', '../engines.json', 'x'.repeat(36), { id: 'local' }]) {
      expect(() => assertEngineId(value), String(value)).toThrow(ValidationError)
    }
  })
})

describe('assertPairRequest', () => {
  it('keeps only the known text fields', () => {
    expect(assertPairRequest({ link: 'rinari://pair?url=x&code=y' })).toEqual({ link: 'rinari://pair?url=x&code=y' })
    expect(assertPairRequest({ server: 'https://a', code: 'ABCD', name: 'Saturno', link: null })).toEqual({
      server: 'https://a',
      code: 'ABCD',
      name: 'Saturno',
    })
  })

  it('rejects unknown fields, other types and huge values', () => {
    expect(() => assertPairRequest(null)).toThrow(ValidationError)
    expect(() => assertPairRequest(['link'])).toThrow(ValidationError)
    expect(() => assertPairRequest({ token: 'x' })).toThrow(/unknown pair field/)
    expect(() => assertPairRequest({ code: 1234 })).toThrow(ValidationError)
    expect(() => assertPairRequest({ link: 'x'.repeat(2049) })).toThrow(ValidationError)
  })
})
