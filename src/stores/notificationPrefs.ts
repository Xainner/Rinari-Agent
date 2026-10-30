import { create } from 'zustand'

/**
 * Cuándo y cómo avisa Rinari, para todas las conversaciones (#33, #64). Antes
 * vivía en el layout de Boards y solo valía para sus paneles; las elecciones
 * de toasts y «te necesita» se traen de ahí la primera vez.
 */
export interface NotificationPrefs {
  /** Aviso dentro de la app cuando la conversación no está a la vista. */
  toasts: boolean
  /** Notificación del sistema cuando la ventana no está al frente. */
  system: boolean
  /** Avisar de aprobaciones y preguntas. */
  needsYou: boolean
  /** Texto propio y «Revisar plan» cuando termina un plan. */
  planReady: boolean
  /** Título de la conversación y primeras líneas de la respuesta en la notificación del sistema (#64). */
  showContent: boolean
}

export const NOTIFICATION_PREFS_KEY = 'rinari.notifications.prefs.v1'
const BOARD_KEY = 'rinari.board.v1'

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  toasts: true,
  system: true,
  needsYou: true,
  planReady: true,
  showContent: true,
}

function readBoardChoices(): Partial<NotificationPrefs> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(BOARD_KEY) ?? 'null') as { notifications?: Record<string, unknown> } | null
    const legacy = raw?.notifications
    if (!legacy || typeof legacy !== 'object') return {}
    const out: Partial<NotificationPrefs> = {}
    if (typeof legacy.toasts === 'boolean') out.toasts = legacy.toasts
    if (typeof legacy.needsYou === 'boolean') out.needsYou = legacy.needsYou
    return out
  } catch {
    return {}
  }
}

export function loadNotificationPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTIFICATION_PREFS }
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREFS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const out = { ...DEFAULT_NOTIFICATION_PREFS }
      for (const key of Object.keys(out) as Array<keyof NotificationPrefs>) {
        if (typeof parsed[key] === 'boolean') out[key] = parsed[key] as boolean
      }
      return out
    }
  } catch {
    // Almacenamiento roto: valen los de fábrica.
  }
  return { ...DEFAULT_NOTIFICATION_PREFS, ...readBoardChoices() }
}

interface NotificationPrefsState extends NotificationPrefs {
  set: (patch: Partial<NotificationPrefs>) => void
}

export const useNotificationPrefs = create<NotificationPrefsState>((set) => ({
  ...loadNotificationPrefs(),
  set: (patch) => set((state) => {
    const next: NotificationPrefs = {
      toasts: patch.toasts ?? state.toasts,
      system: patch.system ?? state.system,
      needsYou: patch.needsYou ?? state.needsYou,
      planReady: patch.planReady ?? state.planReady,
      showContent: patch.showContent ?? state.showContent,
    }
    try {
      window.localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next))
    } catch {
      // Sin almacenamiento: dura lo que la ventana.
    }
    return next
  }),
}))

export function notificationPrefs(): NotificationPrefs {
  const { toasts, system, needsYou, planReady, showContent } = useNotificationPrefs.getState()
  return { toasts, system, needsYou, planReady, showContent }
}

/** Solo tests. */
export function resetNotificationPrefsForTests(patch: Partial<NotificationPrefs> = {}): void {
  useNotificationPrefs.setState({ ...DEFAULT_NOTIFICATION_PREFS, ...patch })
}
