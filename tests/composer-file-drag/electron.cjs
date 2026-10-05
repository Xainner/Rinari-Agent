const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const data = process.env.FILE_DRAG_DATA
const output = process.env.FILE_DRAG_OUTPUT
app.setPath('userData', join(data, 'profile'))
require('../../dist-electron/main.cjs')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let win
const evaluate = code => win.webContents.executeJavaScript(code)
async function wait(code) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { if (await evaluate(code)) return; await delay(100) }
  throw new Error('Timed out: ' + code)
}
const command = (name, args = {}) => evaluate('window.rinariDesktop.command(' + JSON.stringify(name) + ',' + JSON.stringify(args) + ')')
const query = selector => 'document.querySelector(' + JSON.stringify(selector) + ')'
async function point(selector) {
  return evaluate('(() => {const r=' + query(selector) + '.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
}
async function click(selector) {
  await wait('Boolean(' + query(selector) + ')')
  await evaluate(query(selector) + '.click()')
  await delay(250)
}
async function ready() {
  await wait('Boolean(window.rinariDesktop)')
  await wait('(async () => (await window.rinariDesktop.engine.status()).state === "ready")()')
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Configurar después')?.click()")
}
async function screenshot(name) { writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
// Chromium produces trusted drag events and protected DataTransfer objects from actual disk files.
async function drag(type, selector, files = ['adjunto.txt']) {
  await win.webContents.debugger.sendCommand('Input.dispatchDragEvent', {
    type, ...await point(selector),
    data: { items: [], files: files.map(file => join(data, file)), dragOperationsMask: 1 },
  })
  await delay(100)
}
const cue = '.chat-file-drop-zone[data-file-drag]'
const area = '.chat-file-drop-zone'
const surface = '.composer-surface'
async function run() {
  await app.whenReady()
  while (!(win = BrowserWindow.getAllWindows()[0])) await delay(50)
  await ready()
  if (win.isMaximized()) win.unmaximize()
  win.setContentSize(1500, 900)
  win.webContents.debugger.attach('1.3')
  await command('provider_create', { alias: 'prueba-local', provider_type: 'custom', auth_method: 'none', endpoint: process.env.FILE_DRAG_MODEL })
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fake-vertical', alias: 'prueba-local' })
  await command('model_use', { reference: 'prueba-local' })
  win.webContents.reload(); await ready()
  await delay(700)
  await wait('Boolean(document.querySelector(".composer-surface"))')
  const before = await evaluate(query(surface) + '.getBoundingClientRect().toJSON()')
  await evaluate("window.dragTrace=[];for(const type of ['dragenter','dragover','dragleave','drop'])document.addEventListener(type,e=>window.dragTrace.push({type,trusted:e.isTrusted,types:[...e.dataTransfer.types],files:e.dataTransfer.files.length,dropEffect:e.dataTransfer.dropEffect}),false)")
  await drag('dragEnter', area)
  await drag('dragOver', '.home-greeting')
  await wait('Boolean(' + query(cue) + ')')
  assert.deepEqual(await evaluate(query(surface) + '.getBoundingClientRect().toJSON()'), before)
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".chat-file-drop-overlay")).pointerEvents'), 'none')
  assert.deepEqual(await evaluate(query('.chat-file-drop-overlay') + '.getBoundingClientRect().toJSON()'), await evaluate(query(area) + '.getBoundingClientRect().toJSON()'))
  await screenshot('centered-hover')
  await drag('dragCancel', surface)
  // CDP dragCancel does not consistently dispatch dragleave; also exercise
  // the keyboard cancellation path explicitly.
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await wait('!document.querySelector(".chat-file-drop-overlay")')
  await drag('dragEnter', area)
  await drag('dragOver', area)
  await drag('drop', area)
  await wait('!document.querySelector(".chat-file-drop-overlay")')
  await wait("document.querySelector('.composer-surface').textContent.includes('adjunto.txt') && !document.querySelector('.composer-surface .animate-spin')")
  await screenshot('text-prepared')
  await evaluate("(() => {const e=document.querySelector('.composer-surface textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Revisa el archivo adjunto de prueba.');e.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait("document.body.innerText.includes('Adjunto recibido en el turno de prueba.')")
  await screenshot('sent-through-engine')
  await drag('dragEnter', '.conversation-transcript', ['imagen.png'])
  await drag('dragOver', '.conversation-transcript', ['imagen.png'])
  await screenshot('full-chat-hover')
  await drag('dragOver', surface + ' textarea', ['imagen.png'])
  await wait('Boolean(' + query(cue) + ')')
  await screenshot('bottom-hover')
  await drag('drop', surface, ['imagen.png'])
  await wait("document.querySelector('.composer-surface').textContent.includes('imagen.png') && !document.querySelector('.composer-surface .animate-spin')")
  assert.equal(await evaluate("Boolean(document.querySelector('.composer-surface img'))"), true)
  await screenshot('image-prepared')
  const ids = []
  for (const title of ['Adjuntos A', 'Adjuntos B']) ids.push((await command('session_create', { chat: true, title, mode: 'build', permission_profile: 'workspace' })).session.id)
  const layout = { version: 3, boardId: 'file_drag_acceptance', panes: ids.map((sessionId, i) => ({ paneId: 'pane_' + i, sessionId, width: 550, collapsed: false })), focusedPaneId: 'pane_0', focusMode: false, focusModeSnapshot: null }
  const trace = await evaluate('window.dragTrace')
  await evaluate("(() => {const write=Storage.prototype.setItem;write.call(localStorage,'rinari.board.v1'," + JSON.stringify(JSON.stringify(layout)) + ");Storage.prototype.setItem=function(k,v){if(k!=='rinari.board.v1')write.call(this,k,v)}})()")
  win.webContents.reload(); await ready()
  await click('.view-switcher button[aria-label="Boards"]')
  await wait('document.querySelectorAll("[data-pane-id]").length===2')
  const a = '[data-pane-id="pane_0"] .chat-file-drop-zone'
  const b = '[data-pane-id="pane_1"] .chat-file-drop-zone'
  await drag('dragEnter', a)
  await drag('dragOver', a)
  await drag('dragOver', b)
  await wait('Boolean(' + query(b + '[data-file-drag]') + ') && !' + query(a + '[data-file-drag]'))
  await screenshot('boards-target-b')
  await drag('drop', b)
  await wait(query(b) + ".textContent.includes('adjunto.txt') && !" + query(b + ' .animate-spin'))
  assert.equal(await evaluate(query(a) + ".textContent.includes('adjunto.txt')"), false)
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('rinari.board.v1')).focusedPaneId"), 'pane_0')
  await screenshot('boards-attached-only-b')
  assert(trace.some(e => e.type === 'dragover' && e.trusted && e.types.includes('Files') && e.files === 0 && e.dropEffect === 'copy'))
  assert(trace.some(e => e.type === 'drop' && e.trusted && e.files === 1))
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: ['trusted protected file drag', 'copy drop effect', 'stable geometry', 'cancel cleanup', 'text preparation and complete real Engine turn with scripted model', 'image preparation', 'centered and bottom composer', 'Boards unfocused destination'], trace, data }, null, 2))
  win.webContents.debugger.detach()
  console.log('COMPOSER_FILE_DRAG_E2E_OK')
  if (process.env.FILE_DRAG_KEEP === '1') {
    win.setTitle('Rinari Agent — Prueba adjuntos al arrastrar')
    win.show(); win.focus(); return
  }
  app.quit()
}
run().catch(async error => {
  console.error(error)
  if (win && !win.isDestroyed()) { console.error((await evaluate('document.body.innerText')).slice(-4500)); console.error(await evaluate('JSON.stringify(window.dragTrace)')); await screenshot('failure') }
  app.exit(1)
})
