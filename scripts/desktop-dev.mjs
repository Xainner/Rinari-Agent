#!/usr/bin/env node
// Arranque de desarrollo del host Electron (documento 02 §8).
//
// Levanta el dev server de Vite, construye main y preload, y lanza Electron
// apuntando al dev server. La configuración de desarrollo **no** pasa a
// producción: el origen del dev server solo se admite porque
// `RINARI_DEV_SERVER_URL` está presente.

import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({ root: ROOT, server: { port: 1420, strictPort: true } })
await server.listen()
const url = server.resolvedUrls?.local?.[0]
if (!url) {
  await server.close()
  throw new Error('el dev server de Vite no expuso una URL local')
}
console.log(`[desktop] dev server en ${url}`)

const build = spawn(process.execPath, [join(ROOT, 'scripts/build-desktop.mjs')], {
  stdio: 'inherit',
  cwd: ROOT,
})
await new Promise((resolve, reject) => {
  build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build salió con ${code}`))))
})

const electronBin = (await import('electron')).default
const child = spawn(electronBin, [join(ROOT, 'dist-electron/main.cjs')], {
  stdio: 'inherit',
  cwd: ROOT,
  env: { ...process.env, RINARI_DEV_SERVER_URL: url.replace(/\/$/, '') },
})

const stop = async () => {
  child.kill()
  await server.close()
}
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
