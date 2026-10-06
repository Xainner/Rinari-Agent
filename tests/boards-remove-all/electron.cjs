const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { writeFileSync, readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const data = process.env.REMOVE_ALL_DATA
const output = process.env.REMOVE_ALL_OUTPUT
const model = process.env.REMOVE_ALL_MODEL
app.setPath('userData', join(data, 'profile'))
require('../../dist-electron/main.cjs')
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
let win
const evaluate = code => win.webContents.executeJavaScript(code)
async function until(check, label) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { if (await check()) return; await delay(100) }
  throw new Error('Timed out: ' + label)
}
const wait = code => until(() => evaluate(code), code)
async function click(selector) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'})`)
  await delay(300)
  const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  await delay(250)
}
async function clickText(text, scope) {
  await wait(`[...document.querySelectorAll(${JSON.stringify(scope)})].some(b=>b.textContent.trim()===${JSON.stringify(text)})`)
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`)
  await delay(250)
}
const command = (name, args = {}) => evaluate(`window.rinariDesktop.command(${JSON.stringify(name)},${JSON.stringify(name === 'session_create' ? { mode: 'build', permission_profile: 'workspace', ...args } : args)})`)
const stored = key => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || '{}')`)
async function input(selector, value) {
  await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  await delay(300)
}
async function ready() {
  await wait('Boolean(window.rinariDesktop)')
  await wait('(async () => (await window.rinariDesktop.engine.status()).state === "ready")()')
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await delay(400)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Configurar después')?.click()`)
}
async function seed(ids, mode = 'expanded') {
  const layout = { version: 3, boardId: 'remove_all_acceptance',
    panes: ids.map((id, i) => ({ paneId: `pane_${i}`, sessionId: id, width: 700, collapsed: mode === 'collapsed' || (mode === 'focus' && i !== 1) })),
    focusedPaneId: mode === 'collapsed' ? null : 'pane_1', focusMode: mode === 'focus',
    focusModeSnapshot: mode === 'focus' ? { pane_0: false, pane_1: false, pane_2: false } : null }
  await evaluate(`(() => {
    const write=Storage.prototype.setItem;
    write.call(localStorage,'rinari.board.v1',${JSON.stringify(JSON.stringify(layout))});
    Storage.prototype.setItem=function(key,value){if(key!=='rinari.board.v1')write.call(this,key,value)};
  })()`)
  win.webContents.reload(); await ready()
  await click('.view-switcher button[aria-label="Boards"]')
  await wait('document.querySelectorAll("[data-pane-id]").length===3')
}
async function empty(label = 'Quitar todos') {
  await click(`.board-toolbar button[aria-label="${label}"]`)
  // La confirmación es el diálogo de la app; su botón repite la etiqueta.
  await wait(`Boolean(document.querySelector('[role="alertdialog"]'))`)
  await clickText(label, '[role="alertdialog"] button')
  await wait('document.querySelectorAll("[data-pane-id]").length===0 && Boolean(document.querySelector(".board-empty"))')
  await wait(`JSON.parse(localStorage.getItem('rinari.board.v1')).panes.length===0`)
  const board = await stored('rinari.board.v1')
  assert.equal(board.focusedPaneId, null)
  assert.equal(board.lastExpandedPaneId, null)
  assert.equal(board.focusMode, false)
  assert.equal(board.focusModeSnapshot, null)
}
async function screenshot(name) { writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
async function run() {
  await app.whenReady()
  while (!(win = BrowserWindow.getAllWindows()[0])) await delay(50)
  await ready()
  if (win.isMaximized()) win.unmaximize()
  win.setContentSize(1500, 880)
  if (process.env.REMOVE_ALL_PHASE === 'restart') {
    const { ids } = JSON.parse(readFileSync(join(data, 'expected.json'), 'utf8'))
    assert.equal((await stored('rinari.board.v1')).panes.length, 0)
    await click('.view-switcher button[aria-label="Boards"]')
    await wait('Boolean(document.querySelector(".board-empty"))')
    for (const id of ids) assert.equal((await command('session_get', { reference: id })).session.state, 'active')
    console.log('REMOVE_ALL_RESTART_OK: board stays empty, all conversations remain active')
    // Leave a populated board for the owner to test the new button.
    for (let i = 0; i < ids.length; i++) {
      await click(i ? '.board-toolbar .is-primary' : '.board-empty-primary')
      await wait('Boolean(document.querySelector(\'[role="dialog"] .add-pane-row\'))')
      await evaluate(`[...document.querySelectorAll('[role="dialog"] .add-pane-row')].find(b=>b.textContent.includes('Prueba quitar ${i + 1}')).click()`)
      await wait(`document.querySelectorAll('[data-pane-id]').length===${i + 1}`)
      await wait('!document.querySelector(\'[role="dialog"]\')')
    }
    await delay(400)
    await screenshot('ready-for-review')
    if (process.env.REMOVE_ALL_KEEP === '1') { win.setTitle('Rinari Agent — Prueba Quitar todos'); win.show(); win.focus(); return }
    app.quit(); return
  }
  await command('provider_create', { alias: 'prueba-local', provider_type: 'custom', auth_method: 'none', endpoint: model + '/v1' })
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fake-vertical', alias: 'prueba-local' })
  await command('model_use', { reference: 'prueba-local' })
  const ids = []
  for (let i = 1; i <= 3; i++) ids.push((await command('session_create', { chat: true, title: `Prueba quitar ${i}` })).session.id)
  await seed(ids)
  await input('[data-pane-id="pane_0"] textarea', 'Borrador que debe conservarse')
  await click('[data-pane-id="pane_0"] .pane-header-title')
  await click('[data-pane-id="pane_0"] button[aria-label="Mostrar u ocultar panel lateral"]')
  const docks = await stored('rinari.sessionDock.v1')
  await input('[data-pane-id="pane_1"] textarea', 'Turno local controlado para comprobar que sigue vivo')
  await click('[data-pane-id="pane_1"] .pane-header-title')
  await click('[data-pane-id="pane_1"] button[aria-label="Enviar mensaje"]')
  await until(async () => (await (await fetch(model + '/__pending')).json()) === true, 'real Engine reaches held model request')
  await wait('document.querySelector(\'[data-pane-id="pane_1"]\').dataset.status === "working"')
  const draft = await stored('rinari.composer.drafts.v1')
  await screenshot('running-before-removal')
  await empty()
  assert.deepEqual(await stored('rinari.sessionDock.v1'), docks)
  assert.deepEqual(await stored('rinari.composer.drafts.v1'), draft)
  const release = await (await fetch(model + '/__release')).json()
  assert.equal(release.wasConnected, true, 'Removal must not cancel the in-flight provider request')
  await until(async () => JSON.stringify(await command('session_history', { reference: ids[1] })).includes('El turno terminó después de quitar los paneles.'), 'turn completes after removal')
  for (const id of ids) assert.equal((await command('session_get', { reference: id })).session.state, 'active')
  await screenshot('empty-conversations-preserved')
  await seed(ids, 'collapsed'); await empty()
  await seed(ids, 'focus'); await empty()
  await evaluate(`localStorage.setItem('rinari.lang','en')`)
  await seed(ids)
  win.setMinimumSize(480, 500); win.setContentSize(780, 800)
  await wait('innerWidth===780')
  const name = '.board-toolbar button[aria-label="Remove all"]'
  assert(await evaluate(`(() => {const b=document.querySelector(${JSON.stringify(name)});const r=b.getBoundingClientRect();return r.width>0 && r.left>=0 && r.right<=innerWidth && b.title.includes('Conversations')})()`))
  await screenshot('narrow-english')
  await empty('Remove all')
  await evaluate(`localStorage.setItem('rinari.lang','es')`)
  writeFileSync(join(data, 'expected.json'), JSON.stringify({ ids }))
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: ['expanded panes', 'collapsed panes', 'focus mode', 'draft and side panel preservation', 'real Engine turn completes after removal with scripted model', 'sessions remain active', 'English accessible control at 780px'], data }, null, 2))
  console.log('REMOVE_ALL_E2E_OK')
  app.quit()
}
run().catch(async error => {
  console.error(error)
  if (win && !win.isDestroyed()) { console.error((await evaluate('document.body.innerText')).slice(-4500)); await screenshot('failure') }
  app.exit(1)
})
