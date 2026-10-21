import agencyIcon from '../../assets/agency/agency-icon.webp'
import avatarWriter from '../../assets/agency/avatars/avatar-writer.webp'
import avatarResearch from '../../assets/agency/avatars/avatar-research.webp'
import avatarCode from '../../assets/agency/avatars/avatar-code.webp'
import avatarAudio from '../../assets/agency/avatars/avatar-audio.webp'
import avatarVideo from '../../assets/agency/avatars/avatar-video.webp'
import avatarData from '../../assets/agency/avatars/avatar-data.webp'
import avatarOps from '../../assets/agency/avatars/avatar-ops.webp'
import avatarDesign from '../../assets/agency/avatars/avatar-design.webp'
import { cn } from '../../lib/utils'

/**
 * Los avatares de los agentes (D-23): variaciones aprobadas del ícono de la
 * Agency, una por oficio. Mientras un agente no elija el suyo, le toca uno
 * fijo por su id (siempre el mismo), y un tono propio en el borde para
 * distinguirlo de los demás de un vistazo.
 */
export const AGENT_AVATARS: ReadonlyArray<{ id: string; src: string }> = [
  { id: 'writer', src: avatarWriter },
  { id: 'research', src: avatarResearch },
  { id: 'code', src: avatarCode },
  { id: 'audio', src: avatarAudio },
  { id: 'video', src: avatarVideo },
  { id: 'data', src: avatarData },
  { id: 'ops', src: avatarOps },
  { id: 'design', src: avatarDesign },
]

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

export function agentAvatarSrc(agent: { id: string; icon?: string | null }): string {
  const chosen = agent.icon ? AGENT_AVATARS.find((avatar) => avatar.id === agent.icon) : undefined
  if (chosen) return chosen.src
  if (AGENT_AVATARS.length === 0) return agencyIcon
  return AGENT_AVATARS[hash(agent.id) % AGENT_AVATARS.length].src
}

/** Un tono por agente (de la paleta violeta–cian–magenta), estable por su id. */
export function agentHue(id: string): number {
  const hues = [265, 285, 305, 325, 190, 215, 240, 345]
  return hues[hash(`${id}:hue`) % hues.length]
}

export default function AgentAvatar({ agent, size = 26, className }: {
  agent: { id: string; name: string; icon?: string | null } | null
  size?: number
  className?: string
}) {
  const src = agent ? agentAvatarSrc(agent) : agencyIcon
  return (
    <span
      className={cn('agent-avatar', className)}
      style={{ width: size, height: size, ['--agent-hue' as string]: agent ? agentHue(agent.id) : 265 }}
      aria-hidden="true"
      data-agent-id={agent?.id}
    >
      <img src={src} alt="" draggable={false} />
    </span>
  )
}
