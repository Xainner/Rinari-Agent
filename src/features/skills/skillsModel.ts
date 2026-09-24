import type { I18nKey } from '../../i18n'
import type { SkillEntry, SkillOrigin, SkillReview } from '../../services/engine'

/**
 * Modelo puro de la biblioteca de skills: filtros por origen, búsqueda y
 * qué merece un aviso. Sin React ni Engine: testeable.
 */
export const SKILL_FILTERS = ['all', 'rinari', 'installed', 'learned', 'project'] as const
export type SkillFilter = (typeof SKILL_FILTERS)[number]

export function filterSkills(entries: SkillEntry[], filter: SkillFilter, query = ''): SkillEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  return entries.filter((entry) =>
    (filter === 'all' || entry.origin === filter)
    && (!needle
      || entry.name.toLocaleLowerCase().includes(needle)
      || entry.description.toLocaleLowerCase().includes(needle)),
  )
}

export function countByOrigin(entries: SkillEntry[]): Record<SkillFilter, number> {
  const counts: Record<SkillFilter, number> = { all: entries.length, rinari: 0, installed: 0, learned: 0, project: 0 }
  for (const entry of entries) counts[entry.origin as SkillOrigin] += 1
  return counts
}

/** Motivo de aviso en la fila, o null: rota, con avisos o editada tras instalarla. */
export function attentionReason(entry: SkillEntry): 'invalid' | 'issues' | 'modified' | null {
  if (!entry.valid) return 'invalid'
  if (entry.issues.length > 0) return 'issues'
  if (entry.modified) return 'modified'
  return null
}

/** La revisión encontró algo: instalar exige confirmar este contenido exacto. */
export function needsConfirmation(review: SkillReview): boolean {
  return review.findings.length > 0
}

/** Hash que acompaña la instalación solo cuando hubo algo que confirmar. */
export function confirmedHash(review: SkillReview): string | undefined {
  return needsConfirmation(review) ? review.content_hash : undefined
}

const FINDING_KEYS: Record<string, I18nKey> = {
  PROMPT_INJECTION: 'skills.finding.PROMPT_INJECTION',
  REMOTE_CODE: 'skills.finding.REMOTE_CODE',
  EXFILTRATION: 'skills.finding.EXFILTRATION',
  SECRET_ACCESS: 'skills.finding.SECRET_ACCESS',
  DESTRUCTIVE: 'skills.finding.DESTRUCTIVE',
  OBFUSCATION: 'skills.finding.OBFUSCATION',
  HIDDEN_UNICODE: 'skills.finding.HIDDEN_UNICODE',
  EXECUTABLE_FILE: 'skills.finding.EXECUTABLE_FILE',
  LARGE_FILE: 'skills.finding.LARGE_FILE',
}

/** Texto del hallazgo; un código nuevo del Engine se muestra tal cual. */
export function findingKey(code: string): I18nKey | null {
  return FINDING_KEYS[code] ?? null
}

const IMPORT_KIND_KEYS: Record<string, I18nKey> = {
  claude: 'skills.kind.claude',
  codex: 'skills.kind.codex',
  agents: 'skills.kind.agents',
}

export function importKindKey(kind: string): I18nKey | null {
  return IMPORT_KIND_KEYS[kind] ?? null
}
