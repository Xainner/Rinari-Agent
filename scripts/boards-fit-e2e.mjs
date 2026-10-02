// Full production Electron app + real Engine, with isolated UI and Engine data.
// Build first; set RINARI_ENGINE_BIN / ARGS_JSON / CWD as for desktop development.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = mkdtempSync(join(tmpdir(), 'rinari-boards-fit-'))
const output = resolve(root, 'release/evidence/boards-fit')
mkdirSync(output, { recursive: true })
const env = { ...process.env }
for (const key of ['RINARI_DEV_SERVER_URL', 'RINARI_PARITY', 'RINARI_SMOKE', 'RINARI_BROWSER_VERTICAL']) delete env[key]
const child = spawn((await import('electron')).default, [join(root, 'tests/boards-fit/electron.cjs')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...env,
    RINARI_HOME: join(data, 'engine'),
    BOARDS_FIT_PROFILE: join(data, 'profile'),
    BOARDS_FIT_OUTPUT: output,
    BOARDS_FIT_KEEP: process.argv.includes('--keep') ? '1' : '',
  },
})
console.log(`Isolated data: ${data}`)
child.on('exit', (code) => { process.exitCode = code ?? 1 })
child.on('error', (error) => { console.error(error); process.exitCode = 1 })
