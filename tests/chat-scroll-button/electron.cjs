const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const data = process.env.SCROLL_DATA
const output = process.env.SCROLL_OUTPUT
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
  await delay(500)
}
const command = (name, args) => evaluate('window.rinariDesktop.command(' + JSON.stringify(name) + ',' + JSON.stringify(args) + ')')
async function click(selector) {
  win.focus()
  await delay(100)
  await wait('Boolean(' + q(selector) + ') && !' + q(selector) + '.disabled')
  const point = await evaluate('(() => {const r=' + q(selector) + '.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
  win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  await delay(250)
}
async function input(prefix, value) {
  await evaluate('(() => {const el=' + q(prefix + ' textarea') + ";Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el," + JSON.stringify(value) + ");el.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await delay(300)
}
async function screenshot(name) { await delay(200); writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
const scroller = '.conversation-enter > .overflow-y-auto'
const arrow = 'button[aria-label="Ir al final"]'
const metrics = []
async function readAbove(prefix) {
  await evaluate('(() => {const el=' + q(prefix + ' ' + scroller) + ";el.scrollTop=Math.max(0,el.scrollHeight-el.clientHeight-450);el.dispatchEvent(new Event('scroll'))})()")
  await wait('Boolean(' + q(prefix + ' ' + arrow) + ')')
}
async function verify(prefix, name) {
  await readAbove(prefix)
  const rects = await evaluate('(() => {const b=' + q(prefix + ' ' + arrow) + '.getBoundingClientRect(),c=' + q(prefix + ' .composer-surface') + '.getBoundingClientRect();return {gap:c.top-b.bottom,center:Math.abs((b.left+b.width/2)-(c.left+c.width/2)),buttonBottom:b.bottom,composerTop:c.top}})()')
  assert(rects.gap >= 8 && rects.gap <= 32, name + ': arrow should stay near composer: ' + JSON.stringify(rects))
  assert(rects.center < 2, name + ': centered over composer')
  assert(await evaluate('(() => {const b=' + q(prefix + ' ' + arrow) + ';const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===b})()'), name + ': arrow is unobstructed')
  metrics.push({ name, ...rects })
  await screenshot(name)
  await click(prefix + ' ' + arrow)
  await wait('!' + q(prefix + ' ' + arrow))
  await wait('(() => {const el=' + q(prefix + ' ' + scroller) + ';return el.scrollHeight-el.scrollTop-el.clientHeight<80})()')
}
async function run() {
  await app.whenReady()
  while (!(win = BrowserWindow.getAllWindows()[0])) await delay(50)
  await ready()
  if (win.isMaximized()) win.unmaximize()
  win.setContentSize(1500, 900)
  await command('provider_create', { alias: 'prueba-local', provider_type: 'custom', auth_method: 'none', endpoint: process.env.SCROLL_MODEL })
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fake-vertical', alias: 'prueba-local' })
  await command('model_use', { reference: 'prueba-local' })
  const ids = []
  for (const title of ['Prueba flecha A', 'Prueba flecha B', 'Prueba vacía']) ids.push((await command('session_create', { chat: true, title, mode: 'build', permission_profile: 'workspace' })).session.id)
  win.webContents.reload(); await ready()
  await evaluate("[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes('Prueba flecha A')).click()")
  await wait('Boolean(document.querySelector(".composer-surface"))')
  assert.equal(await evaluate('Boolean(' + q(arrow) + ')'), false, 'Empty chat should not show the arrow')
  await input('', 'Genera un historial largo de prueba.')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait("document.body.innerText.includes('FIN DEL HISTORIAL DE PRUEBA')")
  await wait('!document.querySelector(\'button[aria-label="Detener generación"]\')')
  await delay(500)
  await verify('', 'normal-compact')
  await input('', Array.from({ length: 8 }, (_, i) => 'Línea de borrador ' + i).join('\n'))
  await verify('', 'normal-expanded')
  const layout = { version: 3, boardId: 'scroll_acceptance', panes: ids.slice(0, 2).map((sessionId, i) => ({ paneId: 'pane_' + i, sessionId, width: 550, collapsed: false })), focusedPaneId: 'pane_0', focusMode: false, focusModeSnapshot: null }
  await evaluate("(() => {const write=Storage.prototype.setItem;write.call(localStorage,'rinari.board.v1'," + JSON.stringify(JSON.stringify(layout)) + ");Storage.prototype.setItem=function(k,v){if(k!=='rinari.board.v1')write.call(this,k,v)}})()")
  win.webContents.reload(); await ready()
  await click('.view-switcher button[aria-label="Boards"]')
  await wait('document.querySelectorAll("[data-pane-id]").length===2')
  const a = '[data-pane-id="pane_0"]'
  const b = '[data-pane-id="pane_1"]'
  await input(a, '')
  await verify(a, 'board-compact')
  await input(a, Array.from({ length: 8 }, (_, i) => 'Línea de borrador ' + i).join('\n'))
  await verify(a, 'board-expanded')
  assert.equal(await evaluate('Boolean(' + q(b + ' ' + arrow) + ')'), false, 'Empty sibling has no arrow')
  win.setContentSize(1200, 720); await delay(500)
  await verify(a, 'board-short-window')
  win.setContentSize(1500, 900); await delay(400)
  await input(a, '')
  await readAbove(a)
  await screenshot('ready-for-review')
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: ['real Engine turn', 'hidden at bottom and empty chats', 'button reaches end', 'centered near composer', 'composer height changes', 'Normal and Boards', 'short window'], metrics, data }, null, 2))
  console.log('CHAT_SCROLL_BUTTON_E2E_OK ' + JSON.stringify(metrics))
  if (process.env.SCROLL_KEEP === '1') { win.setTitle('Rinari Agent — Prueba flecha al final'); win.show(); win.focus(); return }
  app.quit()
}
run().catch(async error => {
  console.error(error)
  if (win && !win.isDestroyed()) { console.error((await evaluate('document.body.innerText')).slice(-2000)); await screenshot('failure') }
  app.exit(1)
})
