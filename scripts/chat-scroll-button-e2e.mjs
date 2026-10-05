// Real Electron/Engine with a local scripted response and isolated profile.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeModel } from './fake-model.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = mkdtempSync(join(tmpdir(), 'rinari-scroll-button-'))
const output = resolve(root, 'release/evidence/chat-scroll-button')
mkdirSync(output, { recursive: true })
const text = Array.from({ length: 80 }, (_, i) => 'Párrafo ' + (i + 1) + ': Historial de prueba para comprobar el desplazamiento y la posición de la flecha junto al cuadro de mensaje.').join('\n\n') + '\n\nFIN DEL HISTORIAL DE PRUEBA'
const model = await startFakeModel(Array.from({ length: 20 }, () => ({ text })))
const env = { ...process.env }
for (const key of ['RINARI_DEV_SERVER_URL', 'RINARI_PARITY', 'RINARI_SMOKE']) delete env[key]
Object.assign(env, { RINARI_HOME: join(data, 'engine'), SCROLL_DATA: data, SCROLL_OUTPUT: output,
  SCROLL_MODEL: model.baseUrl, SCROLL_KEEP: process.argv.includes('--keep') ? '1' : '' })
writeFileSync(join(output, 'preview.json'), JSON.stringify({ root, data, model: model.baseUrl }, null, 2))
console.log('Isolated profile: ' + data)
const electron = (await import('electron')).default
try {
  process.exitCode = await new Promise((done, reject) => {
    const child = spawn(electron, [join(root, 'tests/chat-scroll-button/electron.cjs')], { cwd: root, env, stdio: 'inherit' })
    child.on('error', reject); child.on('exit', code => done(code ?? 1))
  })
} finally { await model.close() }
