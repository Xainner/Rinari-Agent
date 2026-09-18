/**
 * Puerta de salida hacia el renderer (documento 02 §6.1, defensa en capas).
 *
 * El IPC entrante ya valida webContents, frame y origen exacto. El PUSH iba
 * por `webContents.send()` sin comprobar nada: si una regresión futura cargara
 * contenido no confiable en la ventana principal, seguiría recibiendo eventos
 * del Engine, estados, handoffs y destinos de notificación —aunque ya no
 * pudiera invocar IPC privilegiado—.
 *
 * Esto vale solo para el renderer principal. El contenido remoto del browser
 * del agente vive en otra superficie con su propia política (documento 03).
 */

export interface PushTarget {
  /** URL que la ventana tiene cargada ahora mismo. */
  url: string
  destroyed: boolean
}

/** ¿Se puede entregar a esta ventana? */
export function canPush(
  target: PushTarget | null,
  trustedOrigin: string,
  originOf: (url: string) => string | null,
): boolean {
  if (!target || target.destroyed) return false
  return originOf(target.url) === trustedOrigin
}
