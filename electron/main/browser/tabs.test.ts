import { describe, expect, it } from 'vitest'

import { MAX_TABS, OWNER_GESTURE_MS, openedTabPlacement, windowOpenDecision, withTargetStates } from './tabs'

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

describe('la pestaña que abre una página no le quita la activa al agente (revisión del #120)', () => {
  const base = { decision: 'foreground' as const, ownerControls: false, ownerUsedAt: 0, now: 100_000, openTabs: 2 }

  it('al frente solo si fue el dueño: tiene el navegador o acaba de usar la página', () => {
    expect(openedTabPlacement({ ...base, ownerControls: true })).toBe('foreground')
    expect(openedTabPlacement({ ...base, ownerUsedAt: 100_000 - 2_000 })).toBe('foreground')
  })

  it('una página que abre ventanas sola, o el agente con un clic, la deja detrás', () => {
    expect(openedTabPlacement(base)).toBe('background')
    expect(openedTabPlacement({ ...base, ownerUsedAt: 100_000 - OWNER_GESTURE_MS - 1 })).toBe('background')
  })

  it('Ctrl+clic sigue detrás y lo denegado sigue denegado', () => {
    expect(openedTabPlacement({ ...base, decision: 'background', ownerControls: true })).toBe('background')
    expect(openedTabPlacement({ ...base, decision: 'deny', ownerControls: true })).toBe('deny')
  })

  it('con el tope de pestañas no se abre ninguna más', () => {
    expect(openedTabPlacement({ ...base, ownerControls: true, openTabs: MAX_TABS })).toBe('deny')
    expect(openedTabPlacement({ ...base, ownerControls: true, openTabs: MAX_TABS - 1 })).toBe('foreground')
  })
})
