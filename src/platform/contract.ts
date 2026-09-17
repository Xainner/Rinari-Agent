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

import type { DesktopCommand } from './commands.generated'

export type { DesktopCommand } from './commands.generated'
export { DESKTOP_COMMANDS } from './commands.generated'

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

export interface OpenFilesOptions {
  multiple?: boolean
  directory?: boolean
  title?: string
}

export interface DesktopBridge {
  /**
   * Comando de dominio del host. La lista es cerrada y sale del inventario de
   * paridad; los argumentos viajan con el mismo contrato de nombres que el
   * host declara (`rename_all`), así que no se renombran aquí.
   */
  command<T>(name: DesktopCommand, args?: Record<string, unknown>): Promise<T>

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
