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
  return (
    <img
      src={resolved.src}
      alt=""
      aria-hidden="true"
      draggable={false}
      title={resolved.label}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
