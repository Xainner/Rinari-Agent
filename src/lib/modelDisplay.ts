/**
 * Nombre visible de un modelo.
 *
 * Algunos proveedores publican el nombre real del modelo (Claude Subscription
 * lo toma del selector de la propia cuenta: «Opus 5.5»). Se muestra cuando el
 * alias es el que Rinari puso solo —igual al id del proveedor—; si el usuario
 * eligió un alias propio, ese manda, porque es el nombre con el que lo busca.
 */
export function modelDisplayName(model: {
  alias?: string | null
  provider_model_id?: string | null
  capabilities?: Record<string, unknown> | null
}): string {
  const label = typeof model.capabilities?.label === 'string' ? model.capabilities.label.trim() : ''
  const alias = model.alias ?? ''
  const automaticAlias = !alias || alias === model.provider_model_id
  if (label && automaticAlias) return label
  return alias || model.provider_model_id || ''
}

/**
 * Identidad técnica para el subtítulo: el modelo concreto al que resuelve un
 * alias cuando el proveedor la informa (`opus` → `claude-opus-5-5`), si no el
 * id con el que se llama.
 */
export function modelTechnicalId(model: {
  provider_model_id?: string | null
  capabilities?: Record<string, unknown> | null
}): string {
  const resolved = model.capabilities?.resolved_model
  return typeof resolved === 'string' && resolved ? resolved : (model.provider_model_id ?? '')
}
