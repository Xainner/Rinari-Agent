const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')
const assert = require('node:assert/strict')

app.setPath('userData', process.env.BOARDS_FIT_PROFILE)
require('../../dist-electron/main.cjs')
const output = process.env.BOARDS_FIT_OUTPUT
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let win
const evaluate = (code) => win.webContents.executeJavaScript(code)
async function wait(code) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await evaluate(code)) return
    await delay(80)
  }
  throw new Error(`Timed out: ${code}`)
}
async function click(selector) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  await delay(150)
}
async function screenshot(name) {
  writeFileSync(join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG())
}
async function seedLayout(layout) {
  // Test fixture only: prevent the outgoing document's unload flush from
  // replacing the next launch's persisted fixture with its current store.
  await evaluate(`(() => {
    const write = Storage.prototype.setItem;
    write.call(localStorage, 'rinari.board.v1', ${JSON.stringify(JSON.stringify(layout))});
    Storage.prototype.setItem = function(key, value) {
      if(key !== 'rinari.board.v1') write.call(this, key, value);
    };
  })()`)
}
async function geometry() {
  return evaluate(`(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x, right:r.right, width:r.width, height:r.height } }
    const row = document.querySelector('.board-pane-row')
    return {
      viewport:innerWidth, canvas:rect(document.querySelector('.board-canvas')),
      row:rect(row), scrollWidth:row.scrollWidth, clientWidth:row.clientWidth, scrollLeft:row.scrollLeft,
      panes:[...row.querySelectorAll(':scope > .session-pane')].map(rect),
      strips:[...row.querySelectorAll(':scope > [data-collapsed]')].map(rect),
      add:rect(document.querySelector('.board-add-column')),
      overflow:document.body.textContent.includes('No caben todos los paneles'),
      handles:document.querySelectorAll('.board-pane-resizer').length,
    }
  })()`)
}
function checkFit(g, overflow) {
  assert(g.add.right <= g.canvas.right + 1, 'Add pane must stay visible')
  assert(g.add.x >= g.canvas.x, 'Add pane must not leave the viewport')
  assert.equal(g.handles, 0, 'No manual resize while fitting')
  if (g.panes.length) {
    const widths = g.panes.map((p) => p.width)
    assert(Math.max(...widths) - Math.min(...widths) <= 1, 'Equal pane widths')
    assert(widths.every((width) => width >= 319), 'Readable compact minimum')
  }
  assert.equal(g.overflow, overflow)
  if (!overflow) {
    assert(g.scrollWidth <= g.clientWidth + 1, 'No residual horizontal overflow')
    assert.equal(g.scrollLeft, 0)
    if (g.panes.length) assert(Math.abs(g.panes.reduce((sum, p) => sum + p.width, 0) + g.strips.reduce((sum, p) => sum + p.width, 0) - g.row.width) <= 1, 'Uses all actual available width')
  }
}
async function run() {
  await app.whenReady()
  while (!(win = BrowserWindow.getAllWindows()[0])) await delay(50)
  await wait('Boolean(window.rinariDesktop)')
  await wait('(async () => (await window.rinariDesktop.engine.status()).state === "ready")()')
  const ids = await evaluate(`(async () => {
    await window.rinariDesktop.command('provider_create',{alias:'prueba-local',provider_type:'custom',auth_method:'none',endpoint:'http://127.0.0.1:9/v1'})
    await window.rinariDesktop.command('model_add',{provider:'prueba-local',provider_model_id:'fixture',alias:'prueba-local'})
    await window.rinariDesktop.command('model_use',{reference:'prueba-local'})
    const ids=[]
    for(let i=0;i<16;i++) {
      const result=await window.rinariDesktop.command('session_create',{chat:true,title:'Prueba Boards '+(i+1)})
      ids.push(result.session.id)
    }
    return ids
  })()`)
  async function load(count, collapsed = [], fit = true, version = 4) {
    const layout = { version, boardId: 'boards_fit_acceptance', fitToView: fit,
      panes: ids.slice(0, count).map((id, i) => ({ paneId: `pane_${i}`, sessionId: id, width: 650 + i * 50, collapsed: collapsed.includes(i) })),
      focusedPaneId: 'pane_0', messagingEnabled: false }
    if (version < 4) delete layout.fitToView
    await seedLayout(layout)
    win.webContents.reload()
    await wait('Boolean(document.querySelector(".view-switcher"))')
    await delay(500)
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Configurar después')?.click()`)
    await click('.view-switcher button[aria-label="Boards"]')
    await wait(`document.querySelectorAll('[data-pane-id]').length === ${count}`)
    await delay(450)
  }
  async function size(width) {
    if (win.isMaximized()) { win.unmaximize(); await delay(500) }
    win.setMinimumSize(480, 500)
    win.setContentSize(width, 850)
    await wait(`Math.abs(innerWidth - ${width}) <= 2`)
    await delay(300)
  }
  const report = []
  await size(1500)
  for (const count of [1, 2, 3, 6]) {
    await load(count)
    const g = await geometry()
    checkFit(g, count === 6)
    report.push({ case: `${count} panes`, ...g })
    await screenshot(`panes-${count}`)
  }
  await load(3)
  // A draft and its DOM identity survive the mode toggle.
  await evaluate(`(() => { const el=document.querySelector('textarea'); window.savedComposer=el;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Borrador de prueba');
    el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await click('button[aria-label="Ajustar a la vista"]')
  assert.equal((await geometry()).handles, 3)
  assert.deepEqual((await geometry()).panes.map((p) => p.width), [650, 700, 750])
  await click('button[aria-label="Ajustar a la vista"]')
  assert(await evaluate('window.savedComposer === document.querySelector("textarea") && window.savedComposer.value === "Borrador de prueba"'))
  checkFit(await geometry(), false)
  await click('.pane-header button[aria-label="Colapsar panel"]')
  checkFit(await geometry(), false)
  assert.equal((await geometry()).strips.length, 1)
  await click('.board-toolbar button[title="Mantiene expandido solo el panel enfocado; el resto queda en tiras."]')
  assert.equal((await geometry()).panes.length, 1)
  checkFit(await geometry(), false)
  await click('.board-toolbar button[title="Mantiene expandido solo el panel enfocado; el resto queda en tiras."]')
  assert.equal((await geometry()).panes.length, 2)
  await click('.board-toolbar button[title="Colapsar todo"]')
  checkFit(await geometry(), false)
  assert.equal((await geometry()).panes.length, 0)
  await click('.board-toolbar button[title="Expandir todo"]')
  await size(1200)
  checkFit(await geometry(), true)
  await size(1500)
  checkFit(await geometry(), false)
  win.webContents.setZoomFactor(1.25)
  await delay(500)
  checkFit(await geometry(), true)
  win.webContents.setZoomFactor(1)
  await delay(500)
  checkFit(await geometry(), false)
  await screenshot('restored-after-zoom')
  await click('button[aria-label="Colapsar barra"]')
  checkFit(await geometry(), false)
  await click('button[aria-label="Expandir barra"]')
  checkFit(await geometry(), false)
  // A narrow pane keeps the dock preference but presents it as a drawer.
  await click('.pane-header button[aria-label="Mostrar u ocultar dock"]')
  await wait('document.querySelector(".session-workspace").dataset.dock === "drawer"')
  await click('button[aria-label="Ajustar a la vista"]')
  assert.equal(await evaluate(`document.querySelector('.pane-header button[aria-label="Mostrar u ocultar dock"]').getAttribute('aria-pressed')`), 'true')
  await click('button[aria-label="Ajustar a la vista"]')
  await click('.pane-header button[aria-label="Mostrar u ocultar dock"]')
  // Real persistence: reload without a fixture override, then remeasure.
  await delay(400)
  win.webContents.reload()
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await click('.view-switcher button[aria-label="Boards"]')
  await wait('document.querySelectorAll(".session-pane").length === 3')
  await delay(400)
  checkFit(await geometry(), false)
  assert.equal(await evaluate('document.querySelector("textarea").value'), 'Borrador de prueba')
  const beforeTurn = (await geometry()).panes.map(p => p.width)
  await click('.session-pane button[aria-label="Enviar mensaje"]')
  await wait('document.querySelector(".session-pane").dataset.status === "failed"')
  assert.deepEqual((await geometry()).panes.map(p => p.width), beforeTurn)
  await screenshot('turn-failed-compact')
  // Toolbar remains named when labels disappear; add remains usable on overflow.
  await size(800)
  checkFit(await geometry(), true)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('button[aria-label="Ajustar a la vista"] span')).display`), 'none')
  await click('.board-add-column button')
  await wait('Boolean(document.querySelector("[role=dialog]"))')
  await screenshot('add-dialog-narrow')
  await evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Chat general')).click()`)
  await wait('document.querySelectorAll(".session-pane").length === 4')
  checkFit(await geometry(), true)
  // Removing the newly focused pane uses the product keyboard shortcut.
  await evaluate(`document.activeElement?.blur()`)
  win.webContents.sendInputEvent({type:'keyDown', keyCode:'w', modifiers:['control']})
  win.webContents.sendInputEvent({type:'keyUp', keyCode:'w', modifiers:['control']})
  await wait('document.querySelectorAll(".session-pane").length === 3')
  checkFit(await geometry(), true)
  await load(16, ids.map((_, i) => i))
  checkFit(await geometry(), true)
  await screenshot('collapsed-overflow')
  await size(1500)
  await load(3, [], true, 3)
  assert.equal((await geometry()).handles, 3)
  await click('button[aria-label="Ajustar a la vista"]')
  checkFit(await geometry(), false)
  // Fit has no manual maximum, including on a wide monitor.
  await size(2200)
  await load(1)
  checkFit(await geometry(), false)
  assert((await geometry()).panes[0].width > 1600)
  // Exercise future-version write protection in the actual loaded store.
  await seedLayout({version:99,boardId:'future',panes:[]})
  win.webContents.reload()
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await delay(700)
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("rinari.board.v1")).version'), 99)
  await size(1500)
  ids.shift() // Leave fresh conversations in the interactive preview.
  await load(3)
  writeFileSync(join(output, 'report.json'), JSON.stringify({ ok: true, realEngine: true,
    provider: 'loopback fixture; failed turn expected, no external model calls',
    checks: ['equal widths: 1/2/3/6 panes', 'manual width restoration', 'composer identity and draft',
      'collapse, expand, focus mode', 'resize, sidebar, 125% zoom', 'dock drawer preference',
      'reload persistence', 'real failed turn does not redistribute', 'compact accessible toolbar',
      'add and remove through UI', 'all collapsed overflow', 'schema 3 migration',
      'single pane above 1600px', 'future schema write protection'], report }, null, 2))
  console.log('BOARDS_FIT_OK ' + output)
}
const timeout = setTimeout(() => { console.error('Boards fit timed out'); app.exit(1) }, 180000)
run().then(async () => {
  clearTimeout(timeout)
  if (process.env.BOARDS_FIT_KEEP === '1') { win.setTitle('Rinari Agent — Prueba Ajustar a la vista'); win.show(); return }
  await evaluate('window.rinariDesktop.engine.shutdown()')
  app.exit(0)
}).catch(async (error) => {
  clearTimeout(timeout)
  console.error(error)
  if (win) {
    await screenshot('failure').catch(() => {})
    await evaluate('window.rinariDesktop.engine.shutdown()').catch(() => {})
  }
  app.exit(1)
})
