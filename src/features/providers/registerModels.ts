import { toast } from 'sonner'
import { commandMessage, engineApi } from '../../services/engine'
import { translate } from '../../i18n'
import { useUIStore } from '../../stores/ui'

/**
 * Guarda todos los modelos que el proveedor anuncia, con su ID como alias
 * inicial. Lo hace el Engine (`model.refresh` con `add_new`): él resuelve
 * colisiones de alias, conserva los personalizados y no duplica IDs. Se llama
 * al terminar de configurar un proveedor (asistente, Ajustes, inicio de
 * sesión); el modelo en uso lo sigue eligiendo el usuario.
 */
export async function registerProviderModels(alias: string): Promise<{ added: number; error: string | null }> {
  const lang = useUIStore.getState().lang
  try {
    const result = await engineApi.modelRefresh(alias, true)
    const entry = result.providers[alias]
    const added = entry?.added?.length ?? 0
    const error = entry?.error ?? null
    if (error) toast.error(translate(lang, 'providers.modelsRegisterFailed', { detail: error }))
    else if (added > 0) toast.success(translate(lang, 'providers.modelsRegistered', { n: added }))
    return { added, error }
  } catch (err) {
    const error = commandMessage(err)
    toast.error(translate(lang, 'providers.modelsRegisterFailed', { detail: error }))
    return { added: 0, error }
  }
}
