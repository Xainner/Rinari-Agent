#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: join(root, 'installer', 'setup'),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
})
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
