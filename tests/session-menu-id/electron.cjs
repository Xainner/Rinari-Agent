const { app, BrowserWindow, clipboard } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const data = process.env.MENU_DATA
const output = process.env.MENU_OUTPUT
app.setPath('userData', join(data, 'profile'))
require('../../dist-electron/main.cjs')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let win
const evaluate = code => win.webContents.executeJavaScript(code)
const q = selector => 'document.querySelector(' + JSON.stringify(selector) + ')'
async function wait(code) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { if (await evaluate(code)) return; await delay(100) }
  throw new Error('Timed out: ' + code)
}
async function ready() {
  await wait('Boolean(window.rinariDesktop)')
  await wait('(async () => (await window.rinariDesktop.engine.status()).state === "ready")()')
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Configurar después')?.click()")
  await evaluate('document.fonts.ready')
  await delay(400)
}
const command = (name, args) => evaluate('window.rinariDesktop.command(' + JSON.stringify(name) + ',' + JSON.stringify(args) + ')')
async function mouse(selector, button = 'left') {
  win.focus(); await delay(100)
  const point = await evaluate('(() => {const r=' + q(selector) + '.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
  win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
  win.webContents.sendInputEvent({ type: 'mouseDown', button, clickCount: 1, ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', button, clickCount: 1, ...point })
  await delay(250)
}
async function open(title, dots = false) {
  const triggerSelector = 'button[aria-label="Opciones de sesión"],button[aria-label="Session options"]'
  await evaluate("(() => {const b=[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes(" + JSON.stringify(title) + "));const row=b.closest('li');row.dataset.menuTest='target';const trigger=row.querySelector(" + JSON.stringify(triggerSelector) + ");if(trigger)trigger.dataset.menuTrigger='true'})()")
  await mouse(dots ? '[data-menu-test="target"] [data-menu-trigger]' : '[data-menu-test="target"]', dots ? 'left' : 'right')
  await wait('Boolean(document.querySelector(\'[role="menu"]\'))')
}
const nativeWrite = clipboard.writeText
const copies = []
const metrics = []
async function verify(id, title, name, dots = false) {
  await open(title, dots)
  const header = '[role="menu"] [title="' + id + '"]'
  const result = await evaluate('(() => {const h=' + q(header) + ',m=document.querySelector(\'[role="menu"]\'),r=document.createRange();r.selectNodeContents(h);const rect=m.getBoundingClientRect();return {text:h.textContent,lines:r.getClientRects().length,full:h.scrollWidth<=h.clientWidth,left:rect.left,right:rect.right,width:rect.width,viewport:innerWidth}})()')
  assert.equal(result.text, id)
  assert.equal(result.lines, 1, name + ': ID stays on one line')
  assert.equal(result.full, true, name + ': real session ID fits completely')
  assert(result.left >= 0 && result.right <= result.viewport, name + ': menu stays in viewport')
  metrics.push({ name, ...result })
  win.focus(); await delay(200)
  writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
async function choose(label) {
  await evaluate("[...document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent.trim()===" + JSON.stringify(label) + ").click()")
  await wait('!document.querySelector(\'[role="menu"]\')')
  await delay(100)
}
async function run() {
  await app.whenReady()
  while (!(win = BrowserWindow.getAllWindows()[0])) await delay(50)
  await ready()
  if (win.isMaximized()) win.unmaximize()
  win.setContentSize(1350, 850)
  await command('provider_create', { alias: 'prueba-local', provider_type: 'custom', auth_method: 'none', endpoint: 'http://127.0.0.1:9/v1' })
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fixture', alias: 'prueba-local' })
  await command('model_use', { reference: 'prueba-local' })
  const title = 'Prueba menú de conversación'
  const { session } = await command('session_create', { chat: true, title, mode: 'build', permission_profile: 'workspace' })
  win.webContents.reload(); await ready()
  // Keep the real renderer→preload→validated main IPC path. Capture only the
  // final native write so the test doesn't replace the owner's clipboard.
  const captureWrite = text => { copies.push(text) }
  clipboard.writeText = captureWrite
  assert.equal(clipboard.writeText, captureWrite, 'Clipboard capture installed before testing copy')
  await verify(session.id, title, 'spanish-right-click')
  await choose('Copiar ID de sesión')
  assert.equal(copies.pop(), session.id)
  await verify(session.id, title, 'spanish-dots', true)
  await choose('Copiar referencia')
  assert(copies.pop().includes(session.id), 'Reference preserves complete ID')
  await evaluate("localStorage.setItem('rinari.lang','en')")
  win.webContents.reload(); await ready()
  win.setContentSize(1100, 850); await delay(400)
  await wait('innerWidth===1100')
  await verify(session.id, title, 'english-compact-window')
  await choose('Copy session ID')
  assert.equal(copies.pop(), session.id)
  clipboard.writeText = nativeWrite
  await evaluate("localStorage.setItem('rinari.lang','es')")
  win.webContents.reload(); await ready()
  win.setContentSize(1350, 850); await delay(400)
  await verify(session.id, title, 'ready-for-review')
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: ['single-line complete Engine session ID', 'right-click and dots menu', 'full ID and reference copy through validated IPC', 'Spanish and English', 'compact desktop window bounds'], metrics, data }, null, 2))
  console.log('SESSION_MENU_ID_E2E_OK ' + JSON.stringify(metrics))
  if (process.env.MENU_KEEP === '1') { win.setTitle('Rinari Agent — Prueba ID de sesión'); win.show(); win.focus(); return }
  app.quit()
}
run().catch(async error => {
  clipboard.writeText = nativeWrite
  console.error(error)
  if (win && !win.isDestroyed()) { console.error((await evaluate('document.body.innerText')).slice(-2000)); writeFileSync(join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG()) }
  app.exit(1)
})
