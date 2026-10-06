// La flecha «Ir al final» aparece junto al composer, centrada y sin quedar
// tapada, en la vista Normal y en Boards, con el composer compacto o crecido.
const assert = require('node:assert/strict')
const { click, command, evaluate, input, panesFor, q, reload, report, scenario, screenshot, seedBoard, size, useLocalModel, wait, delay } = require('../harness.cjs')

const scroller = '.conversation-enter > .overflow-y-auto'
const arrow = 'button[aria-label="Ir al final"]'
const metrics = []

async function readAbove(prefix) {
  await evaluate(`(() => {const el=${q(prefix + ' ' + scroller)};el.scrollTop=Math.max(0,el.scrollHeight-el.clientHeight-450);el.dispatchEvent(new Event('scroll'))})()`)
  await wait(`Boolean(${q(prefix + ' ' + arrow)})`)
}
async function verify(prefix, name) {
  await readAbove(prefix)
  const rects = await evaluate(`(() => {const b=${q(prefix + ' ' + arrow)}.getBoundingClientRect(),c=${q(prefix + ' .composer-surface')}.getBoundingClientRect();return {gap:c.top-b.bottom,center:Math.abs((b.left+b.width/2)-(c.left+c.width/2)),buttonBottom:b.bottom,composerTop:c.top}})()`)
  assert(rects.gap >= 8 && rects.gap <= 32, name + ': arrow should stay near composer: ' + JSON.stringify(rects))
  assert(rects.center < 2, name + ': centered over composer')
  assert(await evaluate(`(() => {const b=${q(prefix + ' ' + arrow)};const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===b})()`), name + ': arrow is unobstructed')
  metrics.push({ name, ...rects })
  await screenshot(name)
  await click(prefix + ' ' + arrow)
  await wait(`!${q(prefix + ' ' + arrow)}`)
  await wait(`(() => {const el=${q(prefix + ' ' + scroller)};return el.scrollHeight-el.scrollTop-el.clientHeight<80})()`)
}
const draft = Array.from({ length: 8 }, (_, i) => 'Línea de borrador ' + i).join('\n')

scenario(async () => {
  await useLocalModel()
  const ids = []
  for (const title of ['Prueba flecha A', 'Prueba flecha B', 'Prueba vacía']) ids.push((await command('session_create', { chat: true, title })).session.id)
  await reload()
  await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes('Prueba flecha A')).click()`)
  await wait('Boolean(document.querySelector(".composer-surface"))')
  assert.equal(await evaluate(`Boolean(${q(arrow)})`), false, 'Empty chat should not show the arrow')
  await input('.composer-surface textarea', 'Genera un historial largo de prueba.')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('FIN DEL HISTORIAL DE PRUEBA')`)
  await wait(`!document.querySelector('button[aria-label="Detener generación"]')`)
  await delay(500)
  await verify('', 'normal-compact')
  await input('.composer-surface textarea', draft)
  await verify('', 'normal-expanded')
  await seedBoard({ boardId: 'scroll_acceptance', panes: panesFor(ids.slice(0, 2)), focusedPaneId: 'pane_0' })
  const a = '[data-pane-id="pane_0"]'
  const b = '[data-pane-id="pane_1"]'
  await input(a + ' textarea', '')
  await verify(a, 'board-compact')
  await input(a + ' textarea', draft)
  await verify(a, 'board-expanded')
  assert.equal(await evaluate(`Boolean(${q(b + ' ' + arrow)})`), false, 'Empty sibling has no arrow')
  await size(1200, 720)
  await verify(a, 'board-short-window')
  await size(1500, 900)
  await input(a + ' textarea', '')
  await readAbove(a)
  await screenshot('ready-for-review')
  report({ passed: ['real Engine turn', 'hidden at bottom and empty chats', 'button reaches end', 'centered near composer', 'composer height changes', 'Normal and Boards', 'short window'], metrics })
})
