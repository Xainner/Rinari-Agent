// Real production app/Engine, with the repo's scripted model on loopback.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scriptedModel } from './fake-model.mjs'

const model = scriptedModel([{ text: 'El turno terminó después de quitar los paneles.' }])
let held = null
let hold = true
const server = createServer((req, res) => {
  if (req.url === '/__pending') { res.end(JSON.stringify(Boolean(held))); return }
  if (req.url === '/__release') {
    hold = false
    const wasConnected = held && !held.res.destroyed
    if (held) { model.handler(held.req, held.res); held.req.resume(); held = null }
    res.end(JSON.stringify({ wasConnected: Boolean(wasConnected) })); return
  }
  if (hold && req.url?.endsWith('/chat/completions')) { req.pause(); held = { req, res }; return }
  model.handler(req, res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const modelOrigin = `http://127.0.0.1:${server.address().port}`
const root = fileURLToPath(new URL('..', import.meta.url))
const data = mkdtempSync(join(tmpdir(), 'rinari-remove-all-'))
const output = resolve(root, 'release/evidence/boards-remove-all')
mkdirSync(output, { recursive: true })
const env = { ...process.env }
for (const key of ['RINARI_DEV_SERVER_URL', 'RINARI_PARITY', 'RINARI_SMOKE']) delete env[key]
Object.assign(env, {
  RINARI_HOME: join(data, 'engine'), REMOVE_ALL_DATA: data, REMOVE_ALL_OUTPUT: output,
  REMOVE_ALL_MODEL: modelOrigin, REMOVE_ALL_KEEP: process.argv.includes('--keep') ? '1' : '',
})
writeFileSync(join(output, 'preview.json'), JSON.stringify({ data, root, modelOrigin }, null, 2))
console.log(`Isolated data: ${data}`)
const electron = (await import('electron')).default
try {
  for (const phase of ['exercise', 'restart']) {
    const code = await new Promise((done, reject) => {
      const child = spawn(electron, [join(root, 'tests/boards-remove-all/electron.cjs')], {
        cwd: root, stdio: 'inherit', env: { ...env, REMOVE_ALL_PHASE: phase },
      })
      child.on('error', reject); child.on('exit', done)
    })
    if (code !== 0) { process.exitCode = code ?? 1; break }
  }
} finally { server.closeAllConnections(); server.close() }
