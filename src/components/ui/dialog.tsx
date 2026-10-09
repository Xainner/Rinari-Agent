import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useBlockingOverlay } from '../../stores/overlay'
import { translate } from '../../i18n'
import { useUIStore } from '../../stores/ui'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'r-overlay fixed inset-0 z-50',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Retira las vistas nativas mientras el diálogo está **abierto**.
 *
 * Va aquí dentro y no en `DialogContent` porque ese se renderiza siempre —los
 * consumidores escriben `<Dialog open={x}><DialogContent/>`— y sólo los hijos
 * del `Portal` montan con la apertura. Colgado del componente de fuera, el
 * navegador se habría quedado escondido mientras la pantalla existiera.
 */
function BlockNativeViews() {
  useBlockingOverlay()
  return null
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  // Del store y no del contexto: hay diálogos que se montan fuera del
  // I18nProvider (el arranque, por ejemplo).
  const lang = useUIStore((state) => state.lang)
  return (
    <DialogPrimitive.Portal>
      {/* §8.3: ningún `z-index` del DOM queda por encima de una
          `WebContentsView`, así que un modal necesita que se retire. */}
      <BlockNativeViews />
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid grid-cols-[minmax(0,1fr)] max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[var(--r-xl)] p-6 outline-none r-dialog',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={translate(lang, 'common.close')}
          className="absolute top-3 right-3 rounded-lg p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        >
          <X size={16} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 pr-8 text-left', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-lg font-bold text-[var(--text)]', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-sm text-[var(--text-muted)]', className)} {...props} />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
