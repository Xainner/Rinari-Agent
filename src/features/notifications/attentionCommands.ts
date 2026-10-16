import { useBoardAttentionStore } from '../../stores/boardAttention'
import { useNotificationCenter } from '../../stores/notificationCenter'

/**
 * «Marcar todo como leído» (#84): los resultados y mensajes sin leer de todas
 * las conversaciones y la campana. Lo que te necesita (una aprobación o una
 * pregunta) sigue contando: eso no se lee, se responde.
 */
export function markEverythingRead(): void {
  useBoardAttentionStore.getState().markAllSeen()
  if (useNotificationCenter.getState().items.some((item) => !item.read)) useNotificationCenter.getState().markRead()
}
