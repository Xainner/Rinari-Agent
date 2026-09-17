/**
 * Quién puede hablar con el main (documento 02 §6.1).
 *
 * La autorización es del **contenido**, no de la ventana: una vista web remota
 * dentro de la misma ventana no hereda privilegios, y el renderer de confianza
 * los pierde en cuanto navega fuera de su origen. La comprobación es de
 * igualdad exacta sobre el origen, nunca un `startsWith`: `app://rinari.evil`
 * empieza por `app://rinari` y no es lo mismo.
 *
 * Esta lógica se escribe como función pura sobre hechos del emisor para poder
 * probarla sin levantar Electron; el registro vive en `SenderRegistry`.
 */

export interface SenderFacts {
  /** `webContents.id` del emisor. */
  id: number
  /** El mensaje viene del frame principal, no de un iframe incrustado. */
  isMainFrame: boolean
  /** URL del frame emisor en el momento del mensaje. */
  url: string
}

export type SenderVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'unregistered' | 'not-main-frame' | 'origin-mismatch' | 'bad-url' }

/** Origen de un URL, o `null` si no es analizable (`about:blank`, vacío…). */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    // `URL.origin` da "null" para esquemas no especiales; se usa el par
    // esquema+host, que es lo que identifica al renderer de confianza.
    return parsed.origin === 'null' ? `${parsed.protocol}//${parsed.host}` : parsed.origin
  } catch {
    return null
  }
}

/**
 * Decide si un mensaje IPC puede atenderse.
 *
 * `registeredId` es el webContents que el main creó para la UI de confianza y
 * `expectedOrigin` el origen con el que lo cargó. Ambos deben coincidir: el id
 * impide que otra vista suplante al renderer, y el origen impide que el propio
 * renderer conserve privilegios tras navegar a otro sitio.
 */
export function validateSender(
  sender: SenderFacts,
  registeredId: number | null,
  expectedOrigin: string,
): SenderVerdict {
  if (registeredId === null || sender.id !== registeredId) return { allowed: false, reason: 'unregistered' }
  if (!sender.isMainFrame) return { allowed: false, reason: 'not-main-frame' }
  const origin = originOf(sender.url)
  if (origin === null) return { allowed: false, reason: 'bad-url' }
  if (origin !== expectedOrigin) return { allowed: false, reason: 'origin-mismatch' }
  return { allowed: true }
}

/**
 * Registro del renderer de confianza. Solo el main lo puebla, al crear la
 * ventana; nada que venga de una página puede cambiarlo.
 */
export class SenderRegistry {
  private trustedId: number | null = null

  constructor(readonly expectedOrigin: string) {}

  /** Marca el webContents de la UI de confianza. */
  trust(id: number): void {
    this.trustedId = id
  }

  /** La ventana se cerró o el contenido dejó de ser de confianza. */
  revoke(): void {
    this.trustedId = null
  }

  check(sender: SenderFacts): SenderVerdict {
    return validateSender(sender, this.trustedId, this.expectedOrigin)
  }
}
