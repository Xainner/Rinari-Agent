#!/usr/bin/env node
// Arnés de la prueba vertical del browser nativo (documento 03 §3).
//
// Levanta la página de prueba determinista y el modelo falso en loopback, y
// abre Electron con un Engine real. Sin credenciales, sin servicios externos y
// con un home temporal: la prueba no toca los datos del usuario.
//
//   npm run browser:vertical

import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  <input id="adjunto" type="file">
  <p id="subido" data-name="" data-count="0">sin adjunto</p>
  <a id="bajar" href="/descarga">Bajar</a>
</div>
<script>
  window.__probe = { clicks: 0 };
  document.addEventListener('click', function () { window.__probe.clicks += 1; }, true);
  document.getElementById('adjunto').addEventListener('change', function (event) {
    var files = event.target.files;
    var out = document.getElementById('subido');
    out.setAttribute('data-count', String(files.length));
    out.setAttribute('data-name', files.length ? files[0].name : '');
    out.textContent = files.length ? 'adjunto: ' + files[0].name : 'sin adjunto';
  });
  document.getElementById('go').addEventListener('click', function () {
    var result = document.getElementById('result');
    result.textContent = 'aplicado: ' + document.getElementById('field').value;
    result.setAttribute('data-state', 'applied');
  });
</script></body></html>`

/**
 * El nombre que propone el servidor es **hostil a propósito** (BR-09): trae
 * salto de directorio, separadores de los dos sistemas y un nombre de
 * dispositivo de Windows. Si el host lo usara tal cual, el fichero acabaría
 * fuera del directorio de artefactos.
 */
const HOSTILE_DOWNLOAD_NAME = '../../CON.txt'
const DOWNLOAD_BODY = 'contenido-descargado-vertical'

const fixtureServer = createServer((request, response) => {
  if ((request.url ?? '').startsWith('/descarga')) {
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${HOSTILE_DOWNLOAD_NAME}"`,
      'Cache-Control': 'no-store',
    })
    response.end(DOWNLOAD_BODY)
    return
  }
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

// Pasos que el gate exige ver. Un informe al que le falte uno no es un PASS
// con menos cobertura: es un informe que no prueba lo que dice probar.
const REQUIRED_STEPS = ['V1', 'V2', 'V2d', 'BR10', 'V2b', 'V2p', 'V2c', 'V3', 'V4', 'V4b', 'V4c', 'V4d', 'V5', 'RETURN-AGENT-RACE', 'RETURN-AGENT-FOCUS', 'V6', 'V7a', 'V7', 'V7b', 'V7c', 'V9', 'V10', 'V11', 'V12', 'BR13', 'BR14', 'V8', 'TOAST-REAL', 'RESTART-USER']

// Perfil de Electron propio, no sólo home del Engine: el renderer guarda
// drafts y preferencias, y la sonda no debe tocar los del usuario.
const userData = mkdtempSync(join(tmpdir(), 'rinari-vertical-profile-'))

const electronBin = (await import('electron')).default
const child = spawn(electronBin, [MAIN, `--user-data-dir=${userData}`], {
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
    // La prueba de click-through necesita entrada real del sistema; el
    // script es de Windows y lo aporta el runner.
    ...(process.platform === 'win32'
      ? { RINARI_PROBE_PS1: join(ROOT, 'electron/probe/physicalClick.ps1') }
      : {}),
    // Un `RINARI_ENGINE_ARGS_JSON` del operador no puede ganarle al fixture.
    RINARI_ENGINE_ARGS_JSON: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  if (text.includes('RINARI_BROWSER_')) process.stdout.write(text)
})
child.stderr.on('data', (chunk) => (output += chunk.toString()))

/**
 * Suelta lo del test y dice si quedó algo sin limpiar.
 *
 * Un `catch` silencioso convertía un home retenido —es decir, un proceso hijo
 * todavía vivo— en una limpieza aparentemente correcta.
 */
async function cleanup() {
  await model.close()
  await new Promise((resolve) => fixtureServer.close(resolve))
  // `exit` del proceso principal no significa que sus auxiliares —GPU,
  // utility, renderers— hayan terminado, y en Windows los handles se liberan
  // al morir cada uno. Se espera a que se suelten de verdad; si a los 15 s
  // siguen tomados, eso **sí** es una fuga y se reporta.
  const leftovers = []
  for (const [label, dir] of [
    ['home del Engine', home],
    ['perfil de Electron', userData],
  ]) {
    const attempts = 30
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        rmSync(dir, { recursive: true, force: true })
        break
      } catch (error) {
        if (attempt === attempts - 1) leftovers.push(`${label}: ${error.code ?? error.message}`)
        else await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }
  return leftovers
}

const timer = setTimeout(async () => {
  child.kill()
  console.error('la prueba vertical no reportó en 900 s; salida:\n' + output.slice(-4000))
  await cleanup()
  process.exit(1)
}, 900_000)

child.on('exit', async (code) => {
  clearTimeout(timer)
  const line = output.split('\n').find((entry) => entry.startsWith('RINARI_BROWSER_VERTICAL '))
  if (!line) {
    console.error('la prueba no publicó informe; salida:\n' + output.slice(-4000))
    await cleanup()
    process.exit(1)
  }
  const report = JSON.parse(line.slice('RINARI_BROWSER_VERTICAL '.length))
  if (process.env.RINARI_VERTICAL_REPORT) {
    const revision = (directory) =>
      execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    let serialized = JSON.stringify({
      generated_at: new Date().toISOString(),
      platform: `${process.platform}-${process.arch}`,
      agent_revision: revision(ROOT),
      cli_revision: revision(CLI),
      ...report,
    }, null, 2)
    // La evidencia es reproducible y publicable: las rutas locales no forman
    // parte del resultado y no deben quedar grabadas en el repositorio.
    for (const [local, portable] of [
      [CLI, '<RINARI_CLI>'],
      [home, '<RINARI_HOME>'],
      [userData, '<ELECTRON_PROFILE>'],
      [process.env.USERPROFILE, '<USER_HOME>'],
    ]) {
      if (local) serialized = serialized.split(local).join(portable)
    }
    writeFileSync(
      process.env.RINARI_VERTICAL_REPORT,
      `${serialized}\n`,
      'utf8',
    )
  }

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

  // El veredicto no es `failed === 0`. Eso daba por bueno un informe al que
  // le faltaran pasos, o que los declarara `skipped` en el gate obligatorio.
  const seen = new Set((report.steps ?? []).map((step) => step.id))
  const missing = REQUIRED_STEPS.filter((id) => !seen.has(id))
  const skipped = (report.steps ?? []).filter((step) => step.status === 'skipped')
  const cleanupTimedOut = output.includes('RINARI_BROWSER_VERTICAL_CLEANUP timeout')
  const leftovers = await cleanup()

  const problems = []
  if (report.fatal) problems.push(`abortó: ${report.fatal}`)
  if (failed > 0) problems.push(`${failed} pasos fallidos`)
  if (missing.length) problems.push(`faltan pasos obligatorios: ${missing.join(', ')}`)
  if (cleanupTimedOut) problems.push('la limpieza del host no confirmó a tiempo')
  if (leftovers.length) problems.push(`quedaron recursos sin liberar: ${leftovers.join('; ')}`)
  if (code !== 0) problems.push(`el host salió con código ${code}`)

  // `skipped` no descalifica por sí solo —una plataforma puede no poder
  // ejecutar la entrada física—, pero se dice en alto para que nadie lo lea
  // como cobertura.
  for (const step of skipped) console.log(`– ${step.id} no se ejecutó: ${step.detail}`)

  if ((problems.length || report.fatal) && !process.env.RINARI_VERTICAL_QUIET) {
    console.log('\n--- salida del host y del Engine ---')
    console.log(output.slice(-6000))
  }

  if (problems.length) {
    console.error(`\nprueba vertical NO superada: ${problems.join(' · ')}`)
    process.exit(1)
  }
  console.log('limpieza confirmada y todos los pasos obligatorios presentes.')
  process.exit(0)
})
