import { useState } from 'react'
import { useI18n, type I18nKey } from '../../i18n'
import type { AgentTimelineItem, SteerTimelineItem } from '../activity/types'

const TYPE_KEYS: Record<string, I18nKey> = {
  explore: 'agents.type.explore',
  explorer: 'agents.type.explore',
  reviewer: 'agents.type.reviewer',
  debugger: 'agents.type.debugger',
  researcher: 'agents.type.researcher',
  implementer: 'agents.type.implementer',
  verifier: 'agents.type.verifier',
}

/** El tipo del subagente en el idioma del dueño; uno desconocido, tal cual. */
export function useAgentType() {
  const { t } = useI18n()
  return (agent: string) => (TYPE_KEYS[agent] ? t(TYPE_KEYS[agent]) : agent)
}

/**
 * «Vega · explorador» (#73): el apodo que le dio el Engine y su tipo. Un
 * subagente de una sesión vieja, sin apodo, se ve solo con el tipo.
 */
export function useAgentLabel() {
  const typeOf = useAgentType()
  return (item: Pick<AgentTimelineItem, 'agent' | 'nickname'>) => (item.nickname ? `${item.nickname} · ${typeOf(item.agent)}` : typeOf(item.agent))
}

const LONG = 280

/**
 * Una instrucción de Rinari a su subagente (#25), en su sitio entre los pasos.
 * La que volvió a poner en marcha a un subagente que ya había terminado lleva
 * delante el separador «Seguimiento».
 */
export function AgentInstruction({ item }: { item: SteerTimelineItem }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const long = item.content.length > LONG
  return (
    <div className="agent-instruction-step" data-testid="agent-step-instruction" data-follow-up={item.followUp || undefined}>
      {item.followUp && <div className="agent-follow-up" role="separator">{t('agents.followUp')}</div>}
      <p className="text-[11px] font-semibold text-[var(--text-subtle)]">{t('agents.instruction')}</p>
      <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-[var(--accent)]/40 pl-3 text-[12px] leading-snug text-[var(--text-muted)]">
        {long && !open ? `${item.content.slice(0, LONG).trimEnd()}…` : item.content}
      </blockquote>
      {long && (
        <button type="button" className="mt-1 text-[11px] text-[var(--text-subtle)] underline-offset-2 hover:text-[var(--text)] hover:underline" onClick={() => setOpen((value) => !value)}>
          {open ? t('agents.instructionLess') : t('agents.instructionMore')}
        </button>
      )}
    </div>
  )
}
