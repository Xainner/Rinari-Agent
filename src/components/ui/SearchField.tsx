import { Search } from 'lucide-react'
import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Accessible name; also the visible placeholder unless one is given. */
  label: string
  className?: string
}

/**
 * The search control of the redesign: the icon is a flex sibling of the
 * input, not an absolute overlay, so it can never sit on the text whatever
 * padding the field ends up with. The container draws the focus (border and
 * soft glow, as `.field-input`), the input inside draws none.
 */
export function SearchField({ label, className, id, placeholder, ...input }: SearchFieldProps) {
  const fallbackId = useId()
  const inputId = id ?? fallbackId
  return (
    <div className={cn('search-field', className)}>
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <Search size={15} aria-hidden="true" className="search-field-icon" />
      <input id={inputId} type="search" className="search-field-input" placeholder={placeholder ?? label} {...input} />
    </div>
  )
}
