import { ArrowLeftRight } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { ModelChange, ModelLabel } from './types'

function name(label: ModelLabel): string {
  return label.alias || label.providerModelId || ''
}

/**
 * «Se cambió de modelo de A a B», debajo del primer texto de B. Lo decide el
 * Engine (`model.changed`): A es el último modelo que escribió, no el último
 * elegido. Es información de la interfaz, nunca parte de la respuesta.
 */
export function ModelChangeNotice({ change }: { change: ModelChange }) {
  const { t } = useI18n()
  let previous = name(change.previous)
  let next = name(change.next)
  // Mismo nombre en dos proveedores: el proveedor los distingue.
  if (previous && previous === next) {
    if (change.previous.providerAlias) previous += ` (${change.previous.providerAlias})`
    if (change.next.providerAlias) next += ` (${change.next.providerAlias})`
  }
  if (!next) return null
  return (
    <div data-testid="model-change" className="flex items-center gap-2 py-1 text-[12px] text-[var(--text-subtle)]">
      <ArrowLeftRight size={12} aria-hidden="true" />
      <span>{previous ? t('model.changed', { previous, next }) : t('model.changedTo', { next })}</span>
    </div>
  )
}
