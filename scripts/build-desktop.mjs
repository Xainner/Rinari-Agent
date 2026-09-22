#!/usr/bin/env node
// Construye main y preload del host Electron (documento 02 §8).
//
// El renderer lo construye Vite aparte; esto solo empaqueta el proceso
// principal y el preload. **Ambos salen en CommonJS de forma explícita**: con
// `sandbox: true` el preload no admite ESM, y el paquete declara
// `type: module`, así que la extensión `.cjs` es lo que evita que Node
// interprete la salida como módulo.
//
//   node scripts/build-desktop.mjs            construye
//   node scripts/build-desktop.mjs --watch    reconstruye al cambiar

import { rolldown } from 'rolldown'
import { rm, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'dist-electron')
const WATCH = process.argv.includes('--watch')
const UPDATE_E2E = process.env.RINARI_BUILD_UPDATE_E2E === '1'
const UPDATE_E2E_TOKEN = 'process.env.RINARI_BUILD_UPDATE_E2E'

const compileTimeFlags = {
  name: 'rinari-compile-time-flags',
  transform(code) {
    if (!code.includes(UPDATE_E2E_TOKEN)) return null
    return {
      code: code.replaceAll(UPDATE_E2E_TOKEN, UPDATE_E2E ? JSON.stringify('1') : 'undefined'),
      map: null,
    }
  },
}

/** Electron y los módulos de Node los resuelve el runtime, no el bundle. */
const EXTERNAL = [
  'electron',
  'electron-updater',
  /^node:/,
  ...['fs', 'path', 'url', 'child_process', 'events', 'os', 'crypto', 'stream', 'util'],
]

const TARGETS = [
  { name: 'main', input: join(ROOT, 'electron/main/index.ts'), file: join(OUT, 'main.cjs') },
  { name: 'preload', input: join(ROOT, 'electron/preload/index.ts'), file: join(OUT, 'preload.cjs') },
  // Sonda de viabilidad del browser (documento 03 §3). Es un proceso Electron
  // aparte, no parte de la app: entra aquí porque necesita el mismo empaquetado.
  {
    name: 'browser-probe',
    input: join(ROOT, 'electron/probe/browserViability.ts'),
    file: join(OUT, 'browser-probe.cjs'),
  },
]

async function buildOnce() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  for (const target of TARGETS) {
    const bundle = await rolldown({
      input: target.input,
      platform: 'node',
      external: EXTERNAL,
      // El feed genérico y el runner headless no existen en un release.
      plugins: [compileTimeFlags],
    })
    await bundle.write({
      file: target.file,
      format: 'cjs',
      // Sin `sourcemap: true` el diagnóstico de un fallo en main es ilegible.
      sourcemap: true,
      // Un solo fichero por objetivo: Electron carga main y preload por ruta
      // directa, sin un cargador que resuelva trozos.
      codeSplitting: false,
    })
    await bundle.close()
    console.log(`${target.name} -> ${target.file.replace(ROOT, '.')}`)
  }
}

await buildOnce()

if (WATCH) {
  const { watch } = await import('node:fs')
  let queued = false
  const rebuild = () => {
    if (queued) return
    queued = true
    setTimeout(async () => {
      queued = false
      try {
        await buildOnce()
      } catch (error) {
        console.error('[desktop] build falló:', error instanceof Error ? error.message : error)
      }
    }, 120)
  }
  watch(join(ROOT, 'electron'), { recursive: true }, rebuild)
  console.log('[desktop] observando electron/ …')
}
