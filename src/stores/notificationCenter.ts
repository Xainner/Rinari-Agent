import { create } from 'zustand'

/**
 * Centro de notificaciones: lo que la app avisó (tareas programadas, skills…)
 * queda aquí, agrupado por módulo, además del aviso emergente. Boards no pasa
 * por aquí: su sección se deriva en vivo del estado de los paneles.
 *
 * Es presentación de este escritorio (localStorage, con tope); la verdad de
 * cada cosa sigue en el Engine.
 */
export type NotificationModule = 'schedules' | 'agency' | 'skills' | 'system'

export type NotificationTarget =
  | { kind: 'session'; sessionId: string; turnId?: string }
  | { kind: 'schedules' }
  /** Rinari Agency: la vista «Reglas» del chat de un agente. */
  | { kind: 'agency-rules'; agentId: string }
  /** Rinari Agency: la oficina de un equipo (una cadena cortada, un recado entregado). */
  | { kind: 'agency-office'; teamId: string }
  | { kind: 'skills'; skill?: string }
  | { kind: 'providers' }
  /** Ajustes > Acerca de, con la versión ofrecida y su acción. */
  | { kind: 'update' }
  /** Ajustes > Conectores con el detalle de ese conector (p. ej. «hay que reconectar»). */
  | { kind: 'connector'; name: string }

export interface CenterNotification {
  id: string
  module: NotificationModule
  title: string
  body?: string
  /** ms epoch */
  at: number
  read: boolean
  tone?: 'info' | 'success' | 'warning' | 'error'
  target?: NotificationTarget
  /**
   * El perfil de Rinari al que pertenece (una tarea de un proyecto, la regla
   * de un agente…). Sin él, es de toda la app (una actualización, un
   * conector) y se ve en cualquier perfil.
   */
  profileId?: string | null
}

/** Si un aviso se ve con este perfil activo: el suyo, o uno de toda la app. */
export function visibleIn(item: CenterNotification, activeId: string | null): boolean {
  return !item.profileId || !activeId || item.profileId === activeId
}

export const NOTIFICATION_CENTER_KEY = 'rinari.notifications.v1'
export const NOTIFICATION_LIMIT = 100
export const NOTIFICATION_MODULES: readonly NotificationModule[] = ['schedules', 'agency', 'skills', 'system']

function load(): CenterNotification[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(NOTIFICATION_CENTER_KEY) ?? '[]')
    return Array.isArray(raw)
      ? raw.filter((item) => item && typeof item.id === 'string' && NOTIFICATION_MODULES.includes(item.module)).slice(0, NOTIFICATION_LIMIT)
      : []
  } catch {
    return []
  }
}

function save(items: CenterNotification[]) {
  try {
    window.localStorage.setItem(NOTIFICATION_CENTER_KEY, JSON.stringify(items))
  } catch {
    // Storage deshabilitado: el centro dura lo que la ventana.
  }
}

interface NotificationCenterState {
  items: CenterNotification[]
  push: (item: Omit<CenterNotification, 'id' | 'at' | 'read'> & { id?: string; at?: number }) => void
  /** Con `profileId`, solo los que se ven en ese perfil (los de otro siguen sin leer allí). */
  markRead: (module?: NotificationModule, profileId?: string | null) => void
  dismiss: (id: string) => void
  clear: (module?: NotificationModule, profileId?: string | null) => void
}

let counter = 0

export const useNotificationCenter = create<NotificationCenterState>((set) => ({
  items: typeof window === 'undefined' ? [] : load(),
  push: (item) =>
    set((state) => {
      const id = item.id ?? `ntf_${Date.now().toString(36)}_${(counter += 1)}`
      const next: CenterNotification = { ...item, id, at: item.at ?? Date.now(), read: false }
      // Mismo id: el aviso se actualiza (p. ej. «te necesita» → «completada»).
      const items = [next, ...state.items.filter((existing) => existing.id !== id)].slice(0, NOTIFICATION_LIMIT)
      save(items)
      return { items }
    }),
  markRead: (module, profileId) =>
    set((state) => {
      const items = state.items.map((item) => (
        (!module || item.module === module) && (profileId === undefined || visibleIn(item, profileId)) ? { ...item, read: true } : item
      ))
      save(items)
      return { items }
    }),
  dismiss: (id) =>
    set((state) => {
      const items = state.items.filter((item) => item.id !== id)
      save(items)
      return { items }
    }),
  clear: (module, profileId) =>
    set((state) => {
      const items = state.items.filter((item) => (
        (module && item.module !== module) || (profileId !== undefined && !visibleIn(item, profileId))
      ))
      save(items)
      return { items }
    }),
}))

export const selectUnreadCount = (state: NotificationCenterState) => state.items.filter((item) => !item.read).length
/** Los sin leer que se ven con este perfil activo. */
export const selectUnreadCountIn = (activeId: string | null) => (state: NotificationCenterState) =>
  state.items.filter((item) => !item.read && visibleIn(item, activeId)).length

/** Solo tests. */
export function resetNotificationCenterForTests(): void {
  useNotificationCenter.setState({ items: [] })
}
