import type { I18nKey } from '../../i18n'
import type { OfficeMessage } from './types'

/**
 * Por qué se cortó una cadena de la oficina, como lo manda el Engine (un
 * código, nunca una frase): cada uno tiene su frase en el idioma del dueño.
 * Un código que esta versión no conoce se dice con la frase general.
 */
const REASONS = new Set([
  'too_many_hops',
  'too_many_mentions',
  'too_many_deliveries',
  'too_many_returns',
  'no_chief',
  'could_not_start',
  'wait_expired',
  'wait_cancelled',
  'unknown_name',
])

/** Saltos entre agentes que da una cadena antes de cortarse (D-31). */
export const CHAIN_MAX_HOPS = 8

export function chainReasonKey(reason: string | null | undefined): I18nKey {
  return (reason && REASONS.has(reason) ? `agency.chain.${reason}` : 'agency.chain.unknown') as I18nKey
}

/**
 * El mensaje con el que «Continuar» reanuda una cadena cortada: el último
 * que se escribió en ella (del dueño o de un agente), sin los avisos. El
 * dueño lo vuelve a publicar y empieza una cadena nueva, con sus saltos a
 * cero; null si la cadena no dejó texto que repetir.
 */
export function chainResumeText(messages: OfficeMessage[], chainId: string, before: string): string | null {
  const end = messages.findIndex((message) => message.id === before)
  const upto = end === -1 ? messages : messages.slice(0, end)
  for (let index = upto.length - 1; index >= 0; index--) {
    const message = upto[index]
    if (message.chain_id === chainId && !message.system && message.text.trim()) return message.text
  }
  return null
}
