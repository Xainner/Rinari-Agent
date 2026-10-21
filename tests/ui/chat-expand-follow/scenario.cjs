// Abrir la actividad de un turno estando al final del chat no deja el final
// tapado: el chat vuelve al final y lo sigue (antes solo bajaba con una
// herramienta suelta, no con el grupo ni con la tarjeta del turno).
// 1. Desde el final, «Ver actividad del turno» abre y el chat sigue en el final.
// 2. Abrir una operación dentro también deja el chat en el final.
// 3. Cerrar desde el final lo deja en el final.
const assert = require('node:assert/strict')
const { click, clickText, command, delay, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const scroller = '.conversation-enter > .overflow-y-auto'
const show = 'button[aria-label="Ver actividad del turno"]'
const hide = 'button[aria-label="Ocultar actividad del turno"]'
const gap = () => evaluate(`(() => { const el = document.querySelector('${scroller}'); return Math.round(el.scrollHeight - el.scrollTop - el.clientHeight) })()`)
const lastOf = (selector) => `[...document.querySelectorAll('${selector}')].at(-1)`

async function send(text, reply) {
  await input('.composer-surface textarea', text)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.querySelector('${scroller}')?.innerText.includes(${JSON.stringify(reply)})`, 60_000)
  await wait(`!document.querySelector('.composer-surface button[aria-label="Detener generación"]')`, 60_000)
}

async function settledAtEnd(label) {
  await delay(500)
  await settleAnimations()
  const left = await gap()
  assert.ok(left <= 2, `${label}: the chat stays at the end (${left} px left)`)
  assert.equal(await evaluate(`Boolean(document.querySelector('button[aria-label="Ir al final"]'))`), false, `${label}: no «Ir al final»`)
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Bajada' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Bajada', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await send('Genera historial', 'FIN DEL HISTORIAL')
  await send('Busca los archivos de la bajada', 'LISTO CON LA BÚSQUEDA')
  await wait(`Boolean(${lastOf(show)})`)
  await settledAtEnd('before opening')

  // 1. The turn's activity, opened from the end.
  await evaluate(`${lastOf(show)}.click()`)
  await wait(`Boolean(${lastOf(hide)})`)
  await settledAtEnd('turn activity opened')
  await screenshot('turn-opened')

  // 2. An operation inside it.
  await wait(`Boolean(${lastOf('[data-operation-group] details > summary')})`)
  await evaluate(`${lastOf('[data-operation-group] details > summary')}.click()`)
  await wait(`Boolean(${lastOf('[data-operation-group] details[open]')})`)
  await settledAtEnd('operation opened')
  await screenshot('operation-opened')

  // 3. Closing from the end.
  await evaluate(`${lastOf(hide)}.click()`)
  await wait(`Boolean(${lastOf(show)})`)
  await settledAtEnd('turn activity closed')
  report({ passed: ['turn activity opened from the end stays at the end', 'operation opened from the end stays at the end', 'closing from the end stays at the end'] })
}, { width: 1400, height: 900 })
