// SEC-PUSH-01..03: el PUSH solo llega al renderer de confianza.
import { describe, expect, it } from 'vitest'

import { canPush } from './pushGuard'
import { originOf } from './validateSender'

const TRUSTED = 'app://rinari'

describe('puerta de salida del PUSH', () => {
  it('SEC-PUSH-01 — el origen de confianza recibe', () => {
    expect(canPush({ url: 'app://rinari/index.html', destroyed: false }, TRUSTED, originOf)).toBe(true)
  })

  it('SEC-PUSH-02 — otro origen no recibe', () => {
    // Aunque sea la misma ventana: lo que manda es el contenido cargado.
    expect(canPush({ url: 'https://ejemplo.invalido/', destroyed: false }, TRUSTED, originOf)).toBe(false)
    expect(canPush({ url: 'file:///C:/Windows/', destroyed: false }, TRUSTED, originOf)).toBe(false)
    // `startsWith` daría por bueno este; la comparación es exacta.
    expect(canPush({ url: 'app://rinari.evil/x', destroyed: false }, TRUSTED, originOf)).toBe(false)
  })

  it('SEC-PUSH-03 — al volver al origen de confianza vuelve a recibir', () => {
    const fuera = { url: 'https://ejemplo.invalido/', destroyed: false }
    expect(canPush(fuera, TRUSTED, originOf)).toBe(false)
    expect(canPush({ url: 'app://rinari/index.html', destroyed: false }, TRUSTED, originOf)).toBe(true)
  })

  it('una ventana destruida o ausente no recibe nada', () => {
    expect(canPush(null, TRUSTED, originOf)).toBe(false)
    expect(canPush({ url: 'app://rinari/index.html', destroyed: true }, TRUSTED, originOf)).toBe(false)
  })

  it('en desarrollo el origen de confianza es el del dev server', () => {
    const dev = 'http://localhost:1420'
    expect(canPush({ url: `${dev}/index.html`, destroyed: false }, dev, originOf)).toBe(true)
    expect(canPush({ url: 'app://rinari/index.html', destroyed: false }, dev, originOf)).toBe(false)
  })
})
