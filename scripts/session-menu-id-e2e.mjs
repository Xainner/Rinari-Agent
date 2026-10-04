import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = mkdtempSync(join(tmpdir(), 'rinari-session-menu-'))
const output = resolve(root, 'release/evidence/session-menu-id')
mkdirSync(output, { recursive: true })
const env = { ...process.env }
for (const key of ['RINARI_DEV_SERVER_URL', 'RINARI_PARITY', 'RINARI_SMOKE']) delete env[key]
Object.assign(env, { RINARI_HOME: join(data, 'engine'), MENU_DATA: data, MENU_OUTPUT: output,
  MENU_KEEP: process.argv.includes('--keep') ? '1' : '' })
writeFileSync(join(output, 'preview.json'), JSON.stringify({ root, data }, null, 2))
console.log('Isolated profile: ' + data)
const electron = (await import('electron')).default
process.exitCode = await new Promise((done, reject) => {
  const child = spawn(electron, [join(root, 'tests/session-menu-id/electron.cjs')], { cwd: root, env, stdio: 'inherit' })
  child.on('error', reject); child.on('exit', code => done(code ?? 1))
})
