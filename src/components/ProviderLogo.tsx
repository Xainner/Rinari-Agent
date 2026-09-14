import { brandForProvider, type ProviderBrand } from '../lib/providerBrand'

interface ProviderLogoProps {
  /** Marca ya resuelta (presets). `null` = sin logo; `undefined` = resolver por alias/endpoint. */
  brand?: ProviderBrand | null
  alias?: string | null
  endpoint?: string | null
  size?: number
  className?: string
}

/**
 * Logo decorativo del proveedor (marca resuelta por endpoint/alias).
 *
 * Las marcas monocromas traen variante para cada tema: se emiten ambas y el
 * tema activo elige por CSS a partir de `document.documentElement[data-theme]`,
 * sin observadores ni re-render. Las de color emiten una sola.
 *
 * Sin marca conocida no pinta nada: el layout nunca reserva hueco vacío.
 */
export default function ProviderLogo({
  brand,
  alias,
  endpoint,
  size = 16,
  className = '',
}: ProviderLogoProps) {
  const resolved = brand === undefined ? brandForProvider({ alias, endpoint }) : brand
  if (!resolved) return null
  const base = `shrink-0 object-contain ${className}`
  const style = { width: size, height: size }
  if (!resolved.srcLight) {
    return (
      <img
        src={resolved.src}
        alt=""
        aria-hidden="true"
        draggable={false}
        title={resolved.label}
        className={base}
        style={style}
      />
    )
  }
  return (
    <>
      <img
        src={resolved.src}
        alt=""
        aria-hidden="true"
        draggable={false}
        title={resolved.label}
        className={`${base} provider-logo-dark`}
        style={style}
      />
      <img
        src={resolved.srcLight}
        alt=""
        aria-hidden="true"
        draggable={false}
        title={resolved.label}
        className={`${base} provider-logo-light`}
        style={style}
      />
    </>
  )
}
