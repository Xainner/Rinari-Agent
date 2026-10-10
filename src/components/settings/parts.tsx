import type { ReactNode } from 'react'
import { inputClass, labelClass } from '../../lib/ui'

/** Primitivas compartidas de settings: sección, fila con switch, segmented. */
export { inputClass, labelClass }

export function Section({
  title,
  desc,
  children,
  anchor,
}: {
  /** Acepta nodos para poder anteponer el logo del proveedor al título. */
  title: ReactNode
  desc?: string
  children: ReactNode
  /** `data-anchor` para llevar la vista a esta sección. */
  anchor?: string
}) {
  return (
    <section data-anchor={anchor} className="settings-card">
      <h2 className="font-display text-[16px] font-bold text-[var(--text)]">{title}</h2>
      {desc && <p className="mt-1 mb-4 text-sm text-[var(--text-muted)]">{desc}</p>}
      {!desc && <div className="mb-4" />}
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Row({
  title,
  desc,
  control,
}: {
  title: string
  desc?: string
  control: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {desc && <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{desc}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}
