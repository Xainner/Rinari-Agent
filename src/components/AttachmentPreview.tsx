import { useRef, type ReactNode } from 'react'
import { Eye } from 'lucide-react'
import { useI18n } from '../i18n'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

/** Portal modal: the preview must not inherit a message's scrolling bounds. */
export function AttachmentPreview({ name, open, onOpenChange, children }: {
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const opener = useRef<HTMLElement | null>(null)
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      aria-label={t('attach.previewOf', { name })}
      aria-describedby={undefined}
      className="flex max-w-3xl flex-col gap-0 overflow-hidden p-0"
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
      onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus() }}
    >
      <DialogTitle className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] py-3 pl-4 pr-12 font-sans text-sm font-normal">
        <Eye size={15} className="shrink-0 text-[var(--accent-2)]" />
        <span className="min-w-0 truncate">{name}</span>
      </DialogTitle>
      <div className="min-h-0 overflow-auto p-4">{children}</div>
    </DialogContent>
  </Dialog>
}
