#!/usr/bin/env node
// Pruebas nativas de interfaz: la app de producción (`dist-electron`) con un
// Engine real, un perfil y un home temporales, y un modelo falso en loopback.
// No usa credenciales, ni el llavero del sistema, ni la red: el proxy apunta a
// un puerto muerto y solo el loopback queda exento.
//
//   npm run ui:e2e -- --list
//   npm run ui:e2e -- boards-fit [otro…]
//   npm run ui:e2e -- --all
//   npm run ui:e2e -- boards-fit --keep    deja la ventana abierta al final
//
// Antes: `npm run build` y `npm run desktop:build`. El Engine sale de
// `RINARI_ENGINE_BIN` (+ `RINARI_ENGINE_ARGS[_JSON]`, `RINARI_ENGINE_CWD`) si
// está definido; si no, de `uv run rinari` en el checkout `RINARI_CLI`, que
// debe estar en el `engine_git_sha` de `engine-manifest.json`.
//
// Las capturas y los informes quedan en `release/evidence/ui/<escenario>/`.
// Necesita un display; en Linux sin sesión gráfica, `xvfb-run -a`.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { scenarios } from '../tests/ui/scenarios.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN = join(ROOT, 'dist-electron/main.cjs')
const CLI = process.env.RINARI_CLI ?? join(ROOT, '..', '..', 'DEV', 'RInari-CLI')
const EVIDENCE = join(ROOT, 'release/evidence/ui')
const PHASE_TIMEOUT_MS = 6 * 60_000
const DEAD_PROXY = 'http://127.0.0.1:9'

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const names = args.includes('--all') ? Object.keys(scenarios) : args.filter((arg) => !arg.startsWith('--'))

if (args.includes('--list') || names.length === 0) {
  for (const [name, { title }] of Object.entries(scenarios)) console.log(`${name.padEnd(22)} ${title}`)
  if (names.length === 0 && !args.includes('--list')) {
    console.error('\nIndica uno o varios escenarios, o --all.')
    process.exitCode = 1
  }
  process.exit()
}
const unknown = names.filter((name) => !scenarios[name])
if (unknown.length) {
  console.error(`Escenarios desconocidos: ${unknown.join(', ')}. Usa --list.`)
  process.exit(1)
}
if (keep && names.length > 1) {
  console.error('--keep deja una ventana abierta: úsalo con un solo escenario.')
  process.exit(1)
}
if (!existsSync(MAIN) || !existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('Falta la app compilada; ejecuta `npm run build` y `npm run desktop:build` primero.')
  process.exit(1)
}

/** Entorno del Engine: el del operador si lo definió, si no el checkout del CLI. */
function engineEnv() {
  if (process.env.RINARI_ENGINE_BIN) return {}
  if (!existsSync(join(CLI, 'pyproject.toml'))) {
    console.error(`No encuentro el checkout de Rinari-CLI en ${CLI}; usa RINARI_CLI=<ruta> o RINARI_ENGINE_BIN.`)
    process.exit(1)
  }
  return { RINARI_ENGINE_BIN: 'uv', RINARI_ENGINE_ARGS: 'run rinari', RINARI_ENGINE_ARGS_JSON: '', RINARI_ENGINE_CWD: CLI }
}

function baseEnv() {
  const env = { ...process.env, ...engineEnv() }
  // Modos de otras pruebas que cambiarían el arranque de la app.
  for (const key of ['RINARI_DEV_SERVER_URL', 'RINARI_PARITY', 'RINARI_SMOKE', 'RINARI_BROWSER_VERTICAL']) delete env[key]
  Object.assign(env, {
    RINARI_KEYRING: '0',
    HTTP_PROXY: DEAD_PROXY, HTTPS_PROXY: DEAD_PROXY, ALL_PROXY: DEAD_PROXY,
    http_proxy: DEAD_PROXY, https_proxy: DEAD_PROXY, all_proxy: DEAD_PROXY,
    NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1',
  })
  return env
}

const electron = (await import('electron')).default

function runPhase(name, env) {
  return new Promise((resolve) => {
    const child = spawn(electron, [join(ROOT, 'tests/ui', name, 'scenario.cjs')], { cwd: ROOT, env, stdio: ['inherit', 'pipe', 'inherit'] })
    const timer = setTimeout(() => {
      console.error(`${name} (${env.RINARI_UI_PHASE}): sin terminar en ${PHASE_TIMEOUT_MS / 60_000} min; se detiene.`)
      child.kill()
    }, PHASE_TIMEOUT_MS)
    // A reviewed --keep window is no longer a running test. Keep the watchdog
    // until success, then leave the isolated app and provider alive for the owner.
    let tail = ''
    child.stdout.on('data', chunk => {
      process.stdout.write(chunk)
      tail = (tail + chunk.toString()).slice(-1000)
      if (keep && env.RINARI_UI_LAST_PHASE === '1' && tail.includes(`RINARI_UI_OK ${name} ${env.RINARI_UI_PHASE}`)) clearTimeout(timer)
    })
    child.on('error', (error) => { clearTimeout(timer); console.error(error); resolve(1) })
    child.on('exit', (code) => { clearTimeout(timer); resolve(code ?? 1) })
  })
}

async function runScenario(name) {
  const scenario = scenarios[name]
  const data = mkdtempSync(join(tmpdir(), `rinari-ui-${name}-`))
  const output = join(EVIDENCE, name)
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  scenario.fixtures?.(data)
  const model = scenario.model ? await scenario.model(data) : null
  const env = {
    ...baseEnv(),
    RINARI_HOME: join(data, 'engine'),
    RINARI_UI_NAME: name,
    RINARI_UI_DATA: data,
    RINARI_UI_OUTPUT: output,
    RINARI_UI_MODEL: model?.baseUrl ?? '',
    RINARI_UI_KEEP: keep ? '1' : '',
  }
  console.log(`\n▶ ${name} — ${scenario.title}\n  datos aislados: ${data}`)
  let code = 0
  try {
    for (const [index, phase] of scenario.phases.entries()) {
      const last = index === scenario.phases.length - 1
      code = await runPhase(name, { ...env, RINARI_UI_PHASE: phase, RINARI_UI_LAST_PHASE: last ? '1' : '' })
      if (code !== 0) break
    }
  } finally {
    await model?.close()
  }
  // Los datos solo sirven para diagnosticar un fallo o revisar con --keep.
  if (code === 0 && !keep) {
    // El Engine puede tardar en soltar sus archivos tras un turno: se reintenta
    // y, si sigue ocupado, se avisa sin convertir un escenario correcto en fallo.
    try {
      rmSync(data, { recursive: true, force: true, maxRetries: 60, retryDelay: 250 })
    } catch (error) {
      console.warn(`  no se pudieron borrar los datos de ${name} (${error.code ?? error.message}): ${data}`)
    }
  }
  else console.error(`  datos conservados en ${data}`)
  return code
}

const results = []
for (const name of names) results.push([name, await runScenario(name)])

console.log('\nResultado:')
for (const [name, code] of results) console.log(`  ${code === 0 ? 'OK   ' : 'FALLO'} ${name}`)
console.log(`Evidencias en ${EVIDENCE}`)
process.exitCode = results.some(([, code]) => code !== 0) ? 1 : 0
