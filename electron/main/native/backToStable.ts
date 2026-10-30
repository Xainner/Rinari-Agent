/**
 * «Volver a la versión normal» desde la Nightly (#96, idea-nightly.md).
 *
 * La Nightly comparte `~/.rinari` con la normal y su Engine migra `state.db`
 * hacia adelante; desde ahí la normal no abre la base. Antes de cada migración
 * el Engine deja una copia en `~/.rinari/backups/antes-de-migrar-AAAA-a-BBBB-<fecha>`.
 * Volver es restaurar la primera de esas copias que hizo la Nightly (la base tal
 * como la dejó la normal) con el Engine apagado. Lo actual no se borra: se
 * guarda antes en `backups/antes-de-volver-a-la-normal-<fecha>`.
 */
import { existsSync, readdirSync } from 'node:fs'
import { cp, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

export interface StateBackup {
  name: string
  path: string
  /** Versión de esquema de la copia y a la que se iba a migrar. */
  from: number
  to: number
  createdAt: Date
}

const BACKUP_NAME = /^antes-de-migrar-(\d{4})-a-(\d{4})-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/
/** Lo que el Engine copia antes de migrar (`application/context.py`). */
const STATE_FILES = ['state.db', 'state.db-wal', 'state.db-shm']
const EXTRA_DIRS = ['policies']

export function listBackups(home: string): StateBackup[] {
  const root = join(home, 'backups')
  if (!existsSync(root)) return []
  const found: StateBackup[] = []
  for (const name of readdirSync(root)) {
    const match = BACKUP_NAME.exec(name)
    if (!match || !existsSync(join(root, name, 'state.db'))) continue
    const [, from, to, y, mo, d, h, mi, s] = match
    found.push({ name, path: join(root, name), from: Number(from), to: Number(to), createdAt: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) })
  }
  return found.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

/**
 * La copia de la base como la dejó la normal: la primera que se hizo desde que
 * existe la Nightly (su carpeta de datos), con una hora de margen. Sin ninguna,
 * no hay a qué volver.
 */
export function pickBackup(backups: StateBackup[], nightlySince: Date): StateBackup | null {
  const since = nightlySince.getTime() - 3_600_000
  return backups.find((backup) => backup.createdAt.getTime() >= since) ?? null
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

/** Con el Engine apagado: guarda lo actual y pone la copia en su lugar. */
export async function restoreBackup(home: string, backup: StateBackup, now = new Date()): Promise<string> {
  const keep = join(home, 'backups', `antes-de-volver-a-la-normal-${stamp(now)}`)
  await mkdir(keep, { recursive: true })
  for (const file of [...STATE_FILES, ...EXTRA_DIRS]) {
    if (existsSync(join(home, file))) await rename(join(home, file), join(keep, file))
  }
  await cp(join(backup.path, 'state.db'), join(home, 'state.db'))
  for (const dir of EXTRA_DIRS) {
    if (existsSync(join(backup.path, dir))) await cp(join(backup.path, dir), join(home, dir), { recursive: true })
  }
  // Un `-wal` suelto de la copia no existe (el Engine la hace con `backup()`), pero por si acaso.
  for (const file of STATE_FILES.slice(1)) await rm(join(home, file), { force: true })
  return keep
}

/** El ejecutable de la versión normal instalada para este usuario, si está. */
export function stableExecutable(localAppData = process.env.LOCALAPPDATA ?? ''): string | null {
  const exe = join(localAppData, 'Programs', 'Rinari Agent', 'rinari-agent.exe')
  return localAppData && existsSync(exe) ? exe : null
}
