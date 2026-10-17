import { useBoardStore } from '../../stores/board'
import { useComposerStore } from '../../stores/composer'
import { useConversationDraftStore } from '../../stores/conversationDraft'
import { useSessionUiStore } from '../../stores/sessionUi'
import { useProjectExpansionStore } from '../../stores/projectExpansion'

/**
 * Lleva la conversación nueva de la vista Normal a otro proyecto (#42).
 *
 * Lo escrito viaja: el texto, los adjuntos y el razonamiento pasan a la clave
 * del nuevo destino, con el modo, los permisos y el modelo. `false` si ya no
 * se puede (la sesión se está creando o ya existe).
 */
export function moveNormalDraft(projectId: string | null): boolean {
  const keys = useConversationDraftStore.getState().moveNormal(projectId)
  if (!keys) return false
  if (keys.from !== keys.to) {
    useComposerStore.getState().carryDraft(keys.from, keys.to)
    const ui = useSessionUiStore.getState()
    ui.setReasoningFor(keys.to, ui.reasoningFor(keys.from))
  }
  if (projectId) useProjectExpansionStore.getState().reveal(projectId)
  return true
}

/** Lo mismo en un panel de Boards: su borrador no depende del proyecto, solo cambia el destino. */
export function movePaneDraft(paneId: string, projectId: string | null): boolean {
  const pane = useBoardStore.getState().panes.find((item) => item.paneId === paneId)
  if (!pane?.draft || pane.draft.sessionId) return false
  useBoardStore.getState().updatePaneDraft(paneId, { projectId })
  return true
}
