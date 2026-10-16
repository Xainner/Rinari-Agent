import { translate } from '../i18n'
import type { Language } from '../types'
import { APP_NAME } from '../lib/channel'

/**
 * Título y cuerpo de una notificación del sistema (#64), como la de ChatGPT:
 * el nombre de la conversación y las primeras líneas de la respuesta. Con
 * «Mostrar el contenido» apagado, solo dice qué conversación terminó.
 */
export type NotifyOutcome = 'done' | 'failed' | 'stopped' | 'plan' | 'needsYou' | 'resumed'

export interface NotifyContent {
  outcome: NotifyOutcome
  /** Nombre de la conversación. */
  conversation: string
  project?: string | null
  /** Respuesta, título del plan, lo que pide la aprobación o la pregunta, o el motivo del fallo. */
  detail?: string | null
}

export const BODY_MAX = 180

/** Markdown a texto llano de una o dos líneas: sin bloques de código, enlaces ni marcas. */
export function plainExcerpt(markdown: string, max = BODY_MAX): string {
  const text = markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)(\S[\s\S]*?\S|\S)\1/g, '$2')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function notificationText(content: NotifyContent, lang: Language, showContent: boolean): { title: string; body: string } {
  const name = content.conversation
  if (!showContent) {
    return { title: APP_NAME, body: translate(lang, `notify.private.${content.outcome}`, { name }) }
  }
  const title = content.project && content.project !== name ? `${name} · ${content.project}` : name
  const detail = content.detail ? plainExcerpt(content.detail) : ''
  const body = (() => {
    if (content.outcome === 'done' || content.outcome === 'resumed') return detail || translate(lang, `notify.private.${content.outcome}`, { name })
    return detail
      ? translate(lang, `notify.body.${content.outcome}`, { detail })
      : translate(lang, `notify.private.${content.outcome}`, { name })
  })()
  return { title, body }
}
