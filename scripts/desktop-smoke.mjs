#!/usr/bin/env node
// Smoke de arranque del host Electron (documento 02 §8).
//
// Abre Electron de verdad y comprueba que el renderer carga por el esquema
// propio con el puente puesto y sin fugas de Node. Es la diferencia entre
// «el proceso no se cayó» y «la app arranca».
//
// Necesita un display; en Linux sin sesión gráfica, `xvfb-run -a`.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN = join(ROOT, 'dist-electron/main.cjs')
const INDEX = join(ROOT, 'dist/index.html')

for (const [path, hint] of [
  [MAIN, 'npm run desktop:build'],
  [INDEX, 'npm run build'],
]) {
  if (!existsSync(path)) {
    console.error(`falta ${path.replace(ROOT, '.')}; ejecuta \`${hint}\` primero.`)
    process.exit(1)
  }
}

const electronBin = (await import('electron')).default
const home = mkdtempSync(join(tmpdir(), 'rinari-smoke-'))
// El perfil temporal se conserva sólo si la ejecución falla, que es cuando
// sirve para diagnosticar; si no, se acumularía uno por ejecución.
process.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Perfil aislado conservado en ${home}`)
    return
  }
  try {
    rmSync(home, { recursive: true, force: true })
  } catch (error) {
    console.error(`No se pudo borrar el perfil ${home}: ${error.message}`)
  }
})
const child = spawn(electronBin, [MAIN, `--user-data-dir=${join(home, 'profile')}`], {
  cwd: ROOT,
  env: { ...process.env, RINARI_SMOKE: '1', RINARI_HOME: join(home, 'engine') },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => (output += chunk.toString()))
child.stderr.on('data', (chunk) => (output += chunk.toString()))

const timer = setTimeout(() => {
  child.kill()
  console.error('el smoke no reportó en 60 s; salida:\n' + output.slice(-2000))
  process.exit(1)
}, 60_000)

child.on('exit', (code) => {
  clearTimeout(timer)
  const line = output.split('\n').find((entry) => entry.startsWith('RINARI_SMOKE '))
  if (!line) {
    console.error('el host no reportó el smoke; salida:\n' + output.slice(-2000))
    process.exit(1)
  }
  const report = JSON.parse(line.slice('RINARI_SMOKE '.length))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok || code !== 0) {
    console.error('smoke fallido')
    process.exit(1)
  }
  // Se afirma lo que se comprobó, no más: la app abre y su frontera está puesta.
  console.log(
    `el host abre, el renderer carga desde ${report.origin} con el puente puesto y sin fugas de Node.`,
  )
})
