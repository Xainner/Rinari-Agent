#!/usr/bin/env node
// Arnés de la prueba vertical del browser nativo (documento 03 §3).
//
// Levanta la página de prueba determinista y el modelo falso en loopback, y
// abre Electron con un Engine real. Sin credenciales, sin servicios externos y
// con un home temporal: la prueba no toca los datos del usuario.
//
//   npm run browser:vertical

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startFakeModel } from './fake-model.mjs'

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

/** La misma página determinista que usa la sonda de viabilidad. */
const FIXTURE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>fixture-vertical</title>
<style>html,body{margin:0;padding:0;height:100%;background:rgb(220,30,40);}
body{font:16px system-ui,sans-serif;color:#fff;} #panel{padding:24px;}
input,button{font-size:16px;padding:6px 10px;}</style></head>
<body><div id="panel">
  <input id="field" name="field" type="text" value="">
  <button id="go" type="button">Aplicar</button>
  <p id="result" data-state="pending">sin aplicar</p>
</div>
<script>
  window.__probe = { clicks: 0 };
  document.addEventListener('click', function () { window.__probe.clicks += 1; }, true);
  document.getElementById('go').addEventListener('click', function () {
    var result = document.getElementById('result');
    result.textContent = 'aplicado: ' + document.getElementById('field').value;
    result.setAttribute('data-state', 'applied');
  });
</script></body></html>`

const fixtureServer = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(FIXTURE)
})
await new Promise((resolve, reject) => {
  fixtureServer.once('error', reject)
  fixtureServer.listen(0, '127.0.0.1', resolve)
})
const fixtureUrl = `http://127.0.0.1:${fixtureServer.address().port}/fixture`

const model = await startFakeModel([])
const home = mkdtempSync(join(tmpdir(), 'rinari-vertical-'))

console.log(`fixture en ${fixtureUrl}`)
console.log(`modelo falso en ${model.origin}`)

const electronBin = (await import('electron')).default
const child = spawn(electronBin, [MAIN], {
  cwd: ROOT,
  env: {
    ...process.env,
    RINARI_BROWSER_VERTICAL: '1',
    RINARI_BROWSER_FIXTURE: fixtureUrl,
    RINARI_BROWSER_MODEL: model.origin,
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

async function cleanup() {
  await model.close()
  await new Promise((resolve) => fixtureServer.close(resolve))
  try {
    rmSync(home, { recursive: true, force: true })
  } catch {
    // El Engine puede seguir soltando el home un instante; no es del test.
  }
}

const timer = setTimeout(async () => {
  child.kill()
  console.error('la prueba vertical no reportó en 300 s; salida:\n' + output.slice(-4000))
  await cleanup()
  process.exit(1)
}, 300_000)

child.on('exit', async (code) => {
  clearTimeout(timer)
  const line = output.split('\n').find((entry) => entry.startsWith('RINARI_BROWSER_VERTICAL '))
  if (!line) {
    console.error('la prueba no publicó informe; salida:\n' + output.slice(-4000))
    await cleanup()
    process.exit(1)
  }
  const report = JSON.parse(line.slice('RINARI_BROWSER_VERTICAL '.length))

  if (report.fatal) {
    console.error(`la prueba abortó: ${report.fatal}`)
    console.error(output.slice(-3000))
  }
  for (const step of report.steps ?? []) {
    const mark = step.status === 'ok' ? '·' : step.status === 'failed' ? '✗' : '–'
    console.log(`${mark} ${step.id}  ${step.title}`)
    console.log(`   ${step.detail}`)
  }
  const { total, ok, failed } = report.summary ?? {}
  console.log(`\n${ok}/${total} pasos del §3 · ${failed} fallidos`)

  // Un paso fallido sin la salida del host y del Engine no se puede
  // diagnosticar; con `RINARI_VERTICAL_QUIET=1` se calla.
  if ((failed > 0 || report.fatal) && !process.env.RINARI_VERTICAL_QUIET) {
    console.log('\n--- salida del host y del Engine ---')
    console.log(output.slice(-6000))
  }

  await cleanup()
  process.exit(code === 0 && !report.fatal && failed === 0 ? 0 : 1)
})
