import type { I18nKey } from '../../i18n'
import type { ApprovalTimelineItem } from './types'

type Translate = (key: I18nKey, vars?: Record<string, string | number>) => string

/** La regla del Engine que pidió la aprobación, en palabras de quien decide. */
const RULE_TITLE: Record<string, I18nKey> = {
  network_send: 'approval.rule.networkSend',
  network_host: 'approval.rule.networkHost',
  write_outside_root: 'approval.rule.writeOutside',
  shell_external_mutation: 'approval.rule.shellOutside',
  git_remote_mutation: 'approval.rule.gitPush',
  git_force_push: 'approval.rule.forcePush',
  delete_outside_root: 'approval.rule.deleteOutside',
  system_secret: 'approval.rule.secret',
  external_content_send: 'approval.rule.externalSend',
  mcp_call: 'approval.rule.mcp',
  browser_interact: 'approval.rule.browser',
  browser_upload: 'approval.rule.upload',
  preexisting_user_work: 'approval.rule.userWork',
  'peer-message': 'approval.rule.peer',
  unknown_capability: 'approval.rule.unknown',
}

const RISK: Record<string, I18nKey> = {
  low: 'approval.risk.low',
  medium: 'approval.risk.medium',
  high: 'approval.risk.high',
  critical: 'approval.risk.critical',
}

export interface ApprovalCopy {
  title: string
  /** Herramienta que lo pidió (`http.request`), cuando el Engine la nombra. */
  tool: string | null
  /** Aviso extra para las reglas que lo merecen (contenido externo). */
  note: string | null
  risk: string
}

/**
 * Título legible de una aprobación. Las reglas conocidas se traducen; una que
 * no conocemos (un Engine más nuevo) conserva el texto del Engine.
 */
export function approvalCopy(item: ApprovalTimelineItem, t: Translate): ApprovalCopy {
  const description = item.description || item.capability
  const separator = description.indexOf(': ')
  const tool = separator > 0 && !description.slice(0, separator).includes(' ') ? description.slice(0, separator) : null
  const key = item.ruleId ? RULE_TITLE[item.ruleId] : undefined
  return {
    title: key ? t(key, { target: item.target ?? '', capability: item.capability }) : description,
    tool: key ? tool : null,
    note: item.ruleId === 'external_content_send' ? t('approval.note.externalSend') : null,
    risk: RISK[item.risk] ? t(RISK[item.risk]) : item.risk,
  }
}
