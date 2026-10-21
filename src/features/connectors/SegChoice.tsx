import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { SegTabPill } from '../../components/ui/SegTabPill'

/**
 * Un segmentado `.seg-tabs` que elige un valor (radiogroup): una sola parada
 * de tabulador y flechas para moverse, como las pestañas de la guía.
 * `role="tablist"` cambia vistas; este elige un ajuste.
 */
export function SegChoice<V extends string>({ value, options, onChange, label, labelledBy, disabled, small, testId }: {
  value: V | null
  options: ReadonlyArray<{ value: V; label: ReactNode; title?: string }>
  onChange: (value: V) => void
  label?: string
  labelledBy?: string
  disabled?: boolean
  small?: boolean
  testId?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const current = Math.max(0, options.findIndex((option) => option.value === value))
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    refs.current[next]?.focus()
    onChange(options[next].value)
  }
  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className={cn('seg-tabs w-fit', small && 'seg-tabs-sm')} data-testid={testId}>
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => { refs.current[index] = node }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === current ? 0 : -1}
            title={option.title}
            disabled={disabled}
            data-value={option.value}
            className="seg-tab"
            onClick={() => { if (!selected) onChange(option.value) }}
            onKeyDown={(event) => move(event, index)}
          >
            {selected && <SegTabPill />}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
