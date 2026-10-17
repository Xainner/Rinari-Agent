import { toast } from 'sonner'
import { commandMessage, engineApi } from '../../services/engine'
import { dispatchAction } from '../../services/actions'
import { useUIStore } from '../../stores/ui'
import { translate } from '../../i18n'
import { useGoalStore } from '../goal/goalStore'
import type { DockSurface, WorkspaceTab } from '../../stores/sessionDock'

export interface UiCommandDeps {
  sessionId: string
  reveal: (sessionId: string, surface: DockSurface, options?: { workspaceTab?: WorkspaceTab }) => void
  fork: (sessionId: string) => Promise<unknown>
  rename: (sessionId: string, title: string) => Promise<void>
  /** Confirmación con el estilo de la app (`useConfirm().ask`); sin ella, la nativa. */
  confirm?: (options: { title: string; body?: string; confirmLabel: string; cancelLabel: string }) => Promise<boolean>
  /** La conversación está en un proyecto (`/init` solo tiene sentido ahí). */
  hasProject?: boolean
  /** Crea la sesión de una conversación nueva que aún no existe; `null` si no puede. */
  ensureSession?: () => Promise<string | null>
}

/**
 * Comandos `/` de interfaz: lo que el escritorio hace por sí mismo, sin turno.
 * Devuelve `false` si no lo reconoce o le falta texto, y el borrador vuelve.
 */
/**
 * `/goal <objetivo>` lo crea (o reemplaza) y arranca; `/goal pause | resume |
 * clear` lo maneja; `/goal` solo dice cómo va (plan 0.4.0 #23).
 */
async function goal(sessionId: string, text: string, confirm?: UiCommandDeps['confirm']): Promise<boolean> {
  const lang = useUIStore.getState().lang
  const store = useGoalStore.getState()
  const word = text.trim().toLowerCase()
  const apply = (result: { goal: Parameters<typeof store.apply>[1] }) => store.apply(sessionId, result.goal)
  if (!word) {
    const current = (await engineApi.sessionGoal(sessionId)).goal
    store.apply(sessionId, current)
    if (!current) toast(translate(lang, 'goal.none'))
    return true
  }
  if (word === 'pause') apply(await engineApi.goalPause(sessionId))
  else if (word === 'resume') apply(await engineApi.goalResume(sessionId))
  else if (word === 'clear') apply(await engineApi.goalClear(sessionId))
  else {
    const current = store.bySession[sessionId]?.goal
    if (current && current.state !== 'achieved') {
      const replace = confirm
        ? await confirm({
          title: translate(lang, 'goal.replaceTitle'),
          body: translate(lang, 'goal.replaceBody', { objective: current.objective }),
          confirmLabel: translate(lang, 'goal.replace'),
          cancelLabel: translate(lang, 'common.cancel'),
        })
        : window.confirm(translate(lang, 'goal.replaceConfirm', { objective: current.objective }))
      if (!replace) return true
    }
    apply(await engineApi.goalSet(sessionId, text.trim()))
  }
  return true
}

/**
 * `/init` (#81): Rinari recorre el proyecto en solo lectura y propone su
 * RINARI.md en una tarjeta. En una conversación nueva, la crea primero.
 */
async function init(deps: UiCommandDeps): Promise<boolean> {
  const lang = useUIStore.getState().lang
  if (!deps.hasProject) {
    toast(translate(lang, 'init.needsProject'))
    return true
  }
  const sessionId = deps.sessionId || (await deps.ensureSession?.()) || ''
  if (!sessionId) {
    toast(translate(lang, 'init.needsConversation'))
    return true
  }
  await engineApi.projectInitStart(sessionId)
  return true
}

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
      case 'goal':
        return await goal(deps.sessionId, text, deps.confirm)
      case 'init':
        return await init(deps)
      default:
        return false
    }
  } catch (err) {
    toast.error(commandMessage(err))
    return true
  }
}
