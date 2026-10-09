import type { I18nKey } from '../../i18n'
import { isCommandError } from '../../services/engine'

type Translate = (key: I18nKey, vars?: Record<string, string | number>) => string

const KNOWN_KINDS = new Set(['environment', 'workflow', 'preference', 'fact', 'rule'])

/** Nombre visible del tipo; uno desconocido se muestra tal cual lo manda el Engine. */
export function kindLabel(kind: string | undefined, t: Translate): string {
  if (!kind) return ''
  return KNOWN_KINDS.has(kind) ? t(`memory.kind.${kind}` as I18nKey) : kind
}

/** Error de una acción de memoria en palabras del usuario, sin códigos cuando hay copia propia. */
export function memoryErrorMessage(error: unknown, t: Translate): string {
  if (isCommandError(error)) {
    if (error.code === 'TURN_RUNNING') return t('memory.error.turnRunning')
    if (error.code === 'CONFLICT') return t('memory.error.conflict')
    return error.message || error.code
  }
  return String(error)
}
