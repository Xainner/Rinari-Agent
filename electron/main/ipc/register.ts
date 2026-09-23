/**
 * Registro de los canales IPC del main (documento 02 §3.1 y §6.1).
 *
 * El despachador genérico vive **aquí**, no en el preload: acepta solo
 * comandos del inventario vigente (AGENTS.md, «Comandos e intenciones») y
 * valida sus argumentos en ejecución. No es una puerta pública para cualquier canal o método que
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
  type BrowserSlotLayoutRequest,
  type BrowserSlotLease,
  type OpenExternalFileRequest,
  type OpenFilesRequest,
  type SystemNotificationRequest,
  type FlowScopeRequest,
} from '../../shared/contracts'
import {
  ValidationError,
  assertClipboardText,
  assertCommandName,
  assertCommandParams,
  assertFiniteNumber,
  assertFlowScope,
  assertOpenableUrl,
  assertString,
} from '../../shared/validation'
import type { SenderRegistry } from './validateSender'
import {
  MIGRATION_ALLOWED_KEYS,
  MIGRATION_MAX_ENTRIES,
  MIGRATION_MAX_TOTAL_BYTES,
  MIGRATION_MAX_VALUE_BYTES,
} from '../../shared/migration'

const MIGRATION_KEYS = new Set<string>(MIGRATION_ALLOWED_KEYS)

function assertMigrationPreferences(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('preferences must be an object')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > MIGRATION_MAX_ENTRIES) throw new ValidationError('too many preference entries')
  let total = 0
  const result: Record<string, string> = Object.create(null) as Record<string, string>
  for (const [key, raw] of entries) {
    if (!MIGRATION_KEYS.has(key)) throw new ValidationError(`preference key is not allowed: ${key}`)
    if (typeof raw !== 'string') throw new ValidationError(`preference value must be text: ${key}`)
    const bytes = Buffer.byteLength(raw, 'utf8')
    if (bytes > MIGRATION_MAX_VALUE_BYTES) throw new ValidationError(`preference value is too large: ${key}`)
    total += bytes + Buffer.byteLength(key, 'utf8')
    if (total > MIGRATION_MAX_TOTAL_BYTES) throw new ValidationError('preference export is too large')
    result[key] = raw
  }
  return result
}

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
  files: { openExternal(request: OpenExternalFileRequest): Promise<void> }
  clipboard: { writeText(text: string): void | Promise<void> }
  contextMenu: { show(request: ContextMenuRequest): Promise<void> }
  notifications: {
    support(): { canSend: boolean; canActivateTarget: boolean }
    send(notification: SystemNotificationRequest): boolean
  }
  updates: {
    check(): Promise<unknown>
    download(): Promise<unknown>
    apply(): Promise<void>
  }
  migration: {
    status(): Promise<unknown>
    stage(): Promise<unknown>
    commit(token: string, preferences: Record<string, string>): Promise<unknown>
    verify(token: string): Promise<unknown>
    fail(token: string | undefined, message: string): Promise<unknown>
    retry(): Promise<unknown>
  }
  handoff: { initial(): { project: string | null; session: string | null } }
  /** Flujos de un proyecto o de una sesión (`project_flow_v1`). */
  flow: { get(scope: FlowScopeRequest): Promise<unknown> }
  /**
   * Browser nativo (documento 03 §6.1). Intenciones, no primitivas: el
   * renderer no nombra una ventana, un `webContentsId` ni un método CDP.
   */
  browser: {
    context(sessionId: string): Promise<unknown>
    prepare(sessionId: string): Promise<unknown>
    attachSlot(sessionId: string): Promise<BrowserSlotLease>
    updateSlot(request: BrowserSlotLayoutRequest): Promise<void>
    detachSlot(slotId: string): Promise<void>
    selectTarget(sessionId: string, targetId: string): Promise<unknown>
    setControl(sessionId: string, owner: 'agent' | 'user', expectedRevision?: number): Promise<unknown>
    navigate(sessionId: string, url: string): Promise<unknown>
    preview(sessionId: string): Promise<unknown>
    diagnostics(): { layoutSlots: number }
  }
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

/** La ruta no se valida aquí: la valida el Engine antes de abrirla. */
function assertOpenExternal(value: unknown): OpenExternalFileRequest {
  if (!value || typeof value !== 'object') throw new ValidationError('request must be an object')
  const raw = value as Record<string, unknown>
  return {
    session_id: assertString(raw.session_id, 'session_id', 128),
    path: assertString(raw.path, 'path', 4096),
    turn_id: raw.turn_id === undefined || raw.turn_id === null ? undefined : assertString(raw.turn_id, 'turn_id', 128),
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

function assertRect(value: unknown, field: string): {
  x: number
  y: number
  width: number
  height: number
} {
  if (!value || typeof value !== 'object') throw new ValidationError(`${field} must be an object`)
  const raw = value as Record<string, unknown>
  return {
    x: assertFiniteNumber(raw.x, `${field}.x`),
    y: assertFiniteNumber(raw.y, `${field}.y`),
    width: assertFiniteNumber(raw.width, `${field}.width`),
    height: assertFiniteNumber(raw.height, `${field}.height`),
  }
}

/**
 * Geometría del slot. Se valida aquí **y** en el coordinador: este extremo
 * comprueba la forma, y aquel las reglas de admisión —revisión creciente,
 * dentro de la ventana—. Ninguno confía en que el otro lo haya hecho.
 */
function assertSlotLayout(value: unknown): BrowserSlotLayoutRequest {
  if (!value || typeof value !== 'object') throw new ValidationError('layout must be an object')
  const raw = value as Record<string, unknown>
  const revision = assertFiniteNumber(raw.layout_revision, 'layout_revision')
  const depth = assertFiniteNumber(raw.overlay_depth, 'overlay_depth')
  if (!Number.isInteger(revision) || revision < 0) {
    throw new ValidationError('layout_revision must be a non-negative integer')
  }
  if (!Number.isInteger(depth) || depth < 0) {
    throw new ValidationError('overlay_depth must be a non-negative integer')
  }
  if (typeof raw.shown !== 'boolean') throw new ValidationError('shown must be a boolean')
  const occlusions = raw.occlusions
  if (occlusions !== undefined && (!Array.isArray(occlusions) || occlusions.length > 6)) {
    throw new ValidationError('occlusions must be an array of at most 6 rectangles')
  }
  const parsedOcclusions = Array.isArray(occlusions)
    ? occlusions.map((rect, index) => assertRect(rect, `occlusions[${index}]`))
    : undefined
  if (parsedOcclusions?.some((rect) => rect.width <= 0 || rect.height <= 0)) {
    throw new ValidationError('occlusions must have positive area')
  }
  return {
    slot_id: assertString(raw.slot_id, 'slot_id', 128),
    logical_bounds: assertRect(raw.logical_bounds, 'logical_bounds'),
    visible_bounds: assertRect(raw.visible_bounds, 'visible_bounds'),
    shown: raw.shown,
    layout_revision: revision,
    overlay_depth: depth,
    occlusions: parsedOcclusions,
  }
}

function assertControlOwner(value: unknown): 'agent' | 'user' {
  if (value !== 'agent' && value !== 'user') {
    throw new ValidationError('owner must be "agent" or "user"')
  }
  return value
}

function assertExpectedRevision(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  // `true` es un número en muchas comprobaciones laxas; aquí no.
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ValidationError('expected_revision must be a non-negative integer')
  }
  return value
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
      CHANNEL.filesOpenExternal,
      guarded(registry, (_event, request) => services.files.openExternal(assertOpenExternal(request))),
    ],
    [
      CHANNEL.clipboardWriteText,
      guarded(registry, (_event, value) => services.clipboard.writeText(assertClipboardText(value))),
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
    [CHANNEL.updatesDownload, guarded(registry, () => services.updates.download())],
    [CHANNEL.updatesApply, guarded(registry, () => services.updates.apply())],
    [CHANNEL.migrationStatus, guarded(registry, () => services.migration.status())],
    [CHANNEL.migrationStage, guarded(registry, () => services.migration.stage())],
    [
      CHANNEL.migrationCommit,
      guarded(registry, (_event, token, preferences) =>
        services.migration.commit(
          assertString(token, 'token', 128),
          assertMigrationPreferences(preferences),
        ),
      ),
    ],
    [
      CHANNEL.migrationVerify,
      guarded(registry, (_event, token) => services.migration.verify(assertString(token, 'token', 128))),
    ],
    [
      CHANNEL.migrationFail,
      guarded(registry, (_event, token, message) =>
        services.migration.fail(
          token === undefined ? undefined : assertString(token, 'token', 128),
          assertString(message, 'message', 2_000),
        ),
      ),
    ],
    [CHANNEL.migrationRetry, guarded(registry, () => services.migration.retry())],
    [CHANNEL.initialOpenRequest, guarded(registry, () => services.handoff.initial())],

    // Flujos. El renderer nombra un alcance, no un método del Engine: si
    // pudiera nombrarlo, `command()` volvería a ser un `invoke` con otro
    // nombre. Los ids se validan aquí, no se confía en el tipo de TypeScript.
    [
      CHANNEL.flowGet,
      guarded(registry, (_event, scope) => services.flow.get(assertFlowScope(scope))),
    ],

    // Browser nativo. Cada canal lleva una intención y nada más: no hay
    // passthrough de métodos, ni de canales, ni de identificadores del host.
    [
      CHANNEL.browserContext,
      guarded(registry, (_event, sessionId) =>
        services.browser.context(assertString(sessionId, 'session_id', 128)),
      ),
    ],
    [
      CHANNEL.browserPrepare,
      guarded(registry, (_event, sessionId) =>
        services.browser.prepare(assertString(sessionId, 'session_id', 128)),
      ),
    ],
    [
      CHANNEL.browserAttachSlot,
      guarded(registry, (_event, sessionId) =>
        services.browser.attachSlot(assertString(sessionId, 'session_id', 128)),
      ),
    ],
    [
      CHANNEL.browserUpdateSlot,
      guarded(registry, (_event, layout) => services.browser.updateSlot(assertSlotLayout(layout))),
    ],
    [
      CHANNEL.browserDetachSlot,
      guarded(registry, (_event, slotId) =>
        services.browser.detachSlot(assertString(slotId, 'slot_id', 128)),
      ),
    ],
    [
      CHANNEL.browserSelectTarget,
      guarded(registry, (_event, sessionId, targetId) =>
        services.browser.selectTarget(
          assertString(sessionId, 'session_id', 128),
          assertString(targetId, 'target_id', 256),
        ),
      ),
    ],
    [
      CHANNEL.browserSetControl,
      guarded(registry, (_event, sessionId, owner, expectedRevision) =>
        services.browser.setControl(
          assertString(sessionId, 'session_id', 128),
          assertControlOwner(owner),
          assertExpectedRevision(expectedRevision),
        ),
      ),
    ],
    [
      CHANNEL.browserNavigate,
      guarded(registry, (_event, sessionId, url) =>
        services.browser.navigate(
          assertString(sessionId, 'session_id', 128),
          // Mismo filtro de esquemas que la toolbar necesita; a dónde se puede
          // navegar lo sigue decidiendo la policy de red del Engine.
          assertOpenableUrl(url),
        ),
      ),
    ],
    [
      CHANNEL.browserPreview,
      guarded(registry, (_event, sessionId) =>
        services.browser.preview(assertString(sessionId, 'session_id', 128)),
      ),
    ],
  ]

  for (const [channel, handler] of handlers) ipcMain.handle(channel, handler)
  return () => {
    for (const [channel] of handlers) ipcMain.removeHandler(channel)
  }
}
