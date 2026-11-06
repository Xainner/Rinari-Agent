import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import type { OpenFilesOptions } from '../../platform/contract'
import { inputClass, labelClass } from '../../components/settings/parts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'

/**
 * Elegir una carpeta para Rinari. Con Rinari en este equipo es el diálogo
 * nativo de siempre; con Rinari en un servidor, las carpetas de este equipo no
 * le sirven, así que se pide la ruta de una carpeta del servidor. `dialog` se
 * monta una vez en el componente que lo usa.
 */
export function useFolderPicker(): { pickFolders: (options?: OpenFilesOptions) => Promise<string[] | null>; dialog: ReactNode } {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const resolver = useRef<((paths: string[] | null) => void) | null>(null)

  const pickFolders = useCallback(async (options: OpenFilesOptions = {}) => {
    // Sin estado (aún arrancando, o un puente sin Engine) se trata como este equipo.
    const status = await Promise.resolve()
      .then(() => platform().engine.status())
      .catch(() => null)
    if (!status?.remote) return platform().dialog.openFiles({ ...options, directory: true })
    return new Promise<string[] | null>((resolve) => {
      resolver.current?.(null)
      resolver.current = resolve
      setValue('')
      setOpen(true)
    })
  }, [])

  const settle = (paths: string[] | null) => {
    resolver.current?.(paths)
    resolver.current = null
    setOpen(false)
  }
  const path = value.trim()

  const dialog = (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) settle(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('serverFolder.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('serverFolder.desc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (path) settle([path])
          }}
        >
          <label className={labelClass} htmlFor="server-folder-path">
            {t('serverFolder.label')}
          </label>
          <input
            id="server-folder-path"
            className={`${inputClass} font-mono`}
            value={value}
            placeholder="/home/…"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            onChange={(event) => setValue(event.target.value)}
          />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(null)}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction disabled={!path} onClick={() => settle([path])}>
            {t('serverFolder.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { pickFolders, dialog }
}
