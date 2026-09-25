import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog'

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel: string
}

/**
 * Confirmación con el estilo de la app, en lugar de `window.confirm`, que
 * abre una ventana nativa sin tema. `ask()` devuelve una promesa: `true` si se
 * confirma, `false` si se cancela o se cierra. `dialog` se monta una vez.
 */
export function useConfirm(): { ask: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const ask = useCallback((next: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false)
    resolver.current = resolve
    setOptions(next)
  }), [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  const dialog = (
    <AlertDialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.body && <AlertDialogDescription>{options.body}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{options?.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>{options?.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { ask, dialog }
}
