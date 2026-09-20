#!/usr/bin/env node
import { createHash } from 'node:crypto'
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
