/**
 * Preload del renderer de confianza (documento 02 §3.1 y §6.1).
 *
 * Publica funciones estrechas por `contextBridge` y **nada más**: no se expone
 * `ipcRenderer`, ni `invoke(channel)`, ni `require`. Un canal que no esté aquí
 * no existe para la página.
 *
 * Reglas que cumplen estas funciones:
 * - Al callback de una suscripción le llega solo la carga saneada, nunca el
 *   `IpcRendererEvent`: ese objeto lleva el `sender` y abriría un camino de
 *   vuelta al main.
 * - Las bajas son idempotentes: llamarlas dos veces no es un error ni quita
 *   la suscripción de otro.
 * - Los errores del main vuelven como datos con su código de máquina y aquí
 *   se convierten en excepción, para que el código del renderer no tenga que
 *   distinguir entre un fallo del puente y uno del Engine.
 *
 * Se empaqueta a CommonJS: con `sandbox: true` el preload no admite ESM.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import {
  CHANNEL,
  PUSH,
  type BridgeResult,
  type BrowserContextView,
  type BrowserPreviewView,
  type BrowserControlView,
  type BrowserSlotLayoutRequest,
  type BrowserSlotLease,
  type ContextMenuRequest,
  type EngineStatus,
  type NotificationSupport,
  type NotificationTarget,
  type OpenExternalFileRequest,
  type OpenFilesRequest,
  type OpenRequest,
  type SystemNotificationRequest,
  type UpdateAvailable,
  type WindowState,
} from '../shared/contracts'
import type { EngineEvent as EngineEventMessage } from '../shared/protocol'

class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'BridgeError'
  }
}

/** Desenvuelve el resultado del main; un fallo conserva su código. */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as BridgeResult<T>
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new BridgeError('BRIDGE_MALFORMED', `malformed reply from ${channel}`)
  }
  if (result.ok) return result.value
  throw new BridgeError(result.error.code, result.error.message)
}

/** Suscripción que entrega solo la carga y cuya baja es idempotente. */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  let removed = false
  return () => {
    if (removed) return
    removed = true
    ipcRenderer.removeListener(channel, listener)
  }
}

/** Acciones del menú contextual: el main devuelve el id que el usuario eligió. */
const menuActions = new Map<string, () => void>()
let menuSequence = 0

ipcRenderer.on(PUSH.contextMenuAction, (_event: IpcRendererEvent, id: unknown) => {
  if (typeof id !== 'string') return
  const run = menuActions.get(id)
  menuActions.delete(id)
  run?.()
})

const api = {
  engine: {
    status: () => call<EngineStatus>(CHANNEL.engineStatus),
    start: () => call<EngineStatus>(CHANNEL.engineStart),
    shutdown: () => call<EngineStatus>(CHANNEL.engineShutdown),
    restart: () => call<EngineStatus>(CHANNEL.engineRestart),
    onEvent: (callback: (event: EngineEventMessage) => void) =>
      subscribe<EngineEventMessage>(PUSH.engineEvent, callback),
    onStatus: (callback: (status: EngineStatus) => void) => subscribe<EngineStatus>(PUSH.engineStatus, callback),
  },

  /**
   * Comando de dominio. El nombre se valida contra la allowlist **en el main**;
   * aquí no se filtra para no mantener dos listas que puedan divergir.
   */
  command: <T>(name: string, params?: Record<string, unknown>) =>
    call<T>(CHANNEL.command, name, params),

  window: {
    minimize: () => call<void>(CHANNEL.windowMinimize),
    toggleMaximize: () => call<void>(CHANNEL.windowToggleMaximize),
    requestClose: () => call<void>(CHANNEL.windowRequestClose),
    clampToWorkArea: () => call<void>(CHANNEL.windowClampToWorkArea),
    onState: (callback: (state: WindowState) => void) => subscribe<WindowState>(PUSH.windowState, callback),
  },

  dialog: {
    openFiles: (options?: OpenFilesRequest) => call<string[] | null>(CHANNEL.dialogOpenFiles, options ?? {}),
  },

  opener: {
    openUrl: (url: string) => call<void>(CHANNEL.openerOpenUrl, url),
  },

  files: {
    /** El Engine valida raíz y procedencia; el host solo abre lo que aprobó. */
    openExternal: (request: OpenExternalFileRequest) => call<void>(CHANNEL.filesOpenExternal, request),
  },

  contextMenu: {
    /**
     * Muestra el menú nativo. Las acciones propias no son serializables, así
     * que se quedan aquí indexadas por id y se ejecutan cuando el main dice
     * cuál se eligió.
     */
    show: async (
      items: Array<
        | { kind: 'role'; role: 'cut' | 'copy' | 'paste' | 'selectAll'; text: string }
        | { kind: 'action'; text: string; run: () => void }
      >,
      position: { x: number; y: number },
    ): Promise<void> => {
      const ids: string[] = []
      const wire: ContextMenuRequest['items'] = items.map((item) => {
        if (item.kind === 'role') return { kind: 'role', role: item.role, text: item.text }
        const id = `menu_${++menuSequence}`
        ids.push(id)
        menuActions.set(id, item.run)
        return { kind: 'action', text: item.text, id }
      })
      try {
        await call<void>(CHANNEL.contextMenuShow, { items: wire, x: position.x, y: position.y })
      } finally {
        // El menú se cerró: lo que no se eligió no debe quedarse vivo.
        for (const id of ids) menuActions.delete(id)
      }
    },
  },

  notifications: {
    support: () => call<NotificationSupport>(CHANNEL.notificationsSupport),
    /** `false` si no se mostró: por soporte o por deduplicación. */
    send: (notification: SystemNotificationRequest) => call<boolean>(CHANNEL.notificationsSend, notification),
    /** Clic en una notificación: solo el destino, nunca una acción. */
    onActivated: (callback: (target: NotificationTarget) => void) =>
      subscribe<NotificationTarget>(PUSH.notificationActivated, callback),
  },

  updates: {
    check: () => call<UpdateAvailable | null>(CHANNEL.updatesCheck),
    installAndRelaunch: () => call<void>(CHANNEL.updatesInstall),
  },

  handoff: {
    /** Handoff del arranque en frío; el de una segunda instancia llega por evento. */
    initial: () => call<OpenRequest>(CHANNEL.initialOpenRequest),
    onOpenRequest: (callback: (request: OpenRequest) => void) =>
      subscribe<OpenRequest>(PUSH.openRequest, callback),
  },

  menu: {
    onAction: (callback: (action: string) => void) => subscribe<string>(PUSH.menuAction, callback),
  },

  /**
   * Browser nativo (documento 03 §6.1).
   *
   * Intenciones, no primitivas. Aquí **no** hay nada de `host.browser.*`, ni
   * `debugger.sendCommand`, ni forma de nombrar un `webContentsId`: el broker
   * es de main, y una respuesta suya no es un permiso que la página pueda
   * guardar o reproducir (§5.2).
   */
  browser: {
    /** Consulta sin efectos: mirar el estado no abre un navegador. */
    context: (sessionId: string) => call<BrowserContextView>(CHANNEL.browserContext, sessionId),
    /** Creación explícita del contexto y su primera página en blanco. */
    prepare: (sessionId: string) => call<BrowserContextView>(CHANNEL.browserPrepare, sessionId),
    /** Reserva el hueco del panel. El identificador lo acuña main. */
    attachSlot: (sessionId: string) => call<BrowserSlotLease>(CHANNEL.browserAttachSlot, sessionId),
    /** Geometría del hueco. Main valida y decide dónde se pinta. */
    updateSlot: (layout: BrowserSlotLayoutRequest) => call<void>(CHANNEL.browserUpdateSlot, layout),
    /** Retira la presentación. No cierra el contexto ni cancela el turno. */
    detachSlot: (slotId: string) => call<void>(CHANNEL.browserDetachSlot, slotId),
    selectTarget: (sessionId: string, targetId: string) =>
      call<{ active_target_id: string }>(CHANNEL.browserSelectTarget, sessionId, targetId),
    setControl: (sessionId: string, owner: 'agent' | 'user', expectedRevision?: number) =>
      call<BrowserControlView>(CHANNEL.browserSetControl, sessionId, owner, expectedRevision),
    navigate: (sessionId: string, url: string) =>
      call<{ url: string }>(CHANNEL.browserNavigate, sessionId, url),
    preview: (sessionId: string) =>
      call<BrowserPreviewView | null>(CHANNEL.browserPreview, sessionId),
    /** Cambios de pestañas, control o estado, empujados por main. */
    onContextChanged: (callback: (view: BrowserContextView) => void) =>
      subscribe<BrowserContextView>(PUSH.browserContextChanged, callback),
  },

  /**
   * El host corre en modo paridad. Lo decide main por su entorno, no la
   * página: el renderer solo registra su sonda cuando esto es cierto.
   */
  parityMode: process.env.RINARI_PARITY === '1',
} as const

export type RinariDesktopApi = typeof api

contextBridge.exposeInMainWorld('rinariDesktop', api)
