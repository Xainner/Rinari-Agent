import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeModel } from './fake-model.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = mkdtempSync(join(tmpdir(), 'rinari-image-overlay-'))
const output = resolve(root, 'release/evidence/chat-image-overlay')
mkdirSync(output, { recursive: true })
const text = Array.from({ length: 60 }, (_, i) => `Párrafo ${i + 1}: Historial de prueba para desplazar la conversación mientras se revisa una imagen. El visor debe mantenerse fijo sobre la ventana.`).join('\n\n')
const model = await startFakeModel(Array.from({ length: 20 }, (_, i) => ({ text: text + `\n\nFIN DEL TURNO ${i + 1}` })))
writeFileSync(join(data, 'nota.txt'), Array.from({ length: 150 }, (_, i) => `Línea ${i + 1}: adjunto de texto con desplazamiento interno.`).join('\n'))
const env = { ...process.env }
for (const key of ['RINARI_DEV_SERVER_URL', 'RINARI_PARITY', 'RINARI_SMOKE']) delete env[key]
Object.assign(env, { RINARI_HOME: join(data, 'engine'), IMAGE_DATA: data, IMAGE_OUTPUT: output,
  IMAGE_MODEL: model.baseUrl, IMAGE_KEEP: process.argv.includes('--keep') ? '1' : '' })
writeFileSync(join(output, 'preview.json'), JSON.stringify({ root, data, model: model.baseUrl }, null, 2))
console.log('Isolated profile: ' + data)
try {
  const electron = (await import('electron')).default
  process.exitCode = await new Promise((done, reject) => {
    const child = spawn(electron, [join(root, 'tests/chat-image-overlay/electron.cjs')], { cwd: root, env, stdio: 'inherit' })
    child.on('error', reject); child.on('exit', code => done(code ?? 1))
  })
} finally { await model.close() }
