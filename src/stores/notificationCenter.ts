import { create } from 'zustand'

/**
 * Centro de notificaciones: lo que la app avisó (tareas programadas, skills…)
 * queda aquí, agrupado por módulo, además del aviso emergente. Boards no pasa
 * por aquí: su sección se deriva en vivo del estado de los paneles.
 *
 * Es presentación de este escritorio (localStorage, con tope); la verdad de
 * cada cosa sigue en el Engine.
 */
export type NotificationModule = 'schedules' | 'skills' | 'system'

export type NotificationTarget =
  | { kind: 'session'; sessionId: string }
  | { kind: 'schedules' }
  | { kind: 'skills' }
  | { kind: 'providers' }

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
}

export const NOTIFICATION_CENTER_KEY = 'rinari.notifications.v1'
export const NOTIFICATION_LIMIT = 100
export const NOTIFICATION_MODULES: readonly NotificationModule[] = ['schedules', 'skills', 'system']

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
  markRead: (module?: NotificationModule) => void
  dismiss: (id: string) => void
  clear: (module?: NotificationModule) => void
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
  markRead: (module) =>
    set((state) => {
      const items = state.items.map((item) => (!module || item.module === module ? { ...item, read: true } : item))
      save(items)
      return { items }
    }),
  dismiss: (id) =>
    set((state) => {
      const items = state.items.filter((item) => item.id !== id)
      save(items)
      return { items }
    }),
  clear: (module) =>
    set((state) => {
      const items = module ? state.items.filter((item) => item.module !== module) : []
      save(items)
      return { items }
    }),
}))

export const selectUnreadCount = (state: NotificationCenterState) => state.items.filter((item) => !item.read).length

/** Solo tests. */
export function resetNotificationCenterForTests(): void {
  useNotificationCenter.setState({ items: [] })
}
