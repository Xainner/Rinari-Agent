const { app, BrowserWindow, dialog } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const data = process.env.IMAGE_DATA
const output = process.env.IMAGE_OUTPUT
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
  await delay(400)
}
const command = (name, args) => evaluate('window.rinariDesktop.command(' + JSON.stringify(name) + ',' + JSON.stringify(args) + ')')
async function clickAt(x, y) {
  win.focus()
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x, y })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x, y })
  await delay(250)
}
async function click(selector) {
  await wait('Boolean(' + q(selector) + ') && !' + q(selector) + '.disabled')
  const point = await evaluate('(() => {const r=' + q(selector) + '.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
  await clickAt(point.x, point.y)
}
async function key(keyCode) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  await delay(150)
}
async function wheel(x, y, deltaY) {
  win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
  win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY, canScroll: true })
  await delay(100)
}
async function screenshot(name) { writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
const scroller = '.conversation-enter > .overflow-y-auto'
const preview = '[role="dialog"][aria-label^="Vista previa"]'
const historical = 'button[title="Abrir vista previa"]'
const originalDialog = dialog.showOpenDialog
async function attach(prefix, name) {
  // Only file selection is scripted; host validation and Engine preparation run normally.
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(data, name)] })
  try {
    await click(prefix + ' .composer-surface button[aria-label="Adjuntar archivos"]')
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Adjuntar desde el equipo')).click()")
    await wait(q(prefix + ' .composer-surface') + '.textContent.includes(' + JSON.stringify(name) + ')')
    await wait('!' + q(prefix + ' .composer-surface .animate-spin'))
  } finally { dialog.showOpenDialog = originalDialog }
}
async function input(prefix, value) {
  await evaluate('(() => {const el=' + q(prefix + ' .composer-surface textarea') + ";Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el," + JSON.stringify(value) + ");el.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await delay(200)
}
async function startOfChat(prefix = '') {
  await wait(q(prefix + ' ' + scroller) + '?.scrollHeight>4000')
  const deadline = Date.now() + 10000
  // Loading and virtualizer measurements may restore a saved reading anchor.
  // Navigate after those updates and notify the real scroll handler immediately.
  while (Date.now() < deadline) {
    await evaluate('(()=>{const e=' + q(prefix + ' ' + scroller) + ';e.scrollTop=0;e.dispatchEvent(new Event("scroll"))})()')
    await delay(300)
    if (await evaluate('Boolean(' + q(prefix + ' ' + historical) + ')')) return
  }
  throw new Error('Image attachment did not become visible at start of chat')
}
const metrics = []
async function verify(prefix, name) {
  await wait(q(preview + ' img') + '?.naturalWidth>0')
  await delay(300)
  const before = await evaluate('(() => {const d=' + q(preview) + '; const r=d.getBoundingClientRect(); const o=d.previousElementSibling.getBoundingClientRect();return {rect:r.toJSON(),overlay:o.toJSON(),width:innerWidth,height:innerHeight,portal:!d.closest(".conversation-enter,.composer-root,[data-pane-id]"),scrolls:[...document.querySelectorAll(' + JSON.stringify(scroller) + ')].map(e=>e.scrollTop)}})()')
  assert(before.portal, name + ': dialog belongs to the window')
  assert.equal(before.overlay.x, 0); assert.equal(before.overlay.y, 0)
  assert.equal(before.overlay.width, before.width); assert.equal(before.overlay.height, before.height)
  assert(Math.abs(before.rect.x + before.rect.width / 2 - before.width / 2) < 2)
  assert(Math.abs(before.rect.y + before.rect.height / 2 - before.height / 2) < 2)
  for (const delta of [-2500, 2500, -5000, 5000]) {
    await wheel(Math.round(before.width / 2), Math.round(before.height / 2), delta)
    await wheel(30, Math.round(before.height / 2), delta)
  }
  for (const code of ['PageDown', 'PageUp', 'Home', 'End', 'Tab']) await key(code)
  assert(await evaluate('Boolean(' + q(preview) + ')'), name + ': viewer remains open')
  assert(await evaluate(q(preview) + '.contains(document.activeElement)'), name + ': focus stays in viewer')
  assert.deepEqual(await evaluate('[...document.querySelectorAll(' + JSON.stringify(scroller) + ')].map(e=>e.scrollTop)'), before.scrolls, name + ': background cannot scroll')
  assert.deepEqual(await evaluate(q(preview) + '.getBoundingClientRect().toJSON()'), before.rect, name + ': viewer stays fixed')
  metrics.push({ name, ...before })
  await screenshot(name)
  await key('Escape')
  await wait('!' + q(preview))
  // Once dismissed the conversation responds to wheel input again.
  const p = await evaluate('(() => {const r=' + q(prefix + ' ' + scroller) + '.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+100)}})()')
  const initial = await evaluate(q(prefix + ' ' + scroller) + '.scrollTop')
  await wheel(p.x, p.y, -1000)
  await wait(q(prefix + ' ' + scroller) + '.scrollTop>' + initial)
}
async function run() {
  await app.whenReady()
  while (!(win = BrowserWindow.getAllWindows()[0])) await delay(50)
  await ready()
  if (win.isMaximized()) win.unmaximize()
  win.setContentSize(1500, 900)
  await command('provider_create', { alias: 'prueba-local', provider_type: 'custom', auth_method: 'none', endpoint: process.env.IMAGE_MODEL })
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fake-vertical', alias: 'prueba-local', capabilities: { vision: true } })
  await command('model_use', { reference: 'prueba-local' })
  const ids = []
  for (const title of ['Prueba visor de imagen', 'Panel vecino']) ids.push((await command('session_create', { chat: true, title, mode: 'build', permission_profile: 'workspace' })).session.id)
  win.webContents.reload(); await ready()
  await evaluate("[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes('Prueba visor de imagen')).click()")
  await wait('Boolean(document.querySelector(".composer-surface"))')
  const png = await evaluate("(() => {const c=document.createElement('canvas');c.width=900;c.height=500;const ctx=c.getContext('2d');const g=ctx.createLinearGradient(0,0,900,500);g.addColorStop(0,'#17314b');g.addColorStop(1,'#7556b8');ctx.fillStyle=g;ctx.fillRect(0,0,900,500);ctx.fillStyle='#fff';ctx.font='bold 54px sans-serif';ctx.fillText('Visor de imagen',80,180);ctx.font='28px sans-serif';ctx.fillText('La imagen permanece sobre toda la ventana',80,260);ctx.fillText('Escape o Cerrar para volver al chat',80,320);return c.toDataURL('image/png').split(',')[1]})()")
  writeFileSync(join(data, 'imagen.png'), Buffer.from(png, 'base64'))
  await attach('', 'imagen.png')
  await click('.composer-surface ' + historical)
  await wait(q(preview + ' img') + '?.naturalWidth>0')
  await screenshot('composer-centered')
  await key('Escape'); await wait('!' + q(preview))
  for (let i = 1; i <= 4; i++) {
    await input('', 'Turno ' + i + ' para construir un historial desplazable.')
    await click('.composer-surface button[aria-label="Enviar mensaje"]')
    await wait('document.body.innerText.includes(' + JSON.stringify('FIN DEL TURNO ' + i) + ')')
    await wait('!document.querySelector(\'button[aria-label="Detener generación"]\')')
  }
  await startOfChat()
  await click(historical)
  await verify('', 'normal-history')
  await startOfChat(); await click(historical)
  await click(preview + ' button[aria-label="Cerrar"]'); await wait('!' + q(preview))
  await click(historical); await clickAt(25, 200); await wait('!' + q(preview))
  const layout = { version: 3, boardId: 'image_acceptance', panes: ids.map((sessionId, i) => ({ paneId: 'pane_' + i, sessionId, width: 550, collapsed: false })), focusedPaneId: 'pane_0', focusMode: false, focusModeSnapshot: null }
  await evaluate("(() => {const write=Storage.prototype.setItem;write.call(localStorage,'rinari.board.v1'," + JSON.stringify(JSON.stringify(layout)) + ");Storage.prototype.setItem=function(k,v){if(k!=='rinari.board.v1')write.call(this,k,v)}})()")
  win.webContents.reload(); await ready()
  await click('.view-switcher button[aria-label="Boards"]')
  await wait('document.querySelectorAll("[data-pane-id]").length===2')
  const a = '[data-pane-id="pane_0"]'
  await startOfChat(a); await click(a + ' ' + historical)
  await verify(a, 'board-history')
  await startOfChat(a)
  await attach(a, 'imagen.png'); await click(a + ' .composer-surface ' + historical)
  await verify(a, 'board-composer')
  await attach(a, 'nota.txt')
  await evaluate('(()=>{const b=[...document.querySelectorAll(' + JSON.stringify(a + ' .composer-surface ' + historical) + ')].find(b=>b.textContent.includes("nota.txt"));b.focus();b.click()})()')
  await wait(q(preview) + '?.textContent.includes("Línea 150")')
  const initial = await evaluate(q(a + ' ' + scroller) + '.scrollTop')
  const textPoint = await evaluate('(()=>{const r=' + q(preview + ' pre') + '.getBoundingClientRect();return {x:Math.round(r.x+100),y:Math.round(r.y+100)}})()')
  await wheel(textPoint.x, textPoint.y, -1000)
  await wait(q(preview + ' pre') + '.parentElement.scrollTop>0')
  assert.equal(await evaluate(q(a + ' ' + scroller) + '.scrollTop'), initial)
  await screenshot('text-internal-scroll')
  await key('Escape'); await wait('!' + q(preview))
  win.setContentSize(1100, 720)
  await startOfChat(a); await click(a + ' ' + historical)
  await verify(a, 'board-short-window')
  win.setContentSize(1500, 900)
  await click('.view-switcher button[aria-label="Normal"]')
  await startOfChat(); await click(historical)
  await wait(q(preview + ' img') + '?.naturalWidth>0')
  await screenshot('ready-for-review')
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: ['real Engine image import and four turns', 'window-level portal and overlay', 'wheel and keyboard scroll blocked behind viewer', 'Escape, close button and backdrop', 'scroll resumes after dismissal', 'Normal and Boards history and composer', 'text attachment internal scroll', 'short window'], metrics, data }, null, 2))
  console.log('CHAT_IMAGE_OVERLAY_E2E_OK')
  if (process.env.IMAGE_KEEP === '1') { win.setTitle('Rinari Agent — Prueba visor de imagen'); win.show(); win.focus(); return }
  app.quit()
}
run().catch(async error => {
  dialog.showOpenDialog = originalDialog
  console.error(error)
  if (win && !win.isDestroyed()) { console.error((await evaluate('document.body.innerText')).slice(-3000)); await screenshot('failure') }
  app.exit(1)
})
