import { Search, X } from 'lucide-react'
import { useId, type InputHTMLAttributes } from 'react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Accessible name; also the visible placeholder unless one is given. */
  label: string
  className?: string
  /** Empties the search: shows the «X» while there is text, and Esc does the same. */
  onClear?: () => void
}

/**
 * The search control of the redesign: the icon is a flex sibling of the
 * input, not an absolute overlay, so it can never sit on the text whatever
 * padding the field ends up with. The container draws the focus (border and
 * soft glow, as `.field-input`), the input inside draws none.
 */
export function SearchField({ label, className, id, placeholder, onClear, onKeyDown, ...input }: SearchFieldProps) {
  const fallbackId = useId()
  const inputId = id ?? fallbackId
  const value = typeof input.value === 'string' ? input.value : ''
  return (
    <div className={cn('search-field', className)}>
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <Search size={15} aria-hidden="true" className="search-field-icon" />
      <input
        id={inputId}
        type="search"
        className="search-field-input"
        placeholder={placeholder ?? label}
        onKeyDown={(event) => {
          // Con texto, Esc limpia la búsqueda antes de cerrar lo que la contiene.
          if (event.key === 'Escape' && value && onClear) {
            event.preventDefault()
            event.stopPropagation()
            onClear()
          }
          onKeyDown?.(event)
        }}
        {...input}
      />
      {onClear && <SearchClearButton value={value} onClear={onClear} />}
    </div>
  )
}

/**
 * The «X» that empties a search field (a flex sibling right after its input).
 * Only there while the field has text; the focus goes back to the field.
 */
export function SearchClearButton({ value, onClear }: { value: string; onClear: () => void }) {
  const { t } = useI18n()
  if (!value) return null
  return (
    <button
      type="button"
      className="search-clear"
      data-testid="search-clear"
      aria-label={t('search.clear')}
      title={t('search.clear')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const field = event.currentTarget.parentElement?.querySelector('input')
        onClear()
        field?.focus()
      }}
    >
      <X size={12} aria-hidden="true" />
    </button>
  )
}
