import { useEffect } from 'react'
import { toast } from 'sonner'
import { platform } from '../platform'
import { useI18n } from '../i18n'

/**
 * Encaja la ventana dentro del área de trabajo al arrancar. La secuencia
 * concreta (monitor, marco nativo, unidades) pertenece al host: aquí solo se
 * expresa la intención, porque la API equivalente de Electron tiene otra forma.
 */
export function useWindowBounds() {
  const { t } = useI18n()
  useEffect(() => {
    if (!platform().isDesktop()) return
    let disposed = false
    void platform()
      .window.clampToWorkArea()
      .catch(() => {
        if (!disposed) toast.error(t('home.windowError'))
      })
    return () => {
      disposed = true
    }
  }, [t])
}
