import type { ResizeHandleProps } from '../../hooks/useDragResize'
import { cn } from '../../lib/utils'

/**
 * Separador vertical accesible para `useDragResize`. Ocupa 6 px de zona de
 * agarre con una línea visible de 1 px; el foco de teclado se ve.
 */
export function ResizeHandle({
  label,
  className,
  ...props
}: ResizeHandleProps & { label: string; className?: string }) {
  return (
    <div
      {...props}
      aria-label={label}
      className={cn(
        'group relative w-1.5 shrink-0 cursor-col-resize touch-none select-none outline-none',
        'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-[var(--border)] before:transition-colors',
        'hover:before:bg-[var(--accent)] focus-visible:before:bg-[var(--accent-2)] focus-visible:before:w-0.5',
        props['aria-disabled'] && 'cursor-default hover:before:bg-[var(--border)]',
        className,
      )}
    />
  )
}
