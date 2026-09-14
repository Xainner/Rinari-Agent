import type { ReactNode } from 'react'
import { inputClass, labelClass } from '../../lib/ui'

/** Primitivas compartidas de settings: sección, fila con switch, segmented. */
export { inputClass, labelClass }

export function Section({
  title,
  desc,
  children,
}: {
  /** Acepta nodos para poder anteponer el logo del proveedor al título. */
  title: ReactNode
  desc?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
      <h2 className="font-display text-lg font-bold text-[var(--text)]">{title}</h2>
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
