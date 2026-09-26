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

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

// Tope de celdas de la tabla LCS: una SKILL.md normal ronda las 150 líneas.
const DIFF_MAX_CELLS = 4_000_000

/**
 * Diferencia por líneas entre dos versiones de una SKILL.md (LCS), para revisar
 * lo que cambió en una actualización. null si los textos son demasiado grandes:
 * la vista cae entonces en mostrar ambas versiones completas.
 */
export function lineDiff(before: string, after: string): DiffLine[] | null {
  const a = before.replace(/\r\n/g, '\n').split('\n')
  const b = after.replace(/\r\n/g, '\n').split('\n')
  // Prefijo y sufijo comunes fuera de la tabla: casi toda edición es local.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const n = endA - start
  const m = endB - start
  if ((n + 1) * (m + 1) > DIFF_MAX_CELLS) return null
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = a[start + i] === b[start + j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const lines: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same', text }))
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      lines.push({ kind: 'same', text: a[start + i] })
      i += 1
      j += 1
    } else if (i < n && (j >= m || table[i + 1][j] >= table[i][j + 1])) {
      // Lo quitado antes que lo añadido, como en un diff unificado.
      lines.push({ kind: 'removed', text: a[start + i] })
      i += 1
    } else {
      lines.push({ kind: 'added', text: b[start + j] })
      j += 1
    }
  }
  for (const text of a.slice(endA)) lines.push({ kind: 'same', text })
  return lines
}
