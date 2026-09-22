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
import type { MigrationStatus } from '../../electron/shared/migration'

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
export type { MigrationState, MigrationStatus } from '../../electron/shared/migration'

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
  unsigned: boolean
}

export interface UpdateProgress {
  percent: number
  bytes_per_second: number
  transferred: number
  total: number
}

export interface UpdateState {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'applying' | 'error'
  current_version: string
  available_version: string | null
  progress: UpdateProgress | null
  message: string | null
  unsigned: boolean
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

  /**
   * Browser nativo del dock (documento 03 §6.1).
   *
   * Intenciones, no primitivas: React reserva el hueco y pide transiciones;
   * dónde se pinta una superficie nativa, qué método CDP la mueve y qué
   * `webContents` la sostiene son de main y no cruzan.
   *
   * Un host sin browser nativo lo dice —`supported: false`— en vez de fingir
   * soporte: la superficie cae al visor de capturas y se rotula como tal.
   */
  browser: {
    /** Consulta sin efectos. Mirar el estado no abre un navegador. */
    context(sessionId: string): Promise<NativeBrowserContext>
    /** Creación explícita del contexto y su página en blanco. */
    prepare(sessionId: string): Promise<NativeBrowserContext>
    /** Reserva el hueco del panel; el identificador lo acuña el host. */
    attachSlot(sessionId: string): Promise<{ slotId: string }>
    /** Geometría del hueco. El host valida y decide. */
    updateSlot(layout: NativeBrowserSlotLayout): Promise<void>
    /** Retira la presentación. No cierra nada ni cancela el turno. */
    detachSlot(slotId: string): Promise<void>
    /** Pestaña visible; también es la que opera sin target explícito. */
    selectTarget(sessionId: string, targetId: string): Promise<void>
    /** Tomar o devolver el control. La confirmación puede llegar después. */
    setControl(
      sessionId: string,
      owner: 'agent' | 'user',
      expectedRevision?: number,
    ): Promise<NativeBrowserControl>
    /** Navegación pedida por el usuario desde la toolbar. */
    navigate(sessionId: string, url: string): Promise<void>
    /** Captura del mismo target mientras la superficie física está retirada. */
    preview(sessionId: string): Promise<NativeBrowserPreview | null>
    /** Cambios de pestañas, control o estado. Sin sondeo. */
    onContextChanged(
      callback: (view: NativeBrowserContext) => void,
    ): Promise<Unsubscribe>
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
    /** Descarga y valida el SHA-512; no interrumpe el trabajo activo. */
    download(): Promise<UpdateState>
    /** Pide confirmación, cierra el Engine y aplica lo ya descargado. */
    apply(): Promise<void>
    onState(callback: (state: UpdateState) => void): Promise<Unsubscribe>
  }

  migration: {
    status(): Promise<MigrationStatus>
    /** Importa y verifica antes de inicializar los stores del renderer. */
    importPending(): Promise<MigrationStatus>
    retry(): Promise<MigrationStatus>
  }

  /**
   * `false` en un navegador sin host (dev con `vite` a secas, tests). Los
   * consumidores lo usan para no ofrecer lo que no existe, nunca para
   * simular un Engine conectado (documento 02 §3.2).
   */
  isDesktop(): boolean
}

// -- browser nativo (documento 03 §6.1) --------------------------------------

/** Una pestaña del contexto, tal como la ve la UI. */
export interface NativeBrowserTarget {
  target_id: string
  url: string
  title: string
  active: boolean
}

/**
 * Lo que la UI sabe del browser de una sesión.
 *
 * Los tres primeros campos son distintos a propósito: el protocolo puede
 * soportarlo, el host puede estar registrado, y aun así no haber contexto
 * listo (§5.2). Enseñar «nativo» antes de tiempo es prometer una superficie
 * que todavía no puede mostrar nada.
 */
export interface NativeBrowserContext {
  session_id: string
  supported: boolean
  host_registered: boolean
  context_state: 'absent' | 'creating' | 'ready' | 'disconnected' | 'disposed'
  available: boolean
  backend: string | null
  control?: 'agent' | 'user'
  control_state?: 'agent' | 'taking-user-control' | 'user' | 'uncertain'
  control_revision?: number
  active_target_id?: string | null
  targets?: NativeBrowserTarget[]
}

export interface NativeBrowserControl {
  control: 'agent' | 'user'
  control_state: string
  control_revision: number
}

export interface NativeBrowserPreview {
  target_id: string
  url: string
  image: string
  width: number
  height: number
}

/**
 * Geometría del hueco reservado.
 *
 * `logicalBounds` es dónde estaría el panel entero y `visibleBounds` lo que se
 * ve. Hacen falta los dos: con uno solo no se puede representar un scroll que
 * recorta por la izquierda, y reducir el ancho desde el origen enseñaría otra
 * vez el principio de la página (§8.2).
 */
export interface NativeBrowserSlotLayout {
  slotId: string
  logicalBounds: { x: number; y: number; width: number; height: number }
  visibleBounds: { x: number; y: number; width: number; height: number }
  shown: boolean
  layoutRevision: number
  /** Overlays encima ahora mismo; >0 esconde la superficie nativa (§8.3). */
  overlayDepth: number
  /** Regiones DOM temporales que una vista nativa no puede tapar. */
  occlusions?: Array<{ x: number; y: number; width: number; height: number }>
}
