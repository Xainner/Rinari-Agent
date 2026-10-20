import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { onEngineEvent } from '../../services/engine'
import { sendSystemNotification } from '../../services/notifications'
import { useNotificationCenter } from '../../stores/notificationCenter'

/**
 * «Hay que reconectar» sin pantalla (plan de conectores C8, Agency §14.5):
 * cuando un conector pasa a `reauth_required` (su sesión venció y no se pudo
 * renovar), se avisa una vez por el sistema, que llega también con la app
 * en la bandeja, y queda en el centro de avisos con el conector a un clic.
 * Lo usan los agentes, sus reglas y las tareas programadas: sin aviso,
 * fallarían en silencio hasta que alguien abriera Ajustes.
 */
export default function ReconnectNotifier() {
  const { t } = useI18n()
  const latest = useRef(t)
  latest.current = t
  // El último estado visto por conector: se avisa al pasar a reauth, no a cada evento.
  const seen = useRef(new Map<string, string>())

  useEffect(() => {
    let stop: (() => void) | undefined
    let disposed = false
    void onEngineEvent((event) => {
      if (event.event !== 'mcp.status.changed') return
      const payload = event.payload as { name?: unknown; status?: unknown }
      const name = typeof payload.name === 'string' ? payload.name : ''
      const status = typeof payload.status === 'string' ? payload.status : ''
      if (!name) return
      const before = seen.current.get(name)
      seen.current.set(name, status)
      if (status !== 'reauth_required' || before === 'reauth_required') return
      const tr = latest.current
      const title = tr('connectors.reauthNotice.title', { name })
      const body = tr('connectors.reauthNotice.body')
      void sendSystemNotification({ title, body })
      useNotificationCenter.getState().push({
        id: `reauth:${name}`,
        module: 'system',
        title,
        body,
        tone: 'warning',
        target: { kind: 'connector', name },
      })
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [])

  return null
}
