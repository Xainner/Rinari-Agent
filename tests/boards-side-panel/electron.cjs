const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { writeFileSync, readFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const data = process.env.SIDE_PANEL_DATA
const output = process.env.SIDE_PANEL_OUTPUT
app.setPath('userData', join(data, 'profile'))
require('../../dist-electron/main.cjs')
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
let win
const evaluate = (code) => win.webContents.executeJavaScript(code)
async function wait(code) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await evaluate(code)) return
    await delay(100)
  }
  throw new Error(`Timed out: ${code}`)
}
async function click(selector) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'})`)
  await delay(300)
  const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  await delay(200)
}
async function clickText(text, selector = 'button') {
  await wait(`[...document.querySelectorAll(${JSON.stringify(selector)})].some(b=>b.textContent.trim()===${JSON.stringify(text)})`)
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`)
  await delay(200)
}
const command = (name, args = {}) => evaluate(`window.rinariDesktop.command(${JSON.stringify(name)},${JSON.stringify(name === 'session_create' ? { mode: 'build', permission_profile: 'workspace', ...args } : args)})`)
const layouts = () => evaluate(`JSON.parse(localStorage.getItem('rinari.sessionDock.v1') || '{}')`)
const board = () => evaluate(`JSON.parse(localStorage.getItem('rinari.board.v1') || '{}')`)
async function layout(id) { return Object.entries(await layouts()).find(([key]) => key.endsWith('::' + id))?.[1] }
async function pane(id) { return `[data-pane-id="${(await board()).panes.find(p=>p.sessionId===id).paneId}"]` }
async function state(id, visible) {
  const p = await pane(id)
  await wait(`document.querySelector(${JSON.stringify(p + ' .session-workspace')})?.dataset.dock ${visible ? '!==' : '==='} 'hidden'`)
  assert.equal((await layout(id)).visible, visible)
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(p + ' [data-testid="session-dock"]')}))`), visible)
}
async function ready() {
  await wait('Boolean(window.rinariDesktop)')
  await wait('(async () => (await window.rinariDesktop.engine.status()).state === "ready")()')
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await delay(400)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Configurar después')?.click()`)
}
async function add(title) {
  const count = await evaluate('document.querySelectorAll(".session-pane[data-pane-id]").length')
  await click(count ? '.board-toolbar .is-primary' : '.board-empty-primary')
  await wait(`Boolean(document.querySelector('[role="dialog"] .add-pane-row'))`)
  await evaluate(`[...document.querySelectorAll('[role="dialog"] .add-pane-row')].find(b=>b.textContent.includes(${JSON.stringify(title)})).click()`)
  await wait(`document.querySelectorAll('.session-pane[data-pane-id]').length===${count + 1}`)
  await wait(`JSON.parse(localStorage.getItem('rinari.board.v1') || '{}').panes?.length===${count + 1}`)
  await delay(300)
  return (await board()).panes.at(-1).sessionId
}
async function screenshot(name) { writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
async function run() {
  await app.whenReady()
  while (!(win = BrowserWindow.getAllWindows()[0])) await delay(50)
  await ready()
  if (win.isMaximized()) win.unmaximize()
  win.setContentSize(1500, 880)
  if (process.env.SIDE_PANEL_PHASE === 'restart') {
    const saved = JSON.parse(readFileSync(join(data, 'expected.json'), 'utf8'))
    assert.deepEqual(await layouts(), saved.layouts, 'Side panel layouts survive a complete process restart')
    await click('.view-switcher button[aria-label="Boards"]')
    for (const id of saved.ids) await state(id, saved.visibility[id])
    const fresh = await add('Chat general')
    await state(fresh, false)
    console.log('SIDE_PANEL_RESTART_OK: old preferences restored, new session still closed')
    await screenshot('restart-new-closed')
    if (process.env.SIDE_PANEL_KEEP === '1') {
      win.setTitle('Rinari Agent — Prueba panel lateral cerrado')
      win.show(); win.focus(); return
    }
    app.quit(); return
  }
  const report = []
  await command('provider_create', { alias: 'prueba-local', provider_type: 'custom', auth_method: 'none', endpoint: 'http://127.0.0.1:9/v1' })
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fixture', alias: 'prueba-local' })
  await command('model_use', { reference: 'prueba-local' })
  const { session: a } = await command('session_create', { chat: true, title: 'Sin preferencias' })
  const { session: saved } = await command('session_create', { chat: true, title: 'Lateral guardado' })
  win.webContents.reload(); await ready()
  await clickText('Lateral guardado')
  await click('button[aria-label="Panel lateral"]')
  await clickText('Tareas', '[role="tab"]')
  const kept = await layout(saved.id)
  assert.equal(kept.visible, true)
  assert.equal(kept.workspaceTab, 'tasks')
  await click('.view-switcher button[aria-label="Boards"]')
  await add('Sin preferencias'); await state(a.id, false)
  assert.equal(await evaluate('document.querySelectorAll("[data-testid=session-dock]").length'), 0)
  const fresh = await add('Chat general'); await state(fresh, false)
  await state(a.id, false)
  report.push('Existing session without preferences and newly created session both start closed')
  await screenshot('new-panels-closed')
  await add('Lateral guardado'); await state(saved.id, true)
  assert.deepEqual(await layout(saved.id), kept)
  const pa = await pane(a.id)
  const toggle = 'button[aria-label="Mostrar u ocultar panel lateral"]'
  await click(pa + ' .pane-header-title')
  await delay(400)
  await click(pa + ' ' + toggle); await state(a.id, true)
  await state(fresh, false)
  assert.deepEqual(await layout(saved.id), kept)
  const close = pa + ' button[aria-label="Cerrar panel lateral"]'
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(close)}).title`), 'Cerrar panel lateral')
  await click(close); await state(a.id, false)
  assert.equal((await board()).panes.length, 3)
  assert.equal((await command('session_get', { reference: a.id })).session.state, 'active')
  await click('button[aria-label="Panel lateral"]'); await state(a.id, true)
  report.push('Header and topbar target the focused session; closing keeps the conversation and other layouts')
  await click(pa + ' button[aria-label="Opciones del panel"]')
  await clickText('Quitar del board', '[role="menuitem"]')
  await add('Sin preferencias'); await state(a.id, true)
  assert.equal((await board()).panes.length, 3)
  report.push('Normal preference and Workspace tab survive Boards; removal/re-add preserves open layout')
  const currentPane = await pane(a.id)
  await click(currentPane + ' button[aria-label="Cerrar panel lateral"]')
  // Fixture for a narrow manual pane. Prevent the outgoing board flush from
  // overwriting this width; preferences being tested are not altered.
  await evaluate(`(() => {
    const value=JSON.parse(localStorage.getItem('rinari.board.v1'));
    value.panes.find(p=>p.sessionId===${JSON.stringify(a.id)}).width=480;
    const write=Storage.prototype.setItem;
    write.call(localStorage,'rinari.board.v1',JSON.stringify(value));
    Storage.prototype.setItem=function(key,value){if(key!=='rinari.board.v1')write.call(this,key,value)};
  })()`)
  win.webContents.reload(); await ready()
  await click('.view-switcher button[aria-label="Boards"]')
  await state(a.id, false)
  const narrow = await pane(a.id)
  await click(narrow + ' ' + toggle); await state(a.id, true)
  await wait(`document.querySelector(${JSON.stringify(narrow + ' [data-testid="session-dock"]')})?.dataset.layout==='drawer'`)
  assert(await evaluate(`document.querySelector(${JSON.stringify(narrow + ' [data-testid="session-dock"]')}).contains(document.activeElement)`))
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await state(a.id, false)
  report.push('Narrow closed pane has no drawer; explicit opening creates a focused drawer and Escape closes it')
  await evaluate(`localStorage.setItem('rinari.lang','en')`)
  win.webContents.reload(); await ready()
  await click('.view-switcher button[aria-label="Boards"]')
  const english = await pane(a.id)
  await click(english + ' button[aria-label="Show or hide side panel"]')
  await state(a.id, true)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(english + ' button[aria-label="Close side panel"]')}).title`), 'Close side panel')
  assert(await evaluate(`Boolean(document.querySelector(${JSON.stringify(english + ' [aria-label="Session side panel"]')}))`))
  await screenshot('english-side-panel')
  await click(english + ' button[aria-label="Close side panel"]')
  await state(a.id, false)
  await evaluate(`localStorage.setItem('rinari.lang','es')`)
  report.push('Spanish and English controls use consistent tooltip and accessible side-panel names')
  const ids = [a.id, fresh, saved.id]
  const visibility = { [a.id]: false, [fresh]: false, [saved.id]: true }
  writeFileSync(join(data, 'expected.json'), JSON.stringify({ layouts: await layouts(), ids, visibility }, null, 2))
  writeFileSync(join(output, 'report.json'), JSON.stringify({ report, data }, null, 2))
  console.log('SIDE_PANEL_E2E_OK ' + JSON.stringify(report))
  app.quit()
}
run().catch(async error => {
  console.error(error)
  if (win && !win.isDestroyed()) {
    console.error((await evaluate('document.body.innerText')).slice(-5000))
    await screenshot('failure')
  }
  app.exit(1)
})
