import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[var(--accent)] text-white shadow-sm hover:brightness-110 active:scale-[0.98]',
        secondary:
          'border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)] hover:bg-[var(--bg-hover)] active:scale-[0.98]',
        ghost: 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]',
        outline:
          'border border-[var(--border-strong)] bg-transparent text-[var(--text)] hover:bg-[var(--bg-hover)]',
        destructive:
          'border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/15 active:scale-[0.98]',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-12 px-6',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

export { Button, buttonVariants }
