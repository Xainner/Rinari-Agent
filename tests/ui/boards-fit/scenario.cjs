// «Ajustar a la vista» reparte el ancho real entre los paneles expandidos y
// mantiene visible «Añadir panel»: con 1–6 paneles, tiras colapsadas, modo
// foco, zoom, barra lateral, ventanas estrechas, recarga y migración del
// schema 3. El proveedor es un puerto muerto: el turno falla a propósito.
const assert = require('node:assert/strict')
const { ui, command, domClick, evaluate, menuShortcut, report, scenario, screenshot, seedBoard, size, useLocalModel, wait, delay } = require('../harness.cjs')

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
const fit = 'button[aria-label="Ajustar a la vista"]'
const focusMode = '.board-toolbar button[title="Mantiene expandido solo el panel enfocado; el resto queda en tiras."]'
const collapseAll = '.board-toolbar button[title="Colapsar todo"]'
const collapsePane = '.pane-header button[aria-label="Colapsar panel"]'
const sidePanel = '.pane-header button[aria-label="Mostrar u ocultar panel lateral"]'

scenario(async () => {
  await useLocalModel()
  const ids = []
  for (let i = 0; i < 16; i++) ids.push((await command('session_create', { chat: true, title: 'Prueba Boards ' + (i + 1) })).session.id)
  async function load(count, collapsed = [], fitToView = true, version = 4) {
    const layout = { version, boardId: 'boards_fit_acceptance', fitToView,
      panes: ids.slice(0, count).map((sessionId, i) => ({ paneId: `pane_${i}`, sessionId, width: 650 + i * 50, collapsed: collapsed.includes(i) })),
      focusedPaneId: 'pane_0', messagingEnabled: false }
    if (version < 4) delete layout.fitToView
    await seedBoard(layout)
    await delay(450)
  }
  const passed = []
  for (const count of [1, 2, 3, 6]) {
    await load(count)
    const g = await geometry()
    checkFit(g, count === 6)
    passed.push({ case: `${count} panes`, ...g })
    await screenshot(`panes-${count}`)
  }
  await load(3)
  // El borrador y la identidad del composer sobreviven al cambio de modo.
  await evaluate(`(() => { const el=document.querySelector('textarea'); window.savedComposer=el;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Borrador de prueba');
    el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await domClick(fit)
  assert.equal((await geometry()).handles, 3)
  assert.deepEqual((await geometry()).panes.map((p) => p.width), [650, 700, 750])
  await domClick(fit)
  assert(await evaluate('window.savedComposer === document.querySelector("textarea") && window.savedComposer.value === "Borrador de prueba"'))
  checkFit(await geometry(), false)
  await domClick(collapsePane)
  checkFit(await geometry(), false)
  assert.equal((await geometry()).strips.length, 1)
  await domClick(focusMode)
  assert.equal((await geometry()).panes.length, 1)
  checkFit(await geometry(), false)
  await domClick(focusMode)
  assert.equal((await geometry()).panes.length, 2)
  await domClick(collapseAll)
  checkFit(await geometry(), false)
  assert.equal((await geometry()).panes.length, 0)
  await domClick(fit)
  assert.equal((await geometry()).panes.length, 3)
  checkFit(await geometry(), false)
  // Con el ajuste ya activo antes de Colapsar todo, un clic revela todo.
  await domClick(fit)
  await domClick(collapseAll)
  await domClick(fit)
  assert.equal((await geometry()).panes.length, 3)
  checkFit(await geometry(), false)
  // Un solo panel colapsado y el modo foco se revelan igual.
  await domClick(collapsePane)
  await domClick(fit)
  assert.equal((await geometry()).panes.length, 3)
  checkFit(await geometry(), false)
  await domClick(focusMode)
  await domClick(fit)
  assert.equal((await geometry()).panes.length, 3)
  checkFit(await geometry(), false)
  await screenshot('fit-reveals-collapsed')
  await size(1200, 850)
  checkFit(await geometry(), true)
  await size(1500, 850)
  checkFit(await geometry(), false)
  ui.win.webContents.setZoomFactor(1.25)
  await delay(500)
  checkFit(await geometry(), true)
  ui.win.webContents.setZoomFactor(1)
  await delay(500)
  checkFit(await geometry(), false)
  await screenshot('restored-after-zoom')
  await domClick('button[aria-label="Colapsar barra"]')
  checkFit(await geometry(), false)
  await domClick('button[aria-label="Expandir barra"]')
  checkFit(await geometry(), false)
  // Un panel estrecho conserva la preferencia del lateral pero lo muestra como cajón.
  await domClick(sidePanel)
  await wait('document.querySelector(".session-workspace").dataset.dock === "drawer"')
  await domClick(fit)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(sidePanel)}).getAttribute('aria-pressed')`), 'true')
  await domClick(fit)
  await domClick(sidePanel)
  // Persistencia real: recarga sin fixture y vuelve a medir.
  await delay(400)
  ui.win.webContents.reload()
  await wait('Boolean(document.querySelector(".view-switcher"))')
  await domClick('.view-switcher button[aria-label="Boards"]')
  await wait('document.querySelectorAll(".session-pane").length === 3')
  await delay(400)
  checkFit(await geometry(), false)
  assert.equal(await evaluate('document.querySelector("textarea").value'), 'Borrador de prueba')
  const beforeTurn = (await geometry()).panes.map((p) => p.width)
  await domClick('.session-pane button[aria-label="Enviar mensaje"]')
  await wait('document.querySelector(".session-pane").dataset.status === "failed"')
  assert.deepEqual((await geometry()).panes.map((p) => p.width), beforeTurn)
  await screenshot('turn-failed-compact')
  // La barra conserva nombres accesibles sin etiquetas; Añadir sigue usable con desbordamiento.
  await size(800, 850)
  checkFit(await geometry(), true)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${fit} span')).display`), 'none')
  await domClick('.board-add-column button')
  await wait('Boolean(document.querySelector("[role=dialog]"))')
  await screenshot('add-dialog-narrow')
  await evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Chat general')).click()`)
  await wait('document.querySelectorAll(".session-pane").length === 4')
  checkFit(await geometry(), true)
  // Quitar el panel recién enfocado con el atajo del producto (Ctrl+W).
  await evaluate('document.activeElement?.blur()')
  await menuShortcut('close-session', 'CmdOrCtrl+W')
  await wait('document.querySelectorAll(".session-pane").length === 3')
  checkFit(await geometry(), true)
  await load(16, ids.map((_, i) => i))
  checkFit(await geometry(), true)
  await screenshot('collapsed-overflow')
  await size(1500, 850)
  await load(3, [], true, 3)
  assert.equal((await geometry()).handles, 3)
  await domClick(fit)
  checkFit(await geometry(), false)
  // Sin máximo manual al ajustar, también en un monitor ancho.
  await size(2200, 850)
  await load(1)
  checkFit(await geometry(), false)
  assert((await geometry()).panes[0].width > 1600)
  // Un layout de una versión futura no se reescribe.
  await seedBoard({ version: 99, boardId: 'future', panes: [] }, { open: false })
  await delay(700)
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("rinari.board.v1")).version'), 99)
  await size(1500, 850)
  ids.shift() // deja conversaciones frescas para revisar con --keep
  await load(3)
  report({ realEngine: true, provider: 'dead loopback port; failed turn expected, no external model calls',
    checks: ['equal widths: 1/2/3/6 panes', 'manual width restoration', 'composer identity and draft',
      'collapse, expand, focus mode', 'fit reveals collapsed panes from manual, fit and focus modes', 'resize, sidebar, 125% zoom', 'side panel drawer preference',
      'reload persistence', 'real failed turn does not redistribute', 'compact accessible toolbar',
      'add and remove through UI', 'all collapsed overflow', 'schema 3 migration',
      'single pane above 1600px', 'future schema write protection'], cases: passed })
}, { width: 1500, height: 850 })
