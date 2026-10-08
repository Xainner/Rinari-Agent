const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, key, panesFor, q, reload, report, scenario, screenshot, seedBoard, size, ui, until, useLocalModel, wait, delay } = require('../harness.cjs')
const scroller = '.conversation-enter > .overflow-y-auto'
const arrow = 'button[aria-label="Ir al final"]'
const stop = 'button[aria-label="Detener generación"]'
const steer = 'button[aria-label="Enviar ahora, sin detenerla"]'
const show = 'button[aria-label="Ver actividad del turno"]'
const hide = 'button[aria-label="Ocultar actividad del turno"]'
const operations = '[data-activity-disclosure="operations"] > div > button[aria-expanded]'
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then(r => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waiting')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then(r => r.json()), true)
}
async function above(prefix = '') {
  // A person scrolls with a gesture; only a gesture ends «follow the end» after sending.
  // Disclosures restore their reading anchor on the next frames, so settle first and
  // scroll again if a pending restoration moved the view back.
  for (let attempt = 0; attempt < 3; attempt++) {
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
    await evaluate(`(() => {const el=${q(prefix + ' ' + scroller)};el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-120}));el.scrollTop=0;el.dispatchEvent(new Event('scroll'))})()`)
    try { await wait(`Boolean(${q(prefix + ' ' + arrow)})`, 3_000); return } catch { /* settle and retry */ }
  }
  await wait(`Boolean(${q(prefix + ' ' + arrow)})`)
}
/**
 * A real click at a toggle that moves the content around it can land beside
 * its target. Click until the expected state holds, at most three times.
 */
async function press(selector, done) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await evaluate(done)) return
    await click(selector)
    try { await wait(done, 3_000); return } catch { /* retry */ }
  }
  await wait(done)
}
const expanded = (selector, value) => `${q(selector)}?.getAttribute('aria-expanded')==='${value}'`
async function fits(prefix = '') {
  await wait(`(() => {const el=${q(prefix + ' ' + scroller)};return el && el.scrollHeight <= el.clientHeight+1})()`)
  await wait(`!${q(prefix + ' ' + arrow)}`)
}
async function checkpointError(prefix = '') {
  await clickText('Workspace', prefix + ' .pane-dock-tabs button')
  await clickText('Checkpoints', prefix + ' [role=tab]')
  await wait(`${q(prefix + ' .session-dock')}?.innerText.includes('INVALID_USAGE')`)
  assert.equal(await evaluate(`(${q(prefix + ' .session-dock')}.innerText.match(/Checkpoints require a Git repository/g)||[]).length`), 1)
  assert.equal(await evaluate(`document.querySelectorAll('[data-sonner-toast]').length`), 0)
  assert.equal(await evaluate(`${q(prefix + ' .session-dock')}.innerText.includes('Sin checkpoints.')`), false)
  await clickText('Reintentar', prefix + ' .session-dock button')
  await wait(`${q(prefix + ' .session-dock')}?.innerText.includes('INVALID_USAGE')`)
  assert.equal(await evaluate(`document.querySelectorAll('[data-sonner-toast]').length`), 0)
  await screenshot(prefix ? 'boards-checkpoints' : 'normal-checkpoints')
  await click(prefix + ' button[aria-label="Cerrar panel lateral"]')
}

scenario(async () => {
  await useLocalModel()
  const ids = []
  for (const title of ['Interacciones A', 'Interacciones B', ...Array.from({ length: 16 }, (_, i) => `${i}-` + 'ConversacionSinEspaciosConUnNombreMuyLargo'.repeat(7))]) {
    ids.push((await command('session_create', { chat: true, title })).session.id)
  }
  await reload()
  await clickText('Interacciones A', 'aside button', { includes: true })
  await input('.composer-surface textarea', 'Revisa la carpeta')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  for (let step = 0; step < 12; step++) await release()
  await until(async () => await pending() > 0, 'final held')
  await wait(`Boolean(${q(operations)})`)
  await press(operations, expanded(operations, 'true'))
  // Open each operation through its actual summary, retaining inspection state.
  await evaluate(`for(const d of document.querySelectorAll('[data-operation-group] details')) if(!d.open)d.querySelector('summary').click()`)
  await wait(`(()=>{const el=${q(scroller)};return el.scrollHeight>el.clientHeight+100})()`)
  await above()
  await screenshot('normal-expanded-above')
  await press(operations, expanded(operations, 'false'))
  await fits()
  await screenshot('normal-folded-no-arrow')

  await input('.composer-surface textarea', 'Borrador para guiar')
  assert(await evaluate(`Boolean(${q(steer)}) && !${q(stop)}`))
  await input('.composer-surface textarea', '   ')
  assert(await evaluate(`Boolean(${q(stop)}) && !${q(steer)}`))
  await input('.composer-surface textarea', 'INSTRUCCIÓN EN VIVO')
  await click(steer)
  await wait(`Boolean(${q(stop)}) && !${q(steer)}`)
  await release()
  await wait(`document.body.innerText.includes('REVISIÓN TERMINADA')`)
  // A steering message may require another model step before the turn closes.
  await until(async () => {
    if (await pending() > 0) await release()
    return evaluate(`!${q(stop)}`)
  }, 'turn completed after steering')
  await wait(`Boolean(${q(show)})`)
  await fits()
  await press(show, `Boolean(${q(hide)})`)
  await press(operations, expanded(operations, 'true'))
  await above()
  await press(hide, `!${q(hide)}`)
  await fits()

  await click('.app-topbar-dock-button')
  await checkpointError()
  await seedBoard({ boardId: 'interaction-fixes', panes: panesFor(ids.slice(0, 2)), focusedPaneId: 'pane_0' })
  const a = '[data-pane-id="pane_0"]', b = '[data-pane-id="pane_1"]'
  await press(a + ' ' + show, `Boolean(${q(a + ' ' + hide)})`)
  // The outer summary restores the inspected operations and their scroll.
  await press(a + ' ' + operations, expanded(a + ' ' + operations, 'true'))
  await above(a)
  await press(a + ' ' + hide, `!${q(a + ' ' + hide)}`)
  await fits(a)
  assert.equal(await evaluate(`Boolean(${q(b + ' ' + arrow)})`), false)
  await click(a + ' button[aria-label="Mostrar u ocultar panel lateral"]')
  await checkpointError(a)

  await input(b + ' textarea', 'Turno para detener')
  await click(b + ' button[aria-label="Enviar mensaje"]')
  await until(async () => await pending() > 0, 'board model held')
  await input(b + ' textarea', 'Mensaje durante el turno')
  assert(await evaluate(`Boolean(${q(b + ' ' + steer)}) && !${q(b + ' ' + stop)}`))
  await input(b + ' textarea', '')
  await click(b + ' ' + stop)
  await wait(`!${q(b + ' ' + stop)}`)
  assert.equal(await evaluate(`${q(b)}.innerText.includes('NO DEBE APARECER TRAS DETENER')`), false)

  // Force native scrollbars and long labels at a short window and 125% zoom.
  await size(1500, 650)
  ui.win.webContents.setZoomFactor(1.25)
  await delay(400)
  await input('aside input', 'ConversacionSinEspacios')
  const sidebar = await evaluate(`(()=>{const el=document.querySelector('.sidebar-scroll');return {width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,x:getComputedStyle(el).overflowX,y:getComputedStyle(el).overflowY}})()`)
  assert.equal(sidebar.x, 'hidden')
  assert.equal(sidebar.y, 'auto')
  assert(sidebar.scrollHeight > sidebar.height, 'vertical scrolling remains available')
  assert(sidebar.scrollWidth <= sidebar.width + 1, 'long names fit the sidebar width')
  await screenshot('sidebar-long-names')
  await input('aside input', '')
  ui.win.webContents.setZoomFactor(1)
  await size(1500, 900)
  await screenshot('ready-for-review')
  // Subsequent messages in the review app answer locally without manual releases.
  const interval = setInterval(() => { void fetch(new URL('/__release?lane=main', ui.model)).catch(() => {}) }, 1000)
  if (!ui.keep) clearInterval(interval)
  report({ realEngine: true, checks: ['Normal and Boards', 'folding active operations and completed turns removes stale arrow', 'inspection restored', 'one inline checkpoint error and retry', 'Send/Stop typing, clearing, steering and cancellation', 'long sidebar names with vertical-only scroll'], sidebar })
}, { width: 1500, height: 900 })
