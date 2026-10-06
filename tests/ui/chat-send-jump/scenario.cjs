// Enviar desde arriba del historial lleva al final en cuanto el Engine acepta
// el mensaje, en Normal y en Boards. En Boards solo se mueve el panel que
// envía; el vecino conserva su lectura.
const assert = require('node:assert/strict')
const { click, command, evaluate, input, key, panesFor, q, reload, report, scenario, screenshot, seedBoard, useLocalModel, wait, delay } = require('../harness.cjs')

const scroller = '.conversation-enter > .overflow-y-auto'
const atEnd = (prefix) => `(() => {const el=${q(prefix + ' ' + scroller)};return el.scrollHeight-el.scrollTop-el.clientHeight<80})()`

async function fillHistory(prefix, n) {
  await input(prefix + ' .composer-surface textarea', 'Genera historial ' + n)
  await click(prefix + ' .composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`${q(prefix + ' ' + scroller)}?.innerText.includes('FIN DEL HISTORIAL ${n}')`)
  await wait(`!${q(prefix + ' button[aria-label="Detener generación"]')}`)
  await delay(300)
}
async function readUp(prefix) {
  await evaluate(`(() => {const el=${q(prefix + ' ' + scroller)};el.scrollTop=200;el.dispatchEvent(new Event('scroll'))})()`)
  await wait(`Boolean(${q(prefix + ' button[aria-label="Ir al final"]')})`)
  assert.equal(await evaluate(atEnd(prefix)), false)
}
async function sendWithEnter(prefix, text, reply) {
  await click(prefix + ' .composer-surface textarea')
  await input(prefix + ' .composer-surface textarea', text)
  await key('Enter')
  await wait(`${q(prefix + ' ' + scroller)}?.innerText.includes(${JSON.stringify(reply)})`)
  await wait(atEnd(prefix))
  await wait(`!${q(prefix + ' button[aria-label="Ir al final"]')}`)
}

scenario(async () => {
  await useLocalModel()
  const ids = []
  for (const title of ['Salto A', 'Salto B']) ids.push((await command('session_create', { chat: true, title })).session.id)
  await reload()
  await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes('Salto A')).click()`)
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await fillHistory('', 1)
  await readUp('')
  await screenshot('normal-reading')
  await sendWithEnter('', 'Pregunta desde arriba', 'RESPUESTA AL ENVÍO 2')
  await screenshot('normal-after-send')

  await seedBoard({ boardId: 'send_jump', panes: panesFor(ids), focusedPaneId: 'pane_0' })
  const a = '[data-pane-id="pane_0"]'
  const b = '[data-pane-id="pane_1"]'
  await fillHistory(b, 3)
  await readUp(a)
  await readUp(b)
  const neighbour = await evaluate(`${q(b + ' ' + scroller)}.scrollTop`)
  await sendWithEnter(a, 'Otra pregunta desde arriba', 'RESPUESTA AL ENVÍO 4')
  assert.equal(await evaluate(`${q(b + ' ' + scroller)}.scrollTop`), neighbour, 'the neighbour pane keeps its reading position')
  await screenshot('board-after-send')
  report({ passed: ['Normal: Enter from mid-history lands at the end', 'Boards: only the sending pane moves'] })
}, { width: 1500, height: 900 })
