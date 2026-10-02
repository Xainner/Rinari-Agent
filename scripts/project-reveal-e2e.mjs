// Production Electron + real Engine, with isolated projects, preferences and state.
// Build first. Use the usual RINARI_ENGINE_BIN / ARGS_JSON / CWD development env.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = mkdtempSync(join(tmpdir(), 'rinari-project-reveal-'))
const output = resolve(root, 'release/evidence/project-reveal')
mkdirSync(output, { recursive: true })
const env = { ...process.env }
for (const key of ['RINARI_DEV_SERVER_URL', 'RINARI_PARITY', 'RINARI_SMOKE']) delete env[key]
Object.assign(env, {
  RINARI_HOME: join(data, 'engine'),
  PROJECT_REVEAL_DATA: data,
  PROJECT_REVEAL_OUTPUT: output,
  PROJECT_REVEAL_KEEP: process.argv.includes('--keep') ? '1' : '',
})
writeFileSync(join(output, 'preview.json'), JSON.stringify({ data, root }, null, 2))
console.log(`Isolated data: ${data}`)
const electron = (await import('electron')).default
for (const phase of ['exercise', 'restart']) {
  const code = await new Promise((done, reject) => {
    const child = spawn(electron, [join(root, 'tests/project-reveal/electron.cjs')], {
      cwd: root, stdio: 'inherit', env: { ...env, PROJECT_REVEAL_PHASE: phase },
    })
    child.on('error', reject)
    child.on('exit', done)
  })
  if (code !== 0) { process.exitCode = code ?? 1; break }
}
