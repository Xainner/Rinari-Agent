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
      event.preventDefault()
      // El idioma se lee al abrir el menú: puede haber cambiado desde el montaje.
      const lang = useUIStore.getState().lang
      const tr = (key: I18nKey) => translate(lang, key)
      const target = event.target instanceof Element ? event.target : null
      const editable = target?.closest(
        'input,textarea,[contenteditable="true"]',
      ) as HTMLElement | null
      const link = target?.closest('a') as HTMLAnchorElement | null
      const selection = window.getSelection()?.toString() ?? ''
      const items: ContextMenuItem[] = []
      if (editable) {
        editable.focus()
        items.push(
          {
            kind: 'action',
            text: tr('edit.undo'),
            run: () => {
              editable.focus()
              document.execCommand('undo')
            },
          },
          {
            kind: 'action',
            text: tr('edit.redo'),
            run: () => {
              editable.focus()
              document.execCommand('redo')
            },
          },
          { kind: 'role', role: 'cut', text: tr('edit.cut') },
          { kind: 'role', role: 'copy', text: tr('edit.copy') },
          { kind: 'role', role: 'paste', text: tr('edit.paste') },
          { kind: 'role', role: 'selectAll', text: tr('edit.selectAll') },
        )
      } else {
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
      }
      void platform()
        .contextMenu.show(items, { x: event.clientX, y: event.clientY })
        .catch((error) => toast.error(String(error)))
    }
    window.addEventListener('contextmenu', handler)
    return () => window.removeEventListener('contextmenu', handler)
  }, [])
  return null
}
