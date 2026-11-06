// «Conectar a mi servidor» contra un Rinari Gateway 0.2 real (tests/ui/gateway.mjs):
// emparejar con el enlace del panel, conversar con el Rinari del servidor,
// reconectar solo al abrir la app, ver el aviso cuando el panel revoca este
// equipo y volver al Rinari de este equipo.
const assert = require('node:assert/strict')
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { clickText, click, command, delay, evaluate, input, menuShortcut, reload, report, scenario, screenshot, useLocalModel, wait, ui } = require('../harness.cjs')

const gatewayFile = join(ui.data, 'gateway.json')
// Sin Gateway (tests/ui/gateway.mjs) queda la parte de la app: un servidor inalcanzable.
const gateway = existsSync(gatewayFile) ? JSON.parse(readFileSync(gatewayFile, 'utf8')) : null
const SKIPPED = ['real Gateway: set RINARI_E2E_GATEWAY and RINARI_E2E_GATEWAY_ENGINE']
const localFile = join(ui.data, 'local-engine.json')
const status = () => evaluate('window.rinariDesktop.engine.status()')
const asideHas = (text) => `Boolean(document.querySelector('aside')?.innerText.includes(${JSON.stringify(text)}))`

async function openServers() {
  await menuShortcut('settings', 'CmdOrCtrl+,')
  await clickText('Servidor', 'nav button')
  await wait(`Boolean(document.querySelector('#server-link'))`)
}

async function panel(method, path) {
  const signIn = await fetch(`${gateway.panel}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-rinari-panel': '1' },
    body: JSON.stringify({ password: gateway.password }),
  })
  assert.equal(signIn.status, 204, 'panel sign-in')
  const cookie = signIn.headers.get('set-cookie').split(';')[0]
  return fetch(`${gateway.panel}${path}`, { method, headers: { cookie, 'x-rinari-panel': '1' } })
}

async function exercise() {
  const local = await status()
  assert.ok(!local.remote, 'starts on this computer')
  writeFileSync(localFile, JSON.stringify({ home_id: local.home_id }))

  await openServers()
  await screenshot('servers-local')
  await input('#server-link', gateway.uri)
  await clickText('Emparejar')
  await wait(`document.body.innerText.includes('Emparejado con 127.0.0.1:')`, 30_000)
  assert.ok(!(await status()).remote, 'pairing does not switch by itself')
  await screenshot('paired')

  await clickText('Usar ahora')
  await wait(`(async () => { const s = await window.rinariDesktop.engine.status(); return s.state === 'ready' && Boolean(s.remote) })()`, 60_000)
  await wait(`[...document.querySelectorAll('.r-chip')].some((chip) => chip.textContent === 'Conectado')`)
  const remote = await status()
  assert.equal(remote.remote.server, gateway.remote)
  assert.notEqual(remote.home_id, local.home_id, 'talks to the server Engine, not this one')
  await screenshot('connected')

  // El modelo se configura en el Engine del servidor, por la conexión remota.
  await useLocalModel()
  await reload()
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nueva conversación') && b.textContent.includes('Ctrl')).click()`)
  await wait('Boolean(document.querySelector(".composer-surface textarea"))')
  await delay(300)
  await input('.composer-surface textarea', 'Hola, servidor')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('HOLA DESDE EL SERVIDOR')`, 60_000)
  await wait(asideHas('Saludo al servidor'), 30_000)
  await screenshot('chat-on-server')

  // Un archivo de este equipo se sube al servidor y vuelve como artifact descargable.
  const { sessions } = await command('session_list')
  const session = sessions.find((item) => item.title === 'Saludo al servidor')
  assert.ok(session, 'the conversation lives on the server')
  const note = join(ui.data, 'nota-local.txt')
  writeFileSync(note, 'CONTENIDO DESDE ESTE EQUIPO\n')
  const { attachments } = await command('attachment_prepare', {
    session_id: session.id,
    attachments: [{ id: 'att-1', path: note, name: 'nota-local.txt', source: 'native' }],
  })
  assert.match(attachments[0].uri ?? '', /^artifact:\/\//, 'the server imported the upload')
  const media = await evaluate(`window.rinariDesktop.files.media(${JSON.stringify({ session_id: session.id, path: attachments[0].uri })})`)
  assert.equal(readFileSync(media.path, 'utf8'), 'CONTENIDO DESDE ESTE EQUIPO\n', 'the artifact comes back from the server')
  assert.ok(media.path.startsWith(join(ui.data, 'profile', 'remote-files')), 'downloaded into the cache')
  report({ passed: ['pairs with the panel link', 'pairing does not switch by itself', 'switches to the server Engine', 'a turn runs on the server', 'uploads an attachment and downloads its artifact'] })
}

async function restart() {
  const local = JSON.parse(readFileSync(localFile, 'utf8'))
  const reopened = await status()
  assert.equal(reopened.remote?.server, gateway.remote, 'reconnects to the server on start')
  await wait(asideHas('Saludo al servidor'), 30_000)
  await screenshot('reconnected')

  const devices = await (await panel('GET', '/api/devices')).json()
  const list = Array.isArray(devices) ? devices : devices.devices
  assert.equal(list.length, 1, 'one paired device')
  assert.equal((await panel('DELETE', `/api/devices/${list[0].device_id}`)).status, 204)

  await wait(`(async () => { const s = await window.rinariDesktop.engine.status(); return s.state === 'failed' && (s.detail ?? '').startsWith('REMOTE_UNPAIRED') })()`, 30_000)
  await openServers()
  await wait(`document.body.innerText.includes('Ya no está emparejado')`)
  await screenshot('revoked')

  await clickText('Usar')
  await wait(`(async () => { const s = await window.rinariDesktop.engine.status(); return s.state === 'ready' && !s.remote })()`, 60_000)
  assert.equal((await status()).home_id, local.home_id, 'back on this computer')
  await reload()
  await delay(500)
  assert.equal(await evaluate(asideHas('Saludo al servidor')), false, 'the server conversation is not on this computer')
  await screenshot('back-local')
  report({ passed: ['reconnects on start', 'revoked device shows as unpaired', 'back to this computer'] })
}

async function unreachable() {
  if (ui.phase === 'restart') {
    assert.ok(!(await status()).remote, 'a failed pairing leaves this computer in use')
    report({ passed: ['still on this computer after restart'], skipped: SKIPPED })
    return
  }
  await openServers()
  // 127.0.0.1:9 (discard) no escucha: el emparejamiento no llega.
  await input('#server-address', 'http://127.0.0.1:9')
  await input('#server-code', 'ABCD2345')
  await clickText('Emparejar')
  await wait(`document.querySelector('[role="alert"]')?.textContent.startsWith('No se pudo llegar al servidor')`, 30_000)
  assert.equal((await evaluate('window.rinariDesktop.engines.list()')).remotes.length, 0, 'nothing stored')
  assert.ok(!(await status()).remote)
  await screenshot('unreachable')
  report({ passed: ['unreachable server shows its error', 'nothing stored'], skipped: SKIPPED })
}

scenario(async () => {
  if (!gateway) await unreachable()
  else if (ui.phase === 'restart') await restart()
  else await exercise()
}, { width: 1400, height: 900 })
