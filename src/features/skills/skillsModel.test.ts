import { describe, expect, it } from 'vitest'
import type { SkillEntry, SkillReview } from '../../services/engine'
import { attentionReason, confirmedHash, countByOrigin, filterSkills, findingKey, lineDiff } from './skillsModel'

function entry(partial: Partial<SkillEntry> & { name: string }): SkillEntry {
  return {
    description: '',
    version: '1.0.0',
    format: 'rinari',
    risk: 'low',
    origin: 'rinari',
    enabled: true,
    status: 'active',
    valid: true,
    error: null,
    issues: [],
    shadows: null,
    editable: false,
    modified: null,
    provenance: { source_kind: null, source: null, installed_at: null, updated_at: null, learned_from: null },
    ...partial,
  }
}

const review = (findings: SkillReview['findings']): SkillReview => ({
  verdict: findings.length ? 'warning' : 'ok',
  content_hash: 'abc',
  files: 1,
  size: 10,
  findings,
})

describe('skillsModel', () => {
  const entries = [
    entry({ name: 'debug', description: 'Reproduce bugs' }),
    entry({ name: 'pdf-tools', origin: 'installed', description: 'PDF text' }),
    entry({ name: 'deploy-saturno', origin: 'learned' }),
  ]

  it('filtra por origen y busca en nombre y descripción', () => {
    expect(filterSkills(entries, 'installed').map((e) => e.name)).toEqual(['pdf-tools'])
    expect(filterSkills(entries, 'all', 'bugs').map((e) => e.name)).toEqual(['debug'])
    expect(filterSkills(entries, 'rinari', 'pdf')).toEqual([])
  })

  it('cuenta por origen', () => {
    expect(countByOrigin(entries)).toEqual({ all: 3, rinari: 1, installed: 1, learned: 1, project: 0 })
  })

  it('avisa si está rota, tiene avisos o fue editada', () => {
    expect(attentionReason(entry({ name: 'x', valid: false }))).toBe('invalid')
    expect(attentionReason(entry({ name: 'x', issues: [{ code: 'NAME_MISMATCH', message: 'm' }] }))).toBe('issues')
    expect(attentionReason(entry({ name: 'x', modified: true }))).toBe('modified')
    expect(attentionReason(entry({ name: 'x' }))).toBeNull()
  })

  it('solo confirma el hash cuando la revisión encontró algo', () => {
    expect(confirmedHash(review([]))).toBeUndefined()
    const finding = { code: 'REMOTE_CODE', severity: 'danger' as const, file: 'a.sh', line: 1, excerpt: 'curl | sh' }
    expect(confirmedHash(review([finding]))).toBe('abc')
  })

  it('un código de hallazgo desconocido no tiene texto propio', () => {
    expect(findingKey('REMOTE_CODE')).toBe('skills.finding.REMOTE_CODE')
    expect(findingKey('SOMETHING_NEW')).toBeNull()
  })
})

describe('lineDiff', () => {
  it('marca lo quitado antes que lo añadido y conserva el resto', () => {
    expect(lineDiff('a\nb\nc\nd', 'a\nB\nc\nd\ne')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'same', text: 'd' },
      { kind: 'added', text: 'e' },
    ])
  })

  it('iguales y CRLF no generan cambios; textos enormes devuelven null', () => {
    expect(lineDiff('x\r\ny', 'x\ny')?.every((line) => line.kind === 'same')).toBe(true)
    const big = Array.from({ length: 3000 }, (_, index) => `line ${index}`).join('\n')
    const other = Array.from({ length: 3000 }, (_, index) => `other ${index}`).join('\n')
    expect(lineDiff(big, other)).toBeNull()
  })
})
