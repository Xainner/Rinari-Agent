import type { ResizeHandleProps } from '../../hooks/useDragResize'
import { cn } from '../../lib/utils'

/**
 * Separador vertical accesible para `useDragResize`. En reposo no se ve; al
 * acercar el ratón, con el foco de teclado o mientras se arrastra aparecen su
 * línea y una píldora en el centro. Ocupa 6 px en el layout, pero la zona de
 * agarre mide 14 px (4 px a cada lado por encima de sus vecinos).
 */
export function ResizeHandle({
  label,
  className,
  ...props
}: ResizeHandleProps & { label: string; className?: string; onDoubleClick?: () => void }) {
  return (
    <div
      {...props}
      aria-label={label}
      className={cn(
        'group relative z-10 -mx-1 box-content w-1.5 shrink-0 cursor-col-resize touch-none select-none bg-clip-content px-1 outline-none',
        'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-transparent before:transition-colors',
        'hover:before:bg-[var(--accent)] focus-visible:before:bg-[var(--accent-2)] focus-visible:before:w-0.5 data-[dragging]:before:bg-[var(--accent)]',
        // Tirador: una píldora en el centro que aparece al acercarse, con foco o al arrastrar.
        'after:absolute after:top-1/2 after:left-1/2 after:h-10 after:w-[3px] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-[var(--violet-300)] after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100 data-[dragging]:after:opacity-100',
        props['aria-disabled'] && 'cursor-default hover:before:bg-transparent hover:after:opacity-0',
        className,
      )}
    />
  )
}
