import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { listBackups, pickBackup, restoreBackup } from './backToStable'

function home(): string {
  const root = mkdtempSync(join(tmpdir(), 'rinari-back-'))
  writeFileSync(join(root, 'state.db'), 'nightly')
  writeFileSync(join(root, 'state.db-wal'), 'wal')
  mkdirSync(join(root, 'policies'))
  writeFileSync(join(root, 'policies', 'approval_grants.json'), '{"nightly":true}')
  return root
}

function backup(root: string, name: string, db: string, policies?: string): void {
  const folder = join(root, 'backups', name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'state.db'), db)
  if (policies) {
    mkdirSync(join(folder, 'policies'))
    writeFileSync(join(folder, 'policies', 'approval_grants.json'), policies)
  }
}

describe('volver a la versión normal (#96)', () => {
  it('elige la primera copia que hizo la Nightly, no las de actualizaciones anteriores', () => {
    const root = home()
    backup(root, 'antes-de-migrar-0040-a-0049-20261001-100000', 'old 0.3 upgrade')
    backup(root, 'antes-de-migrar-0049-a-0057-20261014-120000', 'as the normal left it')
    backup(root, 'antes-de-migrar-0057-a-0060-20261017-090000', 'a later nightly')
    mkdirSync(join(root, 'backups', 'otra-cosa'))
    const found = listBackups(root)
    expect(found.map((item) => item.name)).toHaveLength(3)
    const picked = pickBackup(found, new Date(Date.UTC(2026, 9, 14, 12, 30)))
    expect(picked?.name).toBe('antes-de-migrar-0049-a-0057-20261014-120000')
    expect(picked?.from).toBe(49)
    expect(pickBackup(found, new Date(Date.UTC(2026, 9, 18)))).toBeNull()
  })

  it('restaura la copia y guarda lo de la Nightly sin borrar nada', async () => {
    const root = home()
    backup(root, 'antes-de-migrar-0049-a-0057-20261014-120000', 'as the normal left it', '{"normal":true}')
    const [picked] = listBackups(root)
    const kept = await restoreBackup(root, picked, new Date(Date.UTC(2026, 9, 17, 18, 5, 9)))
    expect(kept).toContain('antes-de-volver-a-la-normal-20261017-180509')
    expect(readFileSync(join(root, 'state.db'), 'utf8')).toBe('as the normal left it')
    expect(existsSync(join(root, 'state.db-wal'))).toBe(false)
    expect(readFileSync(join(root, 'policies', 'approval_grants.json'), 'utf8')).toBe('{"normal":true}')
    expect(readFileSync(join(kept, 'state.db'), 'utf8')).toBe('nightly')
    expect(readdirSync(kept).sort()).toEqual(['policies', 'state.db', 'state.db-wal'])
  })
})
