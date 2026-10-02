// Production Electron + real Engine, isolated state, local scripted model.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeModel } from './fake-model.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = mkdtempSync(join(tmpdir(), 'rinari-file-drag-'))
const output = resolve(root, 'release/evidence/composer-file-drag')
mkdirSync(output, { recursive: true })
writeFileSync(join(data, 'adjunto.txt'), 'Contenido de prueba del flujo de adjuntos.')
writeFileSync(join(data, 'imagen.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
const model = await startFakeModel([{ text: 'Adjunto recibido en el turno de prueba.' }])
const env = { ...process.env }
for (const key of ['RINARI_DEV_SERVER_URL', 'RINARI_PARITY', 'RINARI_SMOKE']) delete env[key]
Object.assign(env, {
  RINARI_HOME: join(data, 'engine'), FILE_DRAG_DATA: data, FILE_DRAG_OUTPUT: output,
  FILE_DRAG_MODEL: model.baseUrl, FILE_DRAG_KEEP: process.argv.includes('--keep') ? '1' : '',
})
writeFileSync(join(output, 'preview.json'), JSON.stringify({ root, data, model: model.baseUrl }, null, 2))
console.log('Isolated data: ' + data)
const electron = (await import('electron')).default
try {
  const code = await new Promise((done, reject) => {
    const child = spawn(electron, [join(root, 'tests/composer-file-drag/electron.cjs')], { cwd: root, env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', done)
  })
  process.exitCode = code ?? 1
} finally { await model.close() }
