#!/usr/bin/env node
// Paridad del host Electron contra el Engine real (documento 02 §8).
//
// Abre Electron, arranca el Engine desde un checkout local en un `RINARI_HOME`
// temporal y ejercita un comando por módulo del inventario más un turno con un
// **proveedor falso** (`http://127.0.0.1:9/v1`, sin credenciales). El turno
// debe aceptarse y fallar al conectar: eso recorre el pipeline entero sin
// salir de la máquina ni gastar en un proveedor real.
//
//   RINARI_CLI=<ruta al checkout> node scripts/desktop-parity-e2e.mjs
//
// Necesita un display; en Linux sin sesión gráfica, `xvfb-run -a`.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN = join(ROOT, 'dist-electron/main.cjs')
const CLI = process.env.RINARI_CLI ?? join(ROOT, '..', '..', 'DEV', 'RInari-CLI')

if (!existsSync(MAIN)) {
  console.error('falta dist-electron/main.cjs; ejecuta `npm run desktop:build` primero.')
  process.exit(1)
}
if (!existsSync(join(CLI, 'pyproject.toml'))) {
  console.error(`no encuentro el checkout de Rinari-CLI en ${CLI}; usa RINARI_CLI=<ruta>.`)
  process.exit(1)
}

// Home temporal: la prueba no toca los datos del usuario.
const home = mkdtempSync(join(tmpdir(), 'rinari-parity-'))
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
const electronBin = (await import('electron')).default
const child = spawn(electronBin, [MAIN, `--user-data-dir=${join(home, 'profile')}`], {
  cwd: ROOT,
  env: {
    ...process.env,
    RINARI_PARITY: '1',
    RINARI_HOME: home,
    RINARI_ENGINE_BIN: 'uv',
    RINARI_ENGINE_ARGS: 'run rinari',
    RINARI_ENGINE_CWD: CLI,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => (output += chunk.toString()))
child.stderr.on('data', (chunk) => (output += chunk.toString()))

const timer = setTimeout(() => {
  child.kill()
  console.error('la sonda no reportó en 240 s; salida:\n' + output.slice(-3000))
  process.exit(1)
}, 240_000)

child.on('exit', () => {
  clearTimeout(timer)
  const line = output.split('\n').find((entry) => entry.startsWith('RINARI_PARITY '))
  if (!line) {
    console.error('el host no reportó; salida:\n' + output.slice(-3000))
    process.exit(1)
  }
  const report = JSON.parse(line.slice('RINARI_PARITY '.length))
  console.log(JSON.stringify(report, null, 2))

  const problems = []
  if (report.started !== 'ready') problems.push(`el Engine no llegó a ready: ${report.started}`)
  for (const call of report.calls ?? []) {
    if (!call.ok) problems.push(`${call.name}: ${call.code} ${call.message}`)
  }
  // El turno tiene que **llegar a su estado terminal**, no solo aceptarse: con
  // el proveedor falso eso es `turn.failed`, que prueba el pipeline entero.
  const events = report.turn?.events ?? []
  if (report.turn?.error) problems.push(`turno: ${report.turn.error}`)
  else if (!events.includes('turn.started')) problems.push('el turno no arrancó')
  else if (!events.includes('turn.failed') && !events.includes('turn.completed')) {
    problems.push(`el turno no alcanzó un estado terminal: ${events.join(', ')}`)
  }

  if (problems.length) {
    console.error('\nparidad fallida:')
    for (const problem of problems) console.error(`  ${problem}`)
    process.exit(1)
  }
  console.log(
    `\n${report.calls.length} comandos de los doce módulos respondieron por el puente, y un turno real ` +
      `recorrió ${events.join(' → ')} contra un proveedor falso.`,
  )
})
