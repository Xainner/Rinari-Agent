import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n'
import ProviderLogo from '../../components/ProviderLogo'
import type { ModelChange, ModelLabel } from './types'

function name(label: ModelLabel): string {
  return label.alias || label.providerModelId || ''
}

/** El id técnico de un modelo, para el tooltip. */
function technical(label: ModelLabel): string {
  return [label.providerAlias, label.providerModelId || label.modelId].filter(Boolean).join(' · ')
}

/**
 * «Anterior → nuevo» arriba del turno, antes del primer mensaje (#29): un chip
 * con el logo y el nombre de cada modelo y una flecha que se desliza una vez
 * al aparecer en un turno en curso (al reabrir el historial, quieta). Lo
 * decide el Engine (`model.changed`): el anterior es el último modelo que
 * escribió, no el último elegido. Es información de la interfaz, nunca parte
 * de la respuesta. La frase completa queda para el lector de pantalla.
 */
export function ModelChangeNotice({ change, animate = false }: { change: ModelChange; animate?: boolean }) {
  const { t } = useI18n()
  let previous = name(change.previous)
  let next = name(change.next)
  // Mismo nombre en dos proveedores: el proveedor los distingue.
  if (previous && previous === next) {
    if (change.previous.providerAlias) previous += ` (${change.previous.providerAlias})`
    if (change.next.providerAlias) next += ` (${change.next.providerAlias})`
  }
  if (!next) return null
  const sentence = previous ? t('model.changed', { previous, next }) : t('model.changedTo', { next })
  return (
    <div data-testid="model-change" role="note" aria-label={sentence} className="model-change" data-animate={animate || undefined}>
      <span className="model-change-chip" aria-hidden="true">
        {previous && (
          <span className="model-change-model is-previous" title={technical(change.previous)}>
            <ProviderLogo alias={change.previous.providerAlias} size={13} />
            <span className="model-change-name">{previous}</span>
          </span>
        )}
        <ArrowRight size={12} className="model-change-arrow" />
        <span className="model-change-model" title={technical(change.next)}>
          <ProviderLogo alias={change.next.providerAlias} size={13} />
          <span className="model-change-name">{next}</span>
        </span>
      </span>
    </div>
  )
}
