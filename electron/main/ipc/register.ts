/**
 * Registro de los canales IPC del main (documento 02 §3.1 y §6.1).
 *
 * El despachador genérico vive **aquí**, no en el preload: acepta solo métodos
 * de la allowlist del inventario de paridad y valida sus argumentos en
 * ejecución. No es una puerta pública para cualquier canal o método que
 * llegue desde una página.
 *
 * Todo handler comprueba primero el emisor, y después los datos. Un fallo
 * vuelve como resultado con código, no como excepción serializada: el
 * renderer necesita el código de máquina para decidir.
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import {
  CHANNEL,
  CONTEXT_MENU_ROLES,
  type BridgeResult,
  type ContextMenuItemWire,
  type ContextMenuRequest,
  type ContextMenuRole,
  type OpenFilesRequest,
  type SystemNotificationRequest,
} from '../../shared/contracts'
import {
  ValidationError,
  assertCommandName,
  assertCommandParams,
  assertFiniteNumber,
  assertOpenableUrl,
  assertString,
} from '../../shared/validation'
import type { SenderRegistry } from './validateSender'

/** Lo que el main sabe hacer; lo aporta `index.ts` al registrar. */
export interface HostServices {
  engine: {
    status(): unknown
    start(): Promise<unknown>
    shutdown(): Promise<unknown>
    restart(): Promise<unknown>
    request(method: string, params?: Record<string, unknown>): Promise<unknown>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    requestClose(): void
    clampToWorkArea(): Promise<void>
  }
  dialog: { openFiles(options: OpenFilesRequest): Promise<string[] | null> }
  opener: { openUrl(url: string): Promise<void> }
  contextMenu: { show(request: ContextMenuRequest): Promise<void> }
  notifications: {
    support(): { canSend: boolean; canActivateTarget: boolean }
    send(notification: SystemNotificationRequest): boolean
  }
  updates: { check(): Promise<unknown>; installAndRelaunch(): Promise<void> }
  handoff: { initial(): { project: string | null; session: string | null } }
}

function failure(code: string, message: string): BridgeResult<never> {
  return { ok: false, error: { code, message } }
}

function toResult(error: unknown): BridgeResult<never> {
  if (error instanceof ValidationError) return failure(error.code, error.message)
  const code = (error as { code?: unknown })?.code
  const message = error instanceof Error ? error.message : String(error)
  return failure(typeof code === 'string' ? code : 'HOST_ERROR', message)
}

/**
 * Envuelve un handler: comprueba el emisor, ejecuta y normaliza el resultado.
 * Un mensaje de un emisor no autorizado se rechaza sin llegar al servicio.
 */
function guarded<T>(
  registry: SenderRegistry,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T,
): (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<BridgeResult<T>> {
  return async (event, ...args) => {
    const verdict = registry.check({
      id: event.sender.id,
      isMainFrame: event.senderFrame?.parent === null,
      url: event.senderFrame?.url ?? '',
    })
    if (!verdict.allowed) {
      // No se detalla qué falló: es información útil solo para quien sondea.
      console.warn(`[rinari] IPC rechazado (${verdict.reason})`)
      return failure('FORBIDDEN', 'sender is not authorized')
    }
    try {
      return { ok: true, value: await handler(event, ...args) }
    } catch (error) {
      return toResult(error)
    }
  }
}

function assertContextMenu(value: unknown): ContextMenuRequest {
  if (!value || typeof value !== 'object') throw new ValidationError('context menu request must be an object')
  const raw = value as Record<string, unknown>
  const items = raw.items
  if (!Array.isArray(items) || items.length === 0 || items.length > 40) {
    throw new ValidationError('context menu needs between 1 and 40 items')
  }
  const roles = new Set<string>(CONTEXT_MENU_ROLES)
  const parsed: ContextMenuItemWire[] = items.map((item) => {
    if (!item || typeof item !== 'object') throw new ValidationError('context menu item must be an object')
    const entry = item as Record<string, unknown>
    const text = assertString(entry.text, 'item.text', 200)
    if (entry.kind === 'role') {
      if (typeof entry.role !== 'string' || !roles.has(entry.role)) {
        throw new ValidationError('unknown context menu role')
      }
      return { kind: 'role', role: entry.role as ContextMenuRole, text }
    }
    if (entry.kind === 'action') {
      return { kind: 'action', text, id: assertString(entry.id, 'item.id', 64) }
    }
    throw new ValidationError('unknown context menu item kind')
  })
  return { items: parsed, x: assertFiniteNumber(raw.x, 'x'), y: assertFiniteNumber(raw.y, 'y') }
}

/**
 * Una notificación acotada: el cuerpo lo compone el renderer y podría llevar
 * texto del modelo, así que se recorta en vez de dejarlo crecer.
 */
function assertNotification(value: unknown): SystemNotificationRequest {
  if (!value || typeof value !== 'object') throw new ValidationError('notification must be an object')
  const raw = value as Record<string, unknown>
  const target = raw.target
  if (target !== undefined && (typeof target !== 'object' || target === null || Array.isArray(target))) {
    throw new ValidationError('notification target must be an object')
  }
  const entry = (target ?? {}) as Record<string, unknown>
  return {
    title: assertString(raw.title, 'title', 120),
    body: assertString(raw.body, 'body', 400),
    target: {
      sessionId: entry.sessionId === undefined ? undefined : assertString(entry.sessionId, 'sessionId', 128),
      turnId: entry.turnId === undefined ? undefined : assertString(entry.turnId, 'turnId', 128),
    },
  }
}

function assertOpenFiles(value: unknown): OpenFilesRequest {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('dialog options must be an object')
  }
  const raw = value as Record<string, unknown>
  for (const flag of ['multiple', 'directory'] as const) {
    if (raw[flag] !== undefined && typeof raw[flag] !== 'boolean') {
      throw new ValidationError(`${flag} must be a boolean`)
    }
  }
  return {
    multiple: raw.multiple as boolean | undefined,
    directory: raw.directory as boolean | undefined,
    title: raw.title === undefined ? undefined : assertString(raw.title, 'title', 200),
  }
}

/** Registra todos los canales. Devuelve la función que los retira. */
export function registerIpc(registry: SenderRegistry, services: HostServices): () => void {
  const handlers: Array<[string, Parameters<typeof ipcMain.handle>[1]]> = [
    [CHANNEL.engineStatus, guarded(registry, () => services.engine.status())],
    [CHANNEL.engineStart, guarded(registry, () => services.engine.start())],
    [CHANNEL.engineShutdown, guarded(registry, () => services.engine.shutdown())],
    [CHANNEL.engineRestart, guarded(registry, () => services.engine.restart())],
    [
      CHANNEL.command,
      guarded(registry, (_event, name, params) =>
        services.engine.request(assertCommandName(name), assertCommandParams(params)),
      ),
    ],
    [CHANNEL.windowMinimize, guarded(registry, () => services.window.minimize())],
    [CHANNEL.windowToggleMaximize, guarded(registry, () => services.window.toggleMaximize())],
    [CHANNEL.windowRequestClose, guarded(registry, () => services.window.requestClose())],
    [CHANNEL.windowClampToWorkArea, guarded(registry, () => services.window.clampToWorkArea())],
    [
      CHANNEL.dialogOpenFiles,
      guarded(registry, (_event, options) => services.dialog.openFiles(assertOpenFiles(options))),
    ],
    [
      CHANNEL.openerOpenUrl,
      guarded(registry, (_event, url) => services.opener.openUrl(assertOpenableUrl(url))),
    ],
    [
      CHANNEL.contextMenuShow,
      guarded(registry, (_event, request) => services.contextMenu.show(assertContextMenu(request))),
    ],
    [CHANNEL.notificationsSupport, guarded(registry, () => services.notifications.support())],
    [
      CHANNEL.notificationsSend,
      guarded(registry, (_event, request) => services.notifications.send(assertNotification(request))),
    ],
    [CHANNEL.updatesCheck, guarded(registry, () => services.updates.check())],
    [CHANNEL.updatesInstall, guarded(registry, () => services.updates.installAndRelaunch())],
    [CHANNEL.initialOpenRequest, guarded(registry, () => services.handoff.initial())],
  ]

  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler)
  return () => {
    for (const [channel] of handlers) ipcMain.removeHandler(channel)
  }
}
