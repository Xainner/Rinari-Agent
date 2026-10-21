import type { KeyboardEvent, ReactNode } from 'react'

/**
 * Pestañas `.seg-tabs` (`role="tablist"`): cambian la vista de abajo. Una sola
 * parada de tabulador, flechas (e Inicio/Fin) para moverse, y cada pestaña
 * dice qué panel controla; el panel es `SegTabPanel` con el mismo `idPrefix`.
 * Para elegir un ajuste en lugar de una vista, `SegChoice`.
 */
export function SegTabs<V extends string>({ value, options, onChange, label, idPrefix }: {
  value: V
  options: ReadonlyArray<{ value: V; label: ReactNode }>
  onChange: (value: V) => void
  label: string
  idPrefix: string
}) {
  const move = (event: KeyboardEvent, index: number) => {
    const last = options.length - 1
    const next = event.key === 'ArrowRight' ? (index + 1) % options.length
      : event.key === 'ArrowLeft' ? (index + last) % options.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null
    if (next === null) return
    event.preventDefault()
    onChange(options[next].value)
    document.getElementById(`${idPrefix}-tab-${options[next].value}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className="seg-tabs w-fit">
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button key={option.value} type="button" role="tab" id={`${idPrefix}-tab-${option.value}`} aria-controls={`${idPrefix}-panel-${option.value}`} aria-selected={selected} tabIndex={selected ? 0 : -1} className="seg-tab" data-value={option.value}
            onClick={() => { if (!selected) onChange(option.value) }}
            onKeyDown={(event) => move(event, index)}>
            {selected && <span className="seg-tab-pill" aria-hidden="true" />}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function SegTabPanel({ idPrefix, value, className, children }: { idPrefix: string; value: string; className?: string; children: ReactNode }) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${value}`} aria-labelledby={`${idPrefix}-tab-${value}`} className={className}>{children}</div>
}
