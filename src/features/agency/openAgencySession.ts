import { useAgencyStore } from '../../stores/agency'

/**
 * Abrir una conversación de la Agency desde fuera (una notificación, la
 * campana): entra a la Agency con la página de ese chat directo o de ese
 * puesto, en vez de mostrarla dentro de Rinari. Guarda a qué conversación de
 * Rinari volver. Devuelve false si la sesión no es de la Agency (o es un hijo
 * de un agente, que se abre como cualquier conversación).
 *
 * Quien llama selecciona la sesión y va a la vista de chat.
 */
export function enterAgencySession(sessionId: string, currentSessionId: string | null): boolean {
  const state = useAgencyStore.getState()
  const post = state.postSessions[sessionId]
  const agentId = state.agentSessions[sessionId]
  if (!post && !agentId) return false
  if (state.space !== 'agency') state.rememberRinari(currentSessionId)
  if (post) state.openPost(post.teamId, post.agentId)
  else state.openAgent(agentId)
  return true
}
