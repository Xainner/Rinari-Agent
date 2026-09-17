import { useEffect } from 'react'
import { toast } from 'sonner'
import { platform, type ContextMenuItem } from '../../platform'
import { copyText } from '../../lib/clipboard'
import { dispatchAction } from '../../services/actions'

export default function DesktopContextMenu() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || !platform().isDesktop()) return
      event.preventDefault()
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
            text: 'Deshacer',
            run: () => {
              editable.focus()
              document.execCommand('undo')
            },
          },
          {
            kind: 'action',
            text: 'Rehacer',
            run: () => {
              editable.focus()
              document.execCommand('redo')
            },
          },
          { kind: 'role', role: 'cut', text: 'Cortar' },
          { kind: 'role', role: 'copy', text: 'Copiar' },
          { kind: 'role', role: 'paste', text: 'Pegar' },
          { kind: 'role', role: 'selectAll', text: 'Seleccionar todo' },
        )
      } else {
        if (selection)
          items.push({
            kind: 'action',
            text: 'Copiar',
            run: () => {
              void copyText(selection)
            },
          })
        if (link)
          items.push(
            {
              kind: 'action',
              text: link.dataset.filePath ? 'Abrir archivo' : 'Abrir enlace',
              run: () => link.click(),
            },
            {
              kind: 'action',
              text: 'Copiar dirección',
              run: () => {
                void copyText(link.dataset.filePath ?? link.href)
              },
            },
          )
        if (!items.length)
          items.push(
            { kind: 'action', text: 'Nueva conversación', run: () => dispatchAction('new-chat') },
            { kind: 'action', text: 'Configuración', run: () => dispatchAction('settings') },
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
