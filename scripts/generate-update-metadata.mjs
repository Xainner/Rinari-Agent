#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function argsOf(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument: ${key ?? ''}`)
    values.set(key.slice(2), value)
  }
  return values
}

export function assertReleaseVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`invalid release version: ${version}`)
  }
}

export async function sha512Base64(path) {
  const hash = createHash('sha512')
  await new Promise((resolveStream, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolveStream)
  })
  return hash.digest('base64')
}

export async function generateUpdateMetadata({ version, setup, output, releaseDate }) {
  assertReleaseVersion(version)
  const setupPath = resolve(setup)
  const name = basename(setupPath)
  if (!name.toLowerCase().endsWith('.exe')) throw new Error('the update artifact must be an .exe')
  if (!name.includes(version)) throw new Error(`artifact name does not contain version ${version}`)
  const info = await stat(setupPath)
  if (!info.isFile() || info.size === 0) throw new Error('the update artifact is missing or empty')
  const sha512 = await sha512Base64(setupPath)
  const timestamp = releaseDate ?? new Date().toISOString()
  if (Number.isNaN(Date.parse(timestamp))) throw new Error(`invalid release date: ${timestamp}`)
  const yaml = [
    `version: ${JSON.stringify(version)}`,
    'files:',
    `  - url: ${JSON.stringify(name)}`,
    `    sha512: ${JSON.stringify(sha512)}`,
    `    size: ${info.size}`,
    `path: ${JSON.stringify(name)}`,
    `sha512: ${JSON.stringify(sha512)}`,
    `releaseDate: ${JSON.stringify(timestamp)}`,
    'rinariUnsigned: true',
    '',
  ].join('\n')
  const outputPath = resolve(output)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, yaml, 'utf8')
  return { output: outputPath, file: name, version, sha512, bytes: info.size, unsigned: true }
}

async function main() {
  const args = argsOf(process.argv.slice(2))
  const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
  const version = args.get('version') ?? packageJson.version
  if (typeof version !== 'string') throw new Error('package.json has no version')
  const setup = args.get('setup') ?? join('release', 'installer', `Rinari-Agent-Setup-${version}-x64.exe`)
  const output = args.get('output') ?? join('release', 'installer', 'latest.yml')
  const result = await generateUpdateMetadata({
    version,
    setup,
    output,
    releaseDate: args.get('release-date'),
  })
  // Releer evita anunciar un archivo que no llegó al disco.
  await readFile(result.output, 'utf8')
  console.log(`Electron update metadata: ${result.output}`)
  console.log(`SHA-512 (base64): ${result.sha512}`)
  console.log('Authenticode: unsigned')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
