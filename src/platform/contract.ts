/**
 * Contrato de plataforma del renderer (documento 02 §3.1).
 *
 * Todo lo que el frontend necesita del host vive aquí, tipado y estrecho. Los
 * componentes y servicios consumen este contrato, nunca `@tauri-apps/*` ni,
 * más adelante, `ipcRenderer`: por eso el cambio de host (entrega D) es
 * cambiar de implementación, no reescribir React.
 *
 * Dos reglas del documento 02 que explican la forma de este archivo:
 *
 * 1. **No se expone `invoke(channel: string)`.** `command()` acepta solo los
 *    nombres del inventario de paridad (`DesktopCommand`, generado). En
 *    tiempo de ejecución TypeScript no valida nada; la allowlist efectiva y
 *    sus validadores son trabajo del main de Electron en la entrega D.
 * 2. **Se expone la intención, no la primitiva del host.** `window` ofrece
 *    `clampToWorkArea()` y no `PhysicalSize`/`currentMonitor`, porque la API
 *    equivalente de Electron tiene otra forma y filtrarla aquí obligaría a
 *    reescribir los consumidores otra vez.
 */

import type { EngineBackedCommand } from './commands.generated'
import type { EngineStatus } from './engineStatus'

export type {
  DesktopCommand,
  EngineBackedCommand,
  HostOnlyCommand,
} from './commands.generated'
export {
  DESKTOP_COMMANDS,
  ENGINE_BACKED_COMMANDS,
  HOST_ONLY_COMMANDS,
} from './commands.generated'
export type { EngineStatus, EngineState } from './engineStatus'

/** Cancela una suscripción. Idempotente: llamarla dos veces no es un error. */
export type Unsubscribe = () => void

/** Evento asíncrono del Engine. Llega por un solo canal, no uno por panel. */
export interface EngineEventMessage {
  type: string
  event: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
}

/** Handoff de `rinari desktop [ruta] [--session id]`. */
export interface OpenRequest {
  project: string | null
  session: string | null
}

export interface UpdateAvailable {
  version: string
  body?: string
}

/** Un elemento del menú contextual nativo. */
export type ContextMenuItem =
  /** Operación de edición que el sistema implementa (portapapeles, selección). */
  | { kind: 'role'; role: 'cut' | 'copy' | 'paste' | 'selectAll'; text: string }
  /** Acción propia de Rinari; `run` se ejecuta en el renderer. */
  | { kind: 'action'; text: string; run: () => void }

export interface NotificationSupport {
  canSend: boolean
  /** Un clic puede llevar a un destino concreto. */
  canActivateTarget: boolean
}

export interface NotificationTarget {
  sessionId?: string
  turnId?: string
}

export interface SystemNotification {
  title: string
  body: string
  /** Qué abrir al pulsarla. Es una referencia, no una acción. */
  target?: NotificationTarget
}

export interface OpenFilesOptions {
  multiple?: boolean
  directory?: boolean
  title?: string
}

export interface DesktopBridge {
  /**
   * Llamada al Engine. Solo acepta comandos **respaldados por el protocolo**:
   * el ciclo de vida del proceso y el handoff no son métodos del Engine y
   * tienen su propia sección, porque tratarlos como si lo fueran es
   * exactamente lo que rompía el host nuevo.
   */
  command<T>(name: EngineBackedCommand, args?: Record<string, unknown>): Promise<T>

  /**
   * Ciclo de vida del proceso del Engine. Es del host: no viaja por el
   * protocolo, y cada implementación lo resuelve con su propia maquinaria.
   */
  engine: {
    status(): Promise<EngineStatus>
    start(): Promise<EngineStatus>
    shutdown(): Promise<EngineStatus>
    restart(): Promise<EngineStatus>
  }

  handoff: {
    /** `rinari desktop [ruta] [--session id]` del arranque en frío. */
    initial(): Promise<OpenRequest>
  }

  files: {
    /**
     * Abre un archivo del workspace con la aplicación del sistema. La ruta la
     * valida el Engine (raíz y procedencia del turno) **antes** de abrirla:
     * no se abre lo que diga el renderer sin pasar por ahí.
     */
    openExternal(input: { session_id: string; path: string; turn_id?: string }): Promise<void>
  }

  events: {
    /** Todos los eventos del Engine, por un único canal. */
    onEngineEvent(callback: (event: EngineEventMessage) => void): Promise<Unsubscribe>
    /** Acción del menú nativo, por id. */
    onMenuAction(callback: (action: string) => void): Promise<Unsubscribe>
    /** Una segunda instancia entregó un proyecto/sesión. */
    onOpenRequest(callback: (request: OpenRequest) => void): Promise<Unsubscribe>
  }

  window: {
    /**
     * Encaja la ventana dentro del área de trabajo del monitor actual si
     * quedó más grande o fuera de él. No hace nada si está maximizada.
     * Es una intención, no una secuencia de primitivas del host.
     */
    clampToWorkArea(): Promise<void>
  }

  dialog: {
    /** Selección explícita del usuario. Devuelve `null` si cancela. */
    openFiles(options?: OpenFilesOptions): Promise<string[] | null>
  }

  opener: {
    /** Abre una URL en el navegador del sistema, fuera de la app. */
    openUrl(url: string): Promise<void>
  }

  contextMenu: {
    /** Muestra el menú nativo en coordenadas lógicas del renderer. */
    show(items: ContextMenuItem[], position: { x: number; y: number }): Promise<void>
  }

  notifications: {
    /**
     * Lo que el host puede hacer de verdad. Un permiso ausente se reporta
     * como no disponible, nunca como éxito simulado (documento 02 §7).
     */
    support(): Promise<NotificationSupport>
    /** `false` si no se mostró: por soporte o por deduplicación. */
    send(notification: SystemNotification): Promise<boolean>
    /** Clic del usuario: el renderer resuelve el destino y no envía nada. */
    onActivated(callback: (target: NotificationTarget) => void): Promise<Unsubscribe>
  }

  updates: {
    /** `null` si no hay actualización. Lanza si el canal no está disponible. */
    check(): Promise<UpdateAvailable | null>
    /** Descarga, instala y reinicia. */
    installAndRelaunch(): Promise<void>
  }

  /**
   * `false` en un navegador sin host (dev con `vite` a secas, tests). Los
   * consumidores lo usan para no ofrecer lo que no existe, nunca para
   * simular un Engine conectado (documento 02 §3.2).
   */
  isDesktop(): boolean
}
