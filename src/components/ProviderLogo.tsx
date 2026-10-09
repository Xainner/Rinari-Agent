import { brandForProvider, type ProviderBrand } from '../lib/providerBrand'
import { useState } from 'react'
import { Box } from 'lucide-react'

interface ProviderLogoProps {
  /** `null` muestra el icono neutro; `undefined` resuelve la identidad disponible. */
  brand?: ProviderBrand | null
  productId?: string | null
  alias?: string | null
  endpoint?: string | null
  size?: number
  className?: string
}

/**
 * Logo decorativo del proveedor (marca resuelta por producto, endpoint o alias).
 *
 * Las marcas monocromas traen variante para cada tema: se emiten ambas y el
 * tema activo elige por CSS a partir de `document.documentElement[data-theme]`,
 * sin observadores ni re-render. Las de color emiten una sola.
 *
 * Sin marca o ante un recurso roto, conserva las dimensiones con un icono neutro.
 */
export default function ProviderLogo({
  brand,
  productId,
  alias,
  endpoint,
  size = 16,
  className = '',
}: ProviderLogoProps) {
  const resolved = brand === undefined ? brandForProvider({ product_id: productId, alias, endpoint }) : brand
  return <LogoImage key={resolved ? `${resolved.src}:${resolved.srcLight ?? ''}` : 'neutral'} brand={resolved} size={size} className={className} />
}

function LogoImage({ brand, size, className }: { brand: ProviderBrand | null; size: number; className: string }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }
  return <span aria-hidden="true" title={brand?.label} data-provider-brand={brand?.id ?? 'custom'}
    className={`inline-flex shrink-0 items-center justify-center ${className}`} style={style}>
    {!brand || failed ? <Box size={size} data-provider-fallback="" /> : <>
      <img src={brand.src} alt="" draggable={false} onError={() => setFailed(true)}
        className={`object-contain${brand.srcLight ? ' provider-logo-dark' : ''}`} style={style} />
      {brand.srcLight && <img src={brand.srcLight} alt="" draggable={false} onError={() => setFailed(true)}
        className="object-contain provider-logo-light" style={style} />}
    </>}
  </span>
}
