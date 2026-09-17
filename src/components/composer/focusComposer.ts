/**
 * Petición de foco al Composer. Con `detail.sessionId` llega a la instancia de
 * esa sesión (Normal o panel) aunque no sea la que acepta foco global; sin
 * detalle, a la instancia que lo acepte (compatibilidad con atajos antiguos).
 */
export const FOCUS_COMPOSER_EVENT = 'rinari:focus-composer'

export function requestComposerFocus(sessionId?: string): void {
  window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT, sessionId ? { detail: { sessionId } } : undefined))
}
