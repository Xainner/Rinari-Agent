import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useNotificationCenter, visibleIn } from '../../stores/notificationCenter'
import { useProfileStore } from '../profiles/profileStore'

/**
 * «Marcar todo como leído» (#84): los resultados y mensajes sin leer de todas
 * las conversaciones y la campana. Lo que te necesita (una aprobación o una
 * pregunta) sigue contando: eso no se lee, se responde.
 */
export function markEverythingRead(): void {
  useBoardAttentionStore.getState().markAllSeen()
  // La campana es del perfil activo: lo de otro perfil sigue sin leer allí.
  const profile = useProfileStore.getState().activeId
  if (useNotificationCenter.getState().items.some((item) => !item.read && visibleIn(item, profile))) useNotificationCenter.getState().markRead(undefined, profile)
}
