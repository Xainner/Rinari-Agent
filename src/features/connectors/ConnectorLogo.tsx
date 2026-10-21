import { useState } from 'react'
import type { McpCatalogEntry } from '../../services/engine'
import { initials } from './connectorModel'

/**
 * Logos de conectores servidos desde `public/logos/connectors/`. El catálogo
 * trae un identificador (`logo`), no una imagen: aquí se elige el archivo.
 * Las marcas son sus logos oficiales, sin redibujar (fuentes en
 * `public/logos/connectors/SOURCES.md`); los que ya traen su propia placa
 * (`fill`) llenan la caja, y los que son solo un glifo van centrados sobre
 * una placa neutra. Un servidor que no está en el catálogo lleva el icono
 * genérico de «MCP remoto» o «MCP local»; si una imagen falla, sus iniciales.
 */
const CONNECTOR_LOGOS: Readonly<Record<string, { src: string; fill?: boolean }>> = {
  airtable: { src: '/logos/connectors/airtable.png', fill: true },
  asana: { src: '/logos/connectors/asana.png' },
  atlassian: { src: '/logos/connectors/atlassian.png' },
  canva: { src: '/logos/connectors/canva.png', fill: true },
  clickup: { src: '/logos/connectors/clickup.png', fill: true },
  dropbox: { src: '/logos/connectors/dropbox.svg' },
  elevenlabs: { src: '/logos/connectors/elevenlabs.svg', fill: true },
  figma: { src: '/logos/connectors/figma.svg' },
  github: { src: '/logos/connectors/github.svg' },
  'google-calendar': { src: '/logos/connectors/google-calendar.png' },
  'google-chat': { src: '/logos/connectors/google-chat.png' },
  'google-docs': { src: '/logos/connectors/google-docs.png' },
  'google-drive': { src: '/logos/connectors/google-drive.png' },
  'google-gmail': { src: '/logos/connectors/google-gmail.png' },
  'google-people': { src: '/logos/connectors/google-people.png' },
  'google-sheets': { src: '/logos/connectors/google-sheets.png' },
  'google-slides': { src: '/logos/connectors/google-slides.png' },
  'google-workspace': { src: '/logos/connectors/google-workspace.png' },
  hubspot: { src: '/logos/connectors/hubspot.png', fill: true },
  linear: { src: '/logos/connectors/linear.svg', fill: true },
  notion: { src: '/logos/connectors/notion.png', fill: true },
  postgres: { src: '/logos/connectors/postgres.png' },
  sentry: { src: '/logos/connectors/sentry.svg' },
  slack: { src: '/logos/connectors/slack.png' },
  sqlite: { src: '/logos/connectors/sqlite.svg', fill: true },
  stripe: { src: '/logos/connectors/stripe.svg', fill: true },
  supabase: { src: '/logos/connectors/supabase.svg' },
  todoist: { src: '/logos/connectors/todoist.png', fill: true },
  vercel: { src: '/logos/connectors/vercel.png', fill: true },
}

const GENERIC: Readonly<Record<'remote' | 'local', { src: string }>> = {
  remote: { src: '/logos/connectors/mcp-remote.png' },
  local: { src: '/logos/connectors/mcp-local.png' },
}

type Tone = McpCatalogEntry['category'] | 'remote' | 'local'

export function connectorLogoSource(logo: string | null | undefined, tone: Tone): { src: string; fill?: boolean } | undefined {
  if (logo) return CONNECTOR_LOGOS[logo]
  return tone === 'remote' || tone === 'local' ? GENERIC[tone] : undefined
}

export function ConnectorLogo({ name, logo, tone, size = 36 }: {
  name: string
  logo?: string | null
  tone: Tone
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const image = failed ? undefined : connectorLogoSource(logo, tone)
  return (
    <span
      className="connector-logo"
      data-tone={tone}
      data-image={image ? (image.fill ? 'fill' : 'glyph') : undefined}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {image
        ? <img src={image.src} alt="" draggable={false} onError={() => setFailed(true)} />
        : initials(name)}
    </span>
  )
}
