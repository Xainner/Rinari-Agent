import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  /** Icono o logo a la izquierda, en el disparador y en la lista. */
  icon?: ReactNode
  /** Una línea secundaria en la lista (no en el disparador). */
  detail?: string
  /** Una insignia corta a la derecha («Experimental»). */
  badge?: string
}

/**
 * Selector canónico (#12): en lugar del `<select>` nativo, cuya lista abierta
 * es el menú del sistema, un disparador con el estilo de los campos (icono,
 * nombre y chevron) y una lista `.r-pop` del ancho del disparador, con iconos,
 * un check en el elegido y una insignia opcional. Conserva el `id` para que
 * un `<label htmlFor>` lo nombre.
 */
export function Select<V extends string>({
  id,
  value,
  options,
  onChange,
  label,
  placeholder,
  disabled,
  className,
  compact = false,
  testId,
  onOpenChange,
}: {
  id?: string
  value: V | null
  options: readonly SelectOption<V>[]
  onChange: (value: V) => void
  /** Nombre accesible cuando no hay `<label htmlFor>`. */
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Disparador bajo y sin borde de campo, para barras de herramientas. */
  compact?: boolean
  testId?: string
  /** Al abrir o cerrar la lista (por ejemplo, para cargarla solo cuando se abre). */
  onOpenChange?: (open: boolean) => void
}) {
  const current = options.find((option) => option.value === value) ?? null
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          aria-label={label}
          title={label ? `${label}: ${current?.label ?? ''}` : undefined}
          data-value={current?.value ?? ''}
          data-testid={testId}
          className={cn('r-select', compact ? 'is-compact' : 'field-input', className)}
        >
          {current?.icon && <span className="r-select-icon">{current.icon}</span>}
          <span className={cn('r-select-label', !current && 'is-placeholder')}>{current?.label ?? placeholder ?? ''}</span>
          <ChevronDown size={14} aria-hidden="true" className="r-select-caret" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="r-select-menu" style={{ minWidth: 'var(--radix-dropdown-menu-trigger-width)' }}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <DropdownMenuItem key={option.value} data-selected={selected || undefined} onSelect={() => { if (!selected) onChange(option.value) }}>
              {option.icon && <span className="r-select-icon">{option.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {option.detail && <span className="block truncate text-[11px] text-[var(--text-subtle)]">{option.detail}</span>}
              </span>
              {option.badge && <span className="r-chip shrink-0" data-tone="warning">{option.badge}</span>}
              <Check aria-hidden="true" className={cn('r-select-check', !selected && 'invisible')} />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
