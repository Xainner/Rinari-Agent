// Handoff de `rinari desktop` (documento 02 §7). Port de los tests de
// `parse_open_request`, más la cola que evita sesiones paralelas.
import { describe, expect, it, vi } from 'vitest'

import { HandoffQueue, hasRequest, parseOpenRequest } from './handoff'

describe('parseOpenRequest', () => {
  it('lee proyecto y sesión por bandera', () => {
    const request = parseOpenRequest(['rinari-agent', '--project', 'C:/work/demo', '--session', 'abc123'])
    expect(request).toEqual({ project: 'C:/work/demo', session: 'abc123' })
  })

  it('acepta el proyecto como primer posicional', () => {
    expect(parseOpenRequest(['rinari-agent', 'C:/work/demo'])).toEqual({
      project: 'C:/work/demo',
      session: null,
    })
  })

  it('ignora banderas ajenas en vez de interpretarlas', () => {
    expect(parseOpenRequest(['rinari-agent', '--devtools'])).toEqual({ project: null, session: null })
    expect(parseOpenRequest(['rinari-agent', '--inspect=9229', '--session', 's1'])).toEqual({
      project: null,
      session: 's1',
    })
  })

  it('una bandera sin valor no se lleva el argumento siguiente', () => {
    expect(parseOpenRequest(['rinari-agent', '--session'])).toEqual({ project: null, session: null })
  })

  it('conserva una ruta con espacios tal como llega', () => {
    // Electron entrega el argumento ya separado; no se vuelve a partir.
    expect(parseOpenRequest(['rinari-agent', 'C:/Program Files/demo'])).toEqual({
      project: 'C:/Program Files/demo',
      session: null,
    })
  })

  it('el segundo posicional no pisa al primero', () => {
    expect(parseOpenRequest(['rinari-agent', 'uno', 'dos'])).toEqual({ project: 'uno', session: null })
  })

  it('hasRequest distingue una petición vacía', () => {
    expect(hasRequest({ project: null, session: null })).toBe(false)
    expect(hasRequest({ project: null, session: 's1' })).toBe(true)
  })
})

describe('HandoffQueue', () => {
  it('entrega una sola vez lo que llegó antes de estar listo', () => {
    const queue = new HandoffQueue()
    const deliver = vi.fn()
    queue.push({ project: 'C:/demo', session: null })
    expect(deliver).not.toHaveBeenCalled()
    queue.open(deliver)
    expect(deliver).toHaveBeenCalledExactlyOnceWith({ project: 'C:/demo', session: null })

    // Abrir de nuevo no reentrega lo ya consumido: sería una sesión duplicada.
    const second = vi.fn()
    queue.open(second)
    expect(second).not.toHaveBeenCalled()
  })

  it('con el renderer listo entrega directo', () => {
    const queue = new HandoffQueue()
    const deliver = vi.fn()
    queue.open(deliver)
    queue.push({ project: null, session: 's1' })
    expect(deliver).toHaveBeenCalledExactlyOnceWith({ project: null, session: 's1' })
  })

  it('una petición vacía no se encola ni se entrega', () => {
    const queue = new HandoffQueue()
    const deliver = vi.fn()
    queue.push({ project: null, session: null })
    queue.open(deliver)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('la última petición es la que gana mientras nadie escucha', () => {
    const queue = new HandoffQueue()
    const deliver = vi.fn()
    queue.push({ project: 'C:/primero', session: null })
    queue.push({ project: 'C:/segundo', session: null })
    queue.open(deliver)
    expect(deliver).toHaveBeenCalledExactlyOnceWith({ project: 'C:/segundo', session: null })
  })

  it('si la ventana se va, lo siguiente vuelve a encolarse', () => {
    const queue = new HandoffQueue()
    const deliver = vi.fn()
    queue.open(deliver)
    queue.close()
    queue.push({ project: 'C:/tarde', session: null })
    expect(deliver).not.toHaveBeenCalled()
    const reopened = vi.fn()
    queue.open(reopened)
    expect(reopened).toHaveBeenCalledExactlyOnceWith({ project: 'C:/tarde', session: null })
  })
})
