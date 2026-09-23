#!/usr/bin/env node
// Qué partes del job de empaquetado de Windows necesita un cambio.
//
// Ese job tarda unos 27 minutos y casi nada es del instalador: 13 son el E2E
// del updater, 8 el paquete con el sidecar del Engine y 4 el Rust del
// bootstrapper. Ejecutarlo entero para un cambio de documentación no
// comprueba nada que `frontend` no compruebe ya.
//
// Cada parte se ejecuta sólo si cambió algo que pueda romperla. En push a
// `main`, en `workflow_dispatch` y con la etiqueta `ci:full` corre todo: un
// fallo que sólo aparezca al empaquetar se detecta, como tarde, al fusionar.
//
// Imprime `clave=valor` para `$GITHUB_OUTPUT`.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Cambiar el propio CI o este script puede afectar a cualquier parte. */
const CI_ITSELF = ['.github/workflows/agent-ci.yml', 'scripts/ci-scope.mjs']

/** Rust del bootstrapper: `cargo fmt`, `clippy` y `test`. */
const BOOTSTRAPPER = ['installer/setup/', ...CI_ITSELF]

/**
 * Paquete de revisión y smoke de la app instalada: sidecar del Engine,
 * payload de Electron, setup, instalación, arranque y desinstalación. Un
 * cambio sólo del renderer (`src/`) no entra: `frontend` ya lo construye y
 * arranca la app construida por `app://` (`desktop:smoke`).
 */
const PACKAGE = [
  'electron/',
  'build/',
  'installer/',
  'electron-builder.yml',
  'engine-manifest.json',
  'package.json',
  'package-lock.json',
  'scripts/package-*',
  'scripts/finalize-setup.ps1',
  'scripts/hash-package-inputs.mjs',
  'scripts/compose-installer-art.ps1',
  'scripts/run-setup-tauri.mjs',
  'scripts/build-desktop.mjs',
  ...CI_ITSELF,
]

/** E2E del updater (dos versiones empaquetadas) y `package:win:staged`. */
const UPDATER = [
  'electron/main/updates/',
  'build/app-update.yml',
  'electron-builder.yml',
  'package.json',
  'package-lock.json',
  'scripts/updater-e2e.ps1',
  'scripts/package-test-version.ps1',
  'scripts/package-release.ps1',
  'scripts/generate-update-metadata.mjs',
  ...CI_ITSELF,
]

/** `dir/` y `prefijo*` coinciden por prefijo; lo demás, por ruta exacta. */
const matches = (file, pattern) =>
  pattern.endsWith('/') ? file.startsWith(pattern)
    : pattern.endsWith('*') ? file.startsWith(pattern.slice(0, -1))
      : file === pattern

const touches = (files, patterns) => files.some((file) => patterns.some((pattern) => matches(file, pattern)))

/** Decide las partes a partir de los ficheros cambiados. */
export function classify(files) {
  const bootstrapper = touches(files, BOOTSTRAPPER)
  const updater = touches(files, UPDATER)
  // El setup va dentro del paquete, y el E2E del updater empaqueta sobre el
  // sidecar del Engine y el payload: cualquiera de los dos arrastra el
  // paquete de revisión y su smoke instalado.
  const pkg = bootstrapper || updater || touches(files, PACKAGE)
  return { bootstrapper, package: pkg, updater }
}

/** Todo, sin mirar los ficheros. */
export const EVERYTHING = { bootstrapper: true, package: true, updater: true }

export function scopeFor({ event, full, files }) {
  if (event !== 'pull_request' || full) return { ...EVERYTHING, reason: event !== 'pull_request' ? event : 'ci:full' }
  return { ...classify(files), reason: 'paths' }
}

function changedFiles(base, head) {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' })
  return out.split('\n').map((line) => line.trim()).filter(Boolean)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const event = process.env.EVENT ?? ''
  const full = process.env.FULL === 'true'
  const files = event === 'pull_request' && !full ? changedFiles(process.env.BASE, process.env.HEAD) : []
  const scope = scopeFor({ event, full, files })
  for (const [key, value] of Object.entries(scope)) console.log(`${key}=${value}`)
  console.error(`ci-scope (${scope.reason}): ${files.length} ficheros → ${JSON.stringify(scope)}`)
}
