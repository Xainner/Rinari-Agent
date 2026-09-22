#!/usr/bin/env node
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] ?? '')
const portFile = resolve(process.argv[3] ?? '')
if (!process.argv[2] || !process.argv[3]) throw new Error('usage: serve-update-fixture.mjs <root> <port-file>')

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'latest.yml'
    const path = resolve(root, relative)
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end('forbidden')
      return
    }
    const body = await readFile(path)
    const contentType = extname(path).toLowerCase() === '.yml'
      ? 'text/yaml; charset=utf-8'
      : 'application/octet-stream'
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    })
    response.end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
})

server.listen(0, '127.0.0.1', async () => {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server has no TCP address')
  await writeFile(portFile, String(address.port), 'utf8')
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
