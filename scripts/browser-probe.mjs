#!/usr/bin/env node
// Ejecuta la sonda de viabilidad del browser nativo (documento 03 §3).
//
// Publica el informe en `docs/architecture/browser-native.probe.json` para que
// las afirmaciones de `browser-native.md` tengan de dónde salir. La sonda mide
// composición real de ventanas, así que necesita un display; en Linux sin
// sesión gráfica, `xvfb-run -a`.
//
//   npm run browser:probe

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROBE = join(ROOT, 'dist-electron/browser-probe.cjs')
const OUT = join(ROOT, 'docs/architecture/browser-native.probe.json')

if (!existsSync(PROBE)) {
  console.error('falta dist-electron/browser-probe.cjs; ejecuta `npm run desktop:build` primero.')
  process.exit(1)
}

const electronBin = (await import('electron')).default

// La barrera nativa del §7 solo se puede medir con entrada real del sistema.
// Ese trozo es de Windows —que es el criterio de aceptación de la entrega E— y
// mueve el puntero un instante antes de devolverlo a su sitio.
const PS1 = join(ROOT, 'electron/probe/physicalClick.ps1')

/** Una ejecución de la sonda; devuelve su informe o falla con la salida cruda. */
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(electronBin, [PROBE, ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(process.platform === 'win32' ? { RINARI_PROBE_PS1: PS1 } : {}) },
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk.toString()))
    child.stderr.on('data', (chunk) => (output += chunk.toString()))

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`la sonda no reportó en 120 s; salida:\n${output.slice(-2000)}`))
    }, 120_000)

    child.on('exit', (code) => {
      clearTimeout(timer)
      const line = output.split('\n').find((entry) => entry.startsWith('RINARI_BROWSER_PROBE '))
      if (!line) {
        reject(new Error(`la sonda no publicó informe; salida:\n${output.slice(-3000)}`))
        return
      }
      resolve({ report: JSON.parse(line.slice('RINARI_BROWSER_PROBE '.length)), code })
    })
  })
}

const { report, code } = await run([])

// El §8.2 pide comprobar la transformación a 100/125/150/200 %. El factor no
// se cambia en caliente: se fija por proceso, así que cada uno es una
// ejecución. Solo se repite la medida de unidades, no la sonda entera.
const scaleSweep = []
for (const factor of [1, 1.25, 1.5, 2]) {
  try {
    const pass = await run(['--dpi-only', `--force-device-scale-factor=${factor}`])
    const dpi = (pass.report.checks ?? []).find((check) => check.id === 'DPI-01')
    const clip = (pass.report.checks ?? []).find((check) => check.id === 'CLIP-01')
    scaleSweep.push({
      forcedScaleFactor: factor,
      reportedScaleFactor: pass.report.scaleFactor,
      dpi: dpi ? { status: dpi.status, detail: dpi.detail } : null,
      logicalViewportHeld: clip?.status === 'ok',
    })
  } catch (error) {
    scaleSweep.push({ forcedScaleFactor: factor, error: String(error.message ?? error) })
  }
}
report.scaleSweep = scaleSweep

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`)

for (const check of report.checks ?? []) {
  const mark = check.status === 'ok' ? '·' : check.status === 'failed' ? '✗' : '?'
  console.log(`${mark} ${check.id}  ${check.question}`)
  console.log(`   ${check.finding}`)
}

console.log('\nbarrido de escala (§8.2):')
for (const pass of scaleSweep) {
  if (pass.error) {
    console.log(`  ${pass.forcedScaleFactor}x  no ejecutado: ${pass.error.split('\n')[0]}`)
    continue
  }
  const inner = pass.dpi?.detail?.innerSize
  const shot = pass.dpi?.detail?.capturePageSize
  console.log(
    `  ${pass.forcedScaleFactor}x  bounds→innerSize ${inner ? inner.join('×') : '?'}` +
      `  captura ${shot ? `${shot.width}×${shot.height}` : '?'}` +
      `  viewport lógico ${pass.logicalViewportHeld ? 'conservado' : 'ROTO'}`,
  )
}

const { total, ok, failed, inconclusive } = report.summary ?? {}
console.log(
  `\n${ok}/${total} respondidas · ${failed} fallidas · ${inconclusive} sin concluir` +
    `\ninforme en ${OUT.replace(ROOT, '.')}`,
)

// Una sonda de viabilidad informa; que una hipótesis se caiga es un resultado,
// no un error de ejecución. Solo el fallo del proceso lo es.
if (code !== 0) process.exit(1)
