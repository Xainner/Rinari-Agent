/**
 * Pestañas del navegador nativo como en un navegador de verdad (Planka
 * Ideas-2: pestañas, carga, enlaces que abren otra ventana y atajos).
 *
 * Aquí solo las decisiones, sin Electron: qué hace una página que pide otra
 * ventana. Quien la aplica es el registro. Los atajos están en
 * `shared/browserShortcuts.ts`, porque también los usa la barra.
 */

import { isNavigableUrl } from './operations'

/** Dónde va una ventana que pide la página (`window.open`, `target=_blank`). */
export type WindowOpenDecision = 'foreground' | 'background' | 'deny'

/**
 * Lo que pide la página se abre como **pestaña** del mismo contexto, nunca
 * como ventana suelta: una ventana nueva quedaría fuera del arbitraje y del
 * hueco del panel. La pestaña conserva `window.opener`, que es lo que
 * necesita un inicio de sesión en ventana emergente («Entrar con Google»).
 * Solo `http(s)` y `about:blank`, igual que cualquier otra navegación (§9).
 */
export function windowOpenDecision(details: { url: string; disposition?: string }): WindowOpenDecision {
  if (!isNavigableUrl(details.url)) return 'deny'
  return details.disposition === 'background-tab' ? 'background' : 'foreground'
}

/** Lo que la barra necesita de una pestaña y el Engine no guarda (`BrowserRegistry.targetStates`). */
export interface TargetState {
  loading: boolean
  can_go_back: boolean
  can_go_forward: boolean
}

/**
 * El contexto que contesta el Engine, con lo que solo sabe el host de cada
 * pestaña: si carga y si hay atrás y adelante. El Engine guarda las pestañas
 * con los campos seguros que enseña la UI (§5.2) y descarta los demás, así
 * que esto se añade en main, que es quien tiene las vistas.
 */
export function withTargetStates(view: unknown, states: ReadonlyMap<string, TargetState>): unknown {
  const shaped = view as { targets?: unknown } | null
  if (!shaped || typeof shaped !== 'object' || !Array.isArray(shaped.targets)) return view
  return {
    ...shaped,
    targets: shaped.targets.map((target) => {
      const id = (target as { target_id?: unknown } | null)?.target_id
      const state = typeof id === 'string' ? states.get(id) : undefined
      return state ? { ...(target as object), ...state } : target
    }),
  }
}
