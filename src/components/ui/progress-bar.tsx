import { cn } from '../../lib/utils'

/**
 * Barra de progreso canónica (#65): pista oscura, relleno con el degradado de
 * acento y avance suave. Sin `value`, indeterminada: un brillo la recorre.
 * Nada de la barra nativa del navegador, que se pinta con el estilo del sistema.
 */
export function ProgressBar({ value, max = 1, label, className }: {
  value?: number | null
  max?: number
  label: string
  className?: string
}) {
  const share = typeof value === 'number' && Number.isFinite(value) && max > 0 ? Math.max(0, Math.min(1, value / max)) : null
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={share === null ? undefined : Math.round(share * 100)}
      data-indeterminate={share === null || undefined}
      className={cn('r-progress', className)}
    >
      <span className="r-progress-fill" style={share === null ? undefined : { width: `${Math.round(share * 1000) / 10}%` }} />
    </div>
  )
}
