import { toast } from 'sonner'
import { commandMessage, engineApi } from '../../services/engine'
import { dispatchAction } from '../../services/actions'
import { useUIStore } from '../../stores/ui'
import type { DockSurface, WorkspaceTab } from '../../stores/sessionDock'

export interface UiCommandDeps {
  sessionId: string
  reveal: (sessionId: string, surface: DockSurface, options?: { workspaceTab?: WorkspaceTab }) => void
  fork: (sessionId: string) => Promise<unknown>
  rename: (sessionId: string, title: string) => Promise<void>
}

/**
 * Comandos `/` de interfaz: lo que el escritorio hace por sí mismo, sin turno.
 * Devuelve `false` si no lo reconoce o le falta texto, y el borrador vuelve.
 */
export async function runUiCommand(name: string, text: string, deps: UiCommandDeps): Promise<boolean> {
  const workspace = (tab: WorkspaceTab) => {
    deps.reveal(deps.sessionId, 'workspace', { workspaceTab: tab })
    return true
  }
  try {
    switch (name) {
      case 'new':
        dispatchAction('new-chat')
        return true
      case 'compact':
        await engineApi.contextCompact(deps.sessionId)
        return true
      case 'context':
        return workspace('insight')
      case 'diff':
        return workspace('changes')
      case 'tasks':
        return workspace('tasks')
      case 'skills':
        useUIStore.getState().goSettings('skills')
        return true
      case 'fork':
        await deps.fork(deps.sessionId)
        return true
      case 'rename':
        if (!text) return false
        await deps.rename(deps.sessionId, text)
        return true
      default:
        return false
    }
  } catch (err) {
    toast.error(commandMessage(err))
    return true
  }
}
