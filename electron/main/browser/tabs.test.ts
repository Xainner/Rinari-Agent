import { describe, expect, it } from 'vitest'

import { windowOpenDecision, withTargetStates } from './tabs'

describe('una ventana que pide la página es una pestaña (Planka Ideas-2)', () => {
  it('un enlace con target=_blank o window.open abre una pestaña visible', () => {
    expect(windowOpenDecision({ url: 'https://example.com/', disposition: 'foreground-tab' })).toBe('foreground')
    expect(windowOpenDecision({ url: 'https://accounts.example.com/login', disposition: 'new-window' })).toBe('foreground')
    // Un inicio de sesión en ventana emergente suele abrir en blanco y navegar después.
    expect(windowOpenDecision({ url: 'about:blank', disposition: 'new-window' })).toBe('foreground')
  })

  it('Ctrl+clic la abre detrás', () => {
    expect(windowOpenDecision({ url: 'https://example.com/', disposition: 'background-tab' })).toBe('background')
  })

  it('lo que no es http(s) no se abre (§9)', () => {
    for (const url of ['file:///C:/secreto.txt', 'javascript:alert(1)', 'rinari://app/index.html', 'no es una url']) {
      expect(windowOpenDecision({ url, disposition: 'foreground-tab' })).toBe('deny')
    }
  })
})

describe('el contexto con lo que solo sabe el host', () => {
  const states = new Map([
    ['t1', { loading: true, can_go_back: false, can_go_forward: false }],
  ])

  it('añade carga e historial a cada pestaña que conoce', () => {
    const view = {
      session_id: 's1',
      targets: [
        { target_id: 't1', url: 'https://a.example/', title: 'A', active: true },
        { target_id: 't2', url: 'https://b.example/', title: 'B', active: false },
      ],
    }
    expect(withTargetStates(view, states)).toEqual({
      session_id: 's1',
      targets: [
        { target_id: 't1', url: 'https://a.example/', title: 'A', active: true, loading: true, can_go_back: false, can_go_forward: false },
        { target_id: 't2', url: 'https://b.example/', title: 'B', active: false },
      ],
    })
  })

  it('una respuesta sin pestañas pasa tal cual', () => {
    const absent = { session_id: 's1', context_state: 'absent' }
    expect(withTargetStates(absent, states)).toBe(absent)
    expect(withTargetStates(null, states)).toBeNull()
  })
})
