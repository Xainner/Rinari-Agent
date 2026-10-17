import { useEffect } from 'react'
import { toast } from 'sonner'
import { platform, type ContextMenuItem } from '../../platform'
import { copyText } from '../../lib/clipboard'
import { dispatchAction } from '../../services/actions'
import { translate, type I18nKey } from '../../i18n'
import { useUIStore } from '../../stores/ui'

export default function DesktopContextMenu() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || !platform().isDesktop()) return
      const target = event.target instanceof Element ? event.target : null
      // Un campo editable lo atiende main: solo allí llegan las sugerencias
      // del corrector, y no llegan si aquí se cancela el evento (#72).
      if (target?.closest('input,textarea,[contenteditable="true"]')) return
      event.preventDefault()
      // El idioma se lee al abrir el menú: puede haber cambiado desde el montaje.
      const lang = useUIStore.getState().lang
      const tr = (key: I18nKey) => translate(lang, key)
      const link = target?.closest('a') as HTMLAnchorElement | null
      const selection = window.getSelection()?.toString() ?? ''
      const items: ContextMenuItem[] = []
      if (selection)
        items.push({
          kind: 'action',
          text: tr('edit.copy'),
          run: () => {
            void copyText(selection)
          },
        })
      if (link)
        items.push(
          {
            kind: 'action',
            text: link.dataset.filePath ? tr('app.openFile') : tr('app.openLink'),
            run: () => link.click(),
          },
          {
            kind: 'action',
            text: tr('app.copyAddress'),
            run: () => {
              void copyText(link.dataset.filePath ?? link.href)
            },
          },
        )
      if (!items.length)
        items.push(
          { kind: 'action', text: tr('app.newConversation'), run: () => dispatchAction('new-chat') },
          { kind: 'action', text: tr('app.settings'), run: () => dispatchAction('settings') },
        )
      void platform()
        .contextMenu.show(items, { x: event.clientX, y: event.clientY })
        .catch((error) => toast.error(String(error)))
    }
    window.addEventListener('contextmenu', handler)
    return () => window.removeEventListener('contextmenu', handler)
  }, [])
  return null
}
