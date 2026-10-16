#!/usr/bin/env node
// Rinari Agent Nightly local (docs/planes/idea-nightly.md): arma la app de esta
// rama con el Engine de la punta de la rama del CLI, la empaqueta con su propia
// identidad y la instala junto a la normal. Nada sale de la PC.
//
//   npm run nightly                       pruebas rápidas, build e instalación
//   npm run nightly -- --skip-tests       sin las pruebas rápidas
//   npm run nightly -- --no-install       deja el instalador en release/nightly
//   npm run nightly -- --cli <ruta>       otro checkout del CLI (por defecto ../v032-cli)
//   npm run nightly -- --allow-dirty      acepta cambios sin commit en el CLI
//
// Comparte `~/.rinari` con la normal: una sola puede estar abierta (la app lo
// comprueba y el Engine tiene su candado), y antes de una migración nueva el
// Engine copia la base a `~/.rinari/backups/`.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const CLI = resolve(option('--cli') ?? process.env.RINARI_NIGHTLY_CLI ?? join(ROOT, '..', 'v032-cli'))
const BASE_VERSION = process.env.RINARI_NIGHTLY_BASE ?? '0.4.0'
const INSTALL_DIR = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Rinari Agent Nightly')

function step(title) {
  console.log(`\n== ${title}`)
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    // Sin stdin: corrido desde un shell en segundo plano, PowerShell espera
    // la entrada al terminar y no sale nunca.
    stdio: ['ignore', options.capture ? 'pipe' : 'inherit', 'inherit'],
    // npm y npx son .cmd en Windows; el resto se lanza sin shell para que
    // argumentos como el JSON de Tauri lleguen intactos.
    shell: process.platform === 'win32' && (command === 'npm' || command === 'npx'),
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} terminó con ${result.status ?? result.signal}`)
  }
  return (result.stdout ?? '').trim()
}

const git = (repo, ...rest) => run('git', ['-C', repo, ...rest], { capture: true })
const powershell = (file, rest = [], env = {}) =>
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...rest], { env })

function isImageRunning(image) {
  const result = spawnSync('tasklist.exe', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  return result.status === 0 && result.stdout.toLowerCase().includes(`"${image}"`)
}

function stamp() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`
}

function main() {
  if (process.platform !== 'win32') throw new Error('La Nightly local se arma en Windows.')

  step('Comprobaciones')
  if (!existsSync(join(CLI, 'pyproject.toml'))) throw new Error(`No encuentro el CLI en ${CLI} (usa --cli <ruta>).`)
  const cliSha = git(CLI, 'rev-parse', 'HEAD')
  const cliBranch = git(CLI, 'rev-parse', '--abbrev-ref', 'HEAD')
  const agentSha = git(ROOT, 'rev-parse', 'HEAD')
  const agentBranch = git(ROOT, 'rev-parse', '--abbrev-ref', 'HEAD')
  const cliDirty = git(CLI, 'status', '--porcelain') !== ''
  if (cliDirty && !flag('--allow-dirty')) {
    throw new Error('El CLI tiene cambios sin commit. Haz commit o usa --allow-dirty.')
  }
  const version = `${BASE_VERSION}-nightly.${stamp()}`
  console.log(`Agent ${agentBranch} ${agentSha.slice(0, 7)} · CLI ${cliBranch} ${cliSha.slice(0, 7)}${cliDirty ? ' (con cambios)' : ''}`)
  console.log(`Versión: ${version}`)

  if (!flag('--skip-tests')) {
    step('Pruebas rápidas del CLI')
    run('uv', ['run', 'ruff', 'check', '.'], { cwd: CLI })
    run('uv', ['run', 'pytest', '-q', '-p', 'no:cacheprovider'], { cwd: CLI })
    step('Pruebas rápidas de la app')
    run('npx', ['tsc'])
    run('npm', ['run', 'typecheck:electron'])
    run('npx', ['vitest', 'run'])
  }

  const nightlyEnv = {
    RINARI_BUILD_CHANNEL: 'nightly',
    VITE_RINARI_CHANNEL: 'nightly',
    VITE_RINARI_ENGINE_SHA: cliSha,
    VITE_RINARI_SETUP_NIGHTLY: '1',
    RINARI_SETUP_NIGHTLY: '1',
    RINARI_SETUP_VERSION: version,
  }

  step('Engine de la rama del CLI')
  const sourceFile = join(ROOT, 'engine-dist', 'ENGINE_SOURCE.json')
  const current = existsSync(sourceFile) ? JSON.parse(readFileSync(sourceFile, 'utf8').replace(/^\uFEFF/, '')) : null
  if (current?.nightly && current.base_git_sha === cliSha && !current.dirty && !cliDirty) {
    console.log('engine-dist ya es de este commit: se reutiliza.')
  } else {
    powershell('scripts/package-engine.ps1', ['-CliRepo', CLI, '-OutDir', 'engine-dist', '-Nightly', ...(cliDirty ? ['-Development'] : [])])
  }
  // Los hashes cubren el Engine y los gráficos del instalador (los de la luna).
  run('npm', ['run', 'installer:art'], { env: nightlyEnv })
  run(process.execPath, ['scripts/hash-package-inputs.mjs'])


  step('App')
  run('npx', ['vite', 'build'], { env: nightlyEnv })
  run(process.execPath, ['scripts/build-desktop.mjs'], { env: nightlyEnv })
  const main = readFileSync(join(ROOT, 'dist-electron', 'main.cjs'), 'utf8')
  if (!main.includes('"com.rinari.agent.nightly"')) throw new Error('El proceso principal no quedó marcado como Nightly.')
  run('npx', ['electron-builder', '--config', 'electron-builder.nightly.cjs', '--win', 'dir', '--x64', '--publish', 'never'], {
    env: { RINARI_NIGHTLY_VERSION: version },
  })

  step('Instalador')
  powershell('scripts/package-setup-payload.ps1', ['-Version', version, '-Nightly'])
  const tauriConfig = JSON.stringify({ productName: 'Rinari Agent Nightly Setup', identifier: 'com.rinari.agent.nightly.setup' })
  run(process.execPath, ['scripts/run-setup-tauri.mjs', 'build', '--no-bundle', '--config', tauriConfig], { env: nightlyEnv })
  powershell('scripts/finalize-setup.ps1', ['-Version', version, '-Nightly'])
  const setup = join(ROOT, 'release', 'nightly', `Rinari-Agent-Nightly-Setup-${version}-x64.exe`)
  if (!existsSync(setup)) throw new Error(`No se generó ${setup}`)

  if (flag('--no-install')) {
    console.log(`\nInstalador: ${setup}`)
    return
  }
  step('Instalación')
  if (isImageRunning('rinari-agent-nightly.exe')) {
    throw new Error('Rinari Agent Nightly está abierta: ciérrala (también desde la bandeja) y vuelve a correr npm run nightly.')
  }
  run(setup, ['--silent-install', INSTALL_DIR])
  // La instalación silenciosa no crea accesos directos; se crean con el mismo
  // nombre que usa el instalador, así que desinstalar también los quita.
  const shortcuts = [
    `[Environment]::GetFolderPath('Programs')`,
    `[Environment]::GetFolderPath('Desktop')`,
  ].map((folder) => `$l = $s.CreateShortcut((Join-Path (${folder}) 'Rinari Agent Nightly.lnk')); $l.TargetPath = $exe; $l.WorkingDirectory = $dir; $l.Save()`)
  run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `$dir = '${INSTALL_DIR}'; $exe = Join-Path $dir 'rinari-agent-nightly.exe'; $s = New-Object -ComObject WScript.Shell; ${shortcuts.join('; ')}`,
  ])
  console.log(`\nRinari Agent Nightly ${version} instalada en ${INSTALL_DIR}`)
  console.log(`Engine: CLI ${cliBranch} ${cliSha.slice(0, 7)}. Comparte ~/.rinari con la normal: abre solo una a la vez.`)
}

try {
  main()
} catch (error) {
  console.error(`\n[nightly] ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
