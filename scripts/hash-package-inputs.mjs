#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE = join(ROOT, 'engine-dist')
const ASSETS = join(ROOT, 'installer', 'setup', 'public', 'assets')

async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await files(path))
    else result.push(path)
  }
  return result
}

async function digest(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

// Un Engine a medio construir no se firma (ni se empaqueta): en la 0.4.1 un
// `package-engine.ps1` fallido dejó solo el Python embebido y el instalador
// salió sin `rinari`.
async function assertPackagedEngine() {
  const missing = ['ENGINE_SOURCE.json', 'Lib/site-packages/rinari/__init__.py'].filter(
    (path) => !existsSync(join(ENGINE, path)),
  )
  if (missing.length) {
    throw new Error(`engine-dist is not a packaged Engine (missing ${missing.join(', ')}): run scripts/package-engine.ps1 first`)
  }
  const source = JSON.parse((await readFile(join(ENGINE, 'ENGINE_SOURCE.json'), 'utf8')).replace(/^﻿/, ''))
  const pin = JSON.parse(await readFile(join(ROOT, 'engine-manifest.json'), 'utf8')).engine_git_sha
  if (!source.nightly && !source.development && source.base_git_sha !== pin) {
    throw new Error(`engine-dist was built from ${source.base_git_sha}, not the pinned Engine ${pin}`)
  }
}

await assertPackagedEngine()
const engine = Object.create(null)
for (const path of (await files(ENGINE)).sort()) {
  if (path.endsWith('SHA256SUMS.json')) continue
  engine[relative(ENGINE, path).replaceAll('\\', '/')] = await digest(path)
}
await writeFile(join(ENGINE, 'SHA256SUMS.json'), JSON.stringify(engine, null, 2) + '\n')

const assets = Object.create(null)
for (const path of (await files(ASSETS)).sort()) {
  assets[relative(ASSETS, path).replaceAll('\\', '/')] = await digest(path)
}
await writeFile(
  join(ROOT, 'build', 'installer', 'package-inputs.sha256.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), assets, engine }, null, 2) + '\n',
)
console.log(`hashed ${Object.keys(engine).length} engine files and ${Object.keys(assets).length} installer assets`)
