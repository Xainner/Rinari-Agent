/**
 * Autoridad única de salida (documento 02 §4.3).
 *
 * Había dos rutas: cerrar la ventana preguntaba y **después** detenía el
 * Engine, mientras que `Cmd+Q`, el menú Salir y `app.quit()` pasaban por
 * `before-quit`, que lo detenía **antes** de preguntar. Cancelar dejaba la
 * ventana abierta con el Engine ya parado y el turno interrumpido.
 *
 * Aquí la regla es una sola: se pregunta antes de detener nada, y todas las
 * vías de salida entran por el mismo sitio. Sin dependencias de Electron, para
 * poder probar los invariantes sin abrir una ventana.
 */

export type QuitState = 'idle' | 'confirming' | 'shutting-down' | 'committed'

/** Por dónde entró la petición; solo para diagnóstico. */
export type QuitReason = 'window-close' | 'app' | 'menu' | 'window-all-closed' | 'update' | 'parity'

/**
 * Solo pregunta aplicar una actualización con el Engine en marcha: es un
 * reinicio que no se pidió cerrando. Cerrar la ventana, Salir o Alt+F4 ya son
 * la decisión de salir, así que no preguntan; el Engine se detiene igual de
 * forma coordinada.
 */
export function confirmsQuit(reason: QuitReason, engineRunning: boolean): boolean {
  return reason === 'update' && engineRunning
}

export interface QuitDeps {
  /** ¿Hay que preguntar antes de salir por `reason`? Ver `confirmsQuit`. */
  shouldConfirm(reason: QuitReason): boolean
  /** `true` si el usuario confirma. Solo se llama si `shouldConfirm()`. */
  confirm(reason: QuitReason): Promise<boolean>
  /** Cierre coordinado del Engine. Se espera antes del cierre final. */
  shutdown(): Promise<void>
  /** Todo cerrado: retirar IPC y terminar. Se llama una sola vez. */
  commit(reason: QuitReason): void
  /** Un cierre que falló; se registra y el coordinador vuelve a ser usable. */
  onShutdownError?(error: unknown, reason: QuitReason): void
}

export class QuitCoordinator {
  private state: QuitState = 'idle'
  /** La petición en curso; las simultáneas comparten su resultado. */
  private inFlight: Promise<boolean> | null = null

  constructor(private readonly deps: QuitDeps) {}

  get current(): QuitState {
    return this.state
  }

  /**
   * Una salida ya confirmada no vuelve a preguntar: los manejadores de
   * ventana y de `before-quit` la consultan para dejar pasar el cierre en vez
   * de volver a entrar y hacer un bucle.
   */
  isCommitted(): boolean {
    return this.state === 'committed'
  }

  /**
   * Pide salir. Devuelve `true` si la aplicación va a cerrarse.
   *
   * Dos peticiones a la vez comparten la misma promesa: una sola pregunta y
   * un solo `shutdown`, venga de donde venga.
   */
  requestQuit(reason: QuitReason): Promise<boolean> {
    if (this.state === 'committed') return Promise.resolve(true)
    if (this.inFlight) return this.inFlight

    const run = async (): Promise<boolean> => {
      if (this.deps.shouldConfirm(reason)) {
        this.state = 'confirming'
        const confirmed = await this.deps.confirm(reason)
        if (!confirmed) {
          // Cancelar no toca el Engine. Es el invariante de esta clase.
          this.state = 'idle'
          return false
        }
      }

      this.state = 'shutting-down'
      try {
        await this.deps.shutdown()
      } catch (error) {
        // No se marca `committed` ni se fuerza la salida: se informa y el
        // coordinador queda utilizable para reintentar.
        this.deps.onShutdownError?.(error, reason)
        this.state = 'idle'
        return false
      }

      this.state = 'committed'
      this.deps.commit(reason)
      return true
    }

    this.inFlight = run().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  /**
   * Cierre sin diálogo, para procesos que terminan solos (la sonda de
   * paridad). Detiene el Engine igual: terminar el host no basta para que su
   * hijo muera.
   */
  async shutdownWithoutPrompt(reason: QuitReason = 'parity'): Promise<boolean> {
    if (this.state === 'committed') return true
    this.state = 'shutting-down'
    try {
      await this.deps.shutdown()
    } catch (error) {
      this.deps.onShutdownError?.(error, reason)
      this.state = 'idle'
      return false
    }
    this.state = 'committed'
    return true
  }
}
