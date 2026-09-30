#!/usr/bin/env node
// Cambia la versión de Rinari Agent en todos los sitios que la llevan.
//
// `package.json` es la fuente (package-release.ps1 la lee y se la pasa al
// instalador), pero el instalador, su crate y los valores por defecto de los
// scripts de empaquetado la repiten. Un release publicado con una de ellas
// atrasada anunciaría una versión y registraría otra.
//
//   node scripts/bump-version.mjs 0.2.1

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Cada sitio: su archivo y la expresión que captura la versión. */
export const VERSION_SITES = [
  { file: 'package.json', pattern: /("version":\s*")([^"]+)(")/ },
  { file: 'package-lock.json', pattern: /("name":\s*"rinari-agent",\s*"version":\s*")([^"]+)(")/ },
  { file: 'package-lock.json', pattern: /(""\s*:\s*\{\s*"name":\s*"rinari-agent",\s*"version":\s*")([^"]+)(")/ },
  { file: 'installer/setup/package.json', pattern: /("version":\s*")([^"]+)(")/ },
  { file: 'installer/setup/package-lock.json', pattern: /("name":\s*"rinari-setup-toolchain",\s*"version":\s*")([^"]+)(")/ },
  { file: 'installer/setup/package-lock.json', pattern: /(""\s*:\s*\{\s*"name":\s*"rinari-setup-toolchain",\s*"version":\s*")([^"]+)(")/ },
  { file: 'installer/setup/src-tauri/tauri.conf.json', pattern: /("version":\s*")([^"]+)(")/ },
  { file: 'installer/setup/src-tauri/Cargo.toml', pattern: /(\[package\][^[]*?\nversion\s*=\s*")([^"]+)(")/ },
  { file: 'installer/setup/src-tauri/Cargo.lock', pattern: /(name = "rinari-setup"\r?\nversion = ")([^"]+)(")/ },
  { file: 'scripts/finalize-setup.ps1', pattern: /(\[string\]\s*\$Version\s*=\s*')([^']+)(')/ },
  { file: 'scripts/package-setup-payload.ps1', pattern: /(\[string\]\s*\$Version\s*=\s*')([^']+)(')/ },
]

export function readVersions(root = ROOT) {
  return VERSION_SITES.map(({ file, pattern }) => {
    const match = readFileSync(join(root, file), 'utf8').match(pattern)
    if (!match) throw new Error(`no version found in ${file}`)
    return { file, version: match[2] }
  })
}

export function bumpVersion(version, root = ROOT) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`invalid version: ${version}`)
  for (const { file, pattern } of VERSION_SITES) {
    const path = join(root, file)
    const text = readFileSync(path, 'utf8')
    if (!pattern.test(text)) throw new Error(`no version found in ${file}`)
    writeFileSync(path, text.replace(pattern, (_, before, _old, after) => `${before}${version}${after}`))
  }
  return readVersions(root)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const version = process.argv[2]
  if (!version) {
    for (const { file, version: current } of readVersions()) console.log(`${current}  ${file}`)
  } else {
    for (const { file } of bumpVersion(version)) console.log(`${version}  ${file}`)
  }
}
