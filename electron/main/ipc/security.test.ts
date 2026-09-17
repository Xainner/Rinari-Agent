// Frontera de privilegios del host (documento 02 §6.1 y §3.1) y pruebas
// negativas de SEC-01, SEC-02 y SEC-03 del documento 04.
import { describe, expect, it } from 'vitest'

import { SenderRegistry, originOf, validateSender } from './validateSender'
import {
  MAX_COMMAND_PARAMS_BYTES,
  ValidationError,
  assertCommandName,
  assertCommandParams,
  assertOpenableUrl,
} from '../../shared/validation'

const ORIGIN = 'app://rinari'
const TRUSTED = { id: 7, isMainFrame: true, url: 'app://rinari/index.html' }

describe('validateSender', () => {
  it('acepta al renderer registrado en su frame principal', () => {
    expect(validateSender(TRUSTED, 7, ORIGIN)).toEqual({ allowed: true })
  })

  it('rechaza a un webContents que no es el registrado (SEC-01)', () => {
    // Una vista remota de la misma ventana no hereda privilegios.
    expect(validateSender({ ...TRUSTED, id: 8 }, 7, ORIGIN)).toEqual({
      allowed: false,
      reason: 'unregistered',
    })
  })

  it('rechaza un iframe incrustado aunque el webContents sea el correcto', () => {
    expect(validateSender({ ...TRUSTED, isMainFrame: false }, 7, ORIGIN)).toEqual({
      allowed: false,
      reason: 'not-main-frame',
    })
  })

  it('no le vale a un origen que solo empieza igual', () => {
    // `startsWith` daría por bueno `app://rinari.evil`; la comparación es exacta.
    expect(validateSender({ ...TRUSTED, url: 'app://rinari.evil/index.html' }, 7, ORIGIN)).toEqual({
      allowed: false,
      reason: 'origin-mismatch',
    })
  })

  it('el renderer pierde la autorización al navegar fuera (SEC-03)', () => {
    expect(validateSender({ ...TRUSTED, url: 'https://ejemplo.invalido/' }, 7, ORIGIN)).toEqual({
      allowed: false,
      reason: 'origin-mismatch',
    })
    expect(validateSender({ ...TRUSTED, url: 'file:///C:/Windows/System32/' }, 7, ORIGIN)).toEqual({
      allowed: false,
      reason: 'origin-mismatch',
    })
  })

  it('una URL inanalizable no pasa por defecto', () => {
    expect(validateSender({ ...TRUSTED, url: 'about:blank' }, 7, ORIGIN).allowed).toBe(false)
    expect(validateSender({ ...TRUSTED, url: '' }, 7, ORIGIN)).toEqual({ allowed: false, reason: 'bad-url' })
  })

  it('sin registro no se atiende a nadie', () => {
    expect(validateSender(TRUSTED, null, ORIGIN)).toEqual({ allowed: false, reason: 'unregistered' })
  })

  it('el registro se revoca al cerrar la ventana', () => {
    const registry = new SenderRegistry(ORIGIN)
    registry.trust(7)
    expect(registry.check(TRUSTED).allowed).toBe(true)
    registry.revoke()
    expect(registry.check(TRUSTED).allowed).toBe(false)
  })

  it('originOf conserva el esquema propio de la app', () => {
    expect(originOf('app://rinari/index.html')).toBe('app://rinari')
    expect(originOf('https://a.b/c')).toBe('https://a.b')
    expect(originOf('no es una url')).toBeNull()
  })
})

describe('validación de la allowlist (SEC-02)', () => {
  it('acepta un comando del inventario', () => {
    expect(assertCommandName('engine_status')).toBe('engine_status')
  })

  it('rechaza un método desconocido sin devolver lo recibido', () => {
    // El valor puede ser enorme o llevar secretos: no se refleja en el error.
    expect(() => assertCommandName('rm_minus_rf')).toThrow(ValidationError)
    expect(() => assertCommandName('rm_minus_rf')).toThrow('unknown command')
    expect(() => assertCommandName(null)).toThrow(ValidationError)
    expect(() => assertCommandName(123)).toThrow(ValidationError)
  })

  it('exige que los parámetros sean un objeto acotado', () => {
    expect(assertCommandParams(undefined)).toBeUndefined()
    expect(assertCommandParams(null)).toBeUndefined()
    expect(assertCommandParams({ session_id: 'ses_a' })).toEqual({ session_id: 'ses_a' })
    expect(() => assertCommandParams([1, 2])).toThrow(/must be an object/)
    expect(() => assertCommandParams('texto')).toThrow(/must be an object/)
  })

  it('rechaza una carga desmedida en vez de pasarla al Engine', () => {
    const huge = { blob: 'a'.repeat(MAX_COMMAND_PARAMS_BYTES + 1) }
    expect(() => assertCommandParams(huge)).toThrow(/size limit/)
  })

  it('rechaza lo que no se puede serializar', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => assertCommandParams(cyclic)).toThrow(/not serializable/)
  })
})

describe('apertura de enlaces externos (SEC-03)', () => {
  it('admite http, https y mailto', () => {
    expect(assertOpenableUrl('https://ejemplo.invalido/x')).toBe('https://ejemplo.invalido/x')
    expect(assertOpenableUrl('mailto:alguien@ejemplo.invalido')).toContain('mailto:')
  })

  it('no abre javascript:, file: ni esquemas del sistema', () => {
    expect(() => assertOpenableUrl('javascript:alert(1)')).toThrow(/refusing to open/)
    expect(() => assertOpenableUrl('file:///C:/Windows/System32/cmd.exe')).toThrow(/refusing to open/)
    expect(() => assertOpenableUrl('ms-settings:privacy')).toThrow(/refusing to open/)
    expect(() => assertOpenableUrl('app://rinari/index.html')).toThrow(/refusing to open/)
  })

  it('rechaza lo que no es una URL', () => {
    expect(() => assertOpenableUrl('no es una url')).toThrow(/not valid/)
    expect(() => assertOpenableUrl(42)).toThrow(/must be a string/)
  })
})
