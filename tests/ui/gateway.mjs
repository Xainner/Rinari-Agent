// Un Rinari Gateway 0.2 desechable para `remote-server` («Conectar a mi servidor»).
//
// Necesita un checkout del Gateway con su entorno (`uv sync`) y el Python de un
// Engine instalado en el commit que fija el Gateway; sin ellos el escenario
// prueba solo la app (un servidor inalcanzable):
//
//   RINARI_E2E_GATEWAY         checkout de Rinari-Gateway (rama 0.2 o posterior)
//   RINARI_E2E_GATEWAY_ENGINE  python.exe del Engine fijado (p. ej. .local/engine-venv)
//
// Todo vive en la carpeta del escenario: configuración, estado, vault y el home
// del Engine del servidor. La contraseña del panel es aleatoria y solo sirve
// para pedir el código de emparejamiento y revocar el dispositivo.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

const toml = (value) => JSON.stringify(value.replace(/\\/g, '/'))

/** Hay un Gateway con el que probar de verdad. */
export function gatewayConfigured() {
  const checkout = process.env.RINARI_E2E_GATEWAY
  const engine = process.env.RINARI_E2E_GATEWAY_ENGINE
  return Boolean(checkout && existsSync(join(checkout, 'pyproject.toml')) && engine && existsSync(engine))
}

/** Inicia sesión en el panel y devuelve la cookie. */
export async function panelSession(panel, password) {
  const response = await fetch(`${panel}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-rinari-panel': '1' },
    body: JSON.stringify({ password }),
  })
  if (response.status !== 204) throw new Error(`panel sign-in failed: HTTP ${response.status}`)
  return response.headers.get('set-cookie').split(';')[0]
}

function stopTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

/**
 * Arranca el Gateway con `[remote]`, crea un código de emparejamiento y deja
 * en `<data>/gateway.json` lo que el escenario necesita.
 */
export async function startGateway(data) {
  const checkout = process.env.RINARI_E2E_GATEWAY
  const engine = process.env.RINARI_E2E_GATEWAY_ENGINE
  if (!gatewayConfigured()) {
    throw new Error('remote-server needs RINARI_E2E_GATEWAY (Gateway checkout) and RINARI_E2E_GATEWAY_ENGINE (python of the pinned Engine).')
  }
  const root = join(data, 'gateway')
  mkdirSync(root, { recursive: true })
  const [panelPort, remotePort] = [await freePort(), await freePort()]
  const remote = `http://127.0.0.1:${remotePort}`
  const panel = `http://127.0.0.1:${panelPort}`
  const config = join(root, 'gateway.toml')
  writeFileSync(config, [
    'state_dir = "state"',
    '[server]', 'host = "127.0.0.1"', `port = ${panelPort}`,
    '[engine]', `command = [${toml(engine)}, "-m", "rinari", "engine", "--stdio"]`, 'home = "engine-home"', 'max_backoff_seconds = 2',
    '[vault]', 'path = "vault"',
    '[remote]', 'enabled = true', 'host = "127.0.0.1"', `port = ${remotePort}`, `public_url = "${remote}"`,
    '',
  ].join('\n'))

  const password = randomBytes(18).toString('base64url')
  const uv = (args, options = {}) => ['uv', ['run', '--project', checkout, '--locked', 'rinari-gateway', ...args, '--config', config], options]
  const [setCmd, setArgs] = uv(['set-password', '--stdin'])
  const set = spawnSync(setCmd, setArgs, { input: password, encoding: 'utf8' })
  if (set.status !== 0) throw new Error(`set-password failed: ${set.stderr}`)

  const [cmd, args] = uv(['serve'])
  const env = { ...process.env }
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[key]
  const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  const keep = (chunk) => { log = (log + chunk.toString()).slice(-4000) }
  child.stdout.on('data', keep)
  child.stderr.on('data', keep)

  const close = async () => {
    stopTree(child)
    await delay(500)
  }
  try {
    // El Engine del servidor tarda en arrancar: /health/ready lo espera.
    const deadline = Date.now() + 120_000
    for (;;) {
      if (child.exitCode !== null) throw new Error(`the Gateway exited (${child.exitCode}):\n${log}`)
      const ready = await fetch(`${panel}/health/ready`).then((r) => r.ok, () => false)
      const listening = await fetch(`${remote}/health/live`).then((r) => r.ok, () => false)
      if (ready && listening) break
      if (Date.now() > deadline) throw new Error(`the Gateway did not get ready:\n${log}`)
      await delay(500)
    }
    const cookie = await panelSession(panel, password)
    const pairing = await fetch(`${panel}/api/devices/pair`, { method: 'POST', headers: { cookie, 'x-rinari-panel': '1' } })
    if (!pairing.ok) throw new Error(`pairing code failed: HTTP ${pairing.status}`)
    const { uri } = await pairing.json()
    writeFileSync(join(data, 'gateway.json'), JSON.stringify({ panel, remote, password, uri }, null, 2))
  } catch (error) {
    await close()
    throw error
  }
  return { log: () => log, close }
}
