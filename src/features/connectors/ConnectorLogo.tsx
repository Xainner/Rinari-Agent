import { useState } from 'react'
import type { McpCatalogEntry } from '../../services/engine'
import { initials } from './connectorModel'

/**
 * Logos de conectores servidos desde `public/logos/connectors/`. El catálogo
 * trae un identificador (`logo`), no una imagen: aquí se elige el archivo, y
 * lo que no tiene archivo (todavía ninguno: es parte del pulido de UI) se
 * dibuja con sus iniciales sobre un fondo de token según su categoría.
 */
const CONNECTOR_LOGOS: Readonly<Record<string, string>> = {}

type Tone = McpCatalogEntry['category'] | 'remote' | 'local'

export function ConnectorLogo({ name, logo, tone, size = 36 }: {
  name: string
  logo?: string | null
  tone: Tone
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const src = logo ? CONNECTOR_LOGOS[logo] : undefined
  return (
    <span className="connector-logo" data-tone={tone} aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {src && !failed
        ? <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />
        : initials(name)}
    </span>
  )
}
