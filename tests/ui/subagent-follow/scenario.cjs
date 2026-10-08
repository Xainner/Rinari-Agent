// «Ver actividad» de un subagente sigue su final mientras se lee abajo, se
// pausa al subir (solo en esa tarjeta) y vuelve con «Ir al final». El
// subagente avanza paso a paso: el modelo falso retiene cada respuesta suya.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, until, useLocalModel, wait, delay, ui } = require('../harness.cjs')

const card = '[data-testid="agent-card"]'
const box = '[data-testid="agent-activity"]'
const atEnd = `(() => {const el=document.querySelector(${JSON.stringify(box)});return el.scrollHeight-el.scrollTop-el.clientHeight<=24})()`
const release = () => fetch(new URL('/__release?lane=sub', ui.model).toString()).then((r) => r.json())
const pending = () => fetch(new URL('/__pending?lane=sub', ui.model).toString()).then((r) => r.json())

async function step(n) {
  await until(async () => (await pending()) > 0, 'subagent step ' + n + ' reaches the model')
  assert.equal(await release(), true)
  await wait(`document.querySelector(${JSON.stringify(box)})?.textContent.includes(${JSON.stringify('Paso ' + n + ' del subagente')})`)
  await delay(250)
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Subagente' })
  await reload()
  await clickText('Subagente', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Revisa esto con un subagente')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await click('button[aria-label="Ver actividad del turno"]')
  await wait(`Boolean(document.querySelector(${JSON.stringify(card)}))`)
  await step(1)
  await click(card + ' > summary')
  await wait(`document.querySelector(${JSON.stringify(card)}).open`)
  await step(2)
  await step(3)
  assert(await evaluate(`document.querySelector(${JSON.stringify(box)}).scrollHeight > document.querySelector(${JSON.stringify(box)}).clientHeight + 200`), 'the activity overflows its box')
  await wait(atEnd)
  await screenshot('following')
  const outer = await evaluate(`document.querySelector('.conversation-enter > .overflow-y-auto').scrollTop`)
  await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(box)});el.scrollTop=0;el.dispatchEvent(new Event('scroll'))})()`)
  await wait(`[...document.querySelectorAll(${JSON.stringify(card + ' button')})].some(b=>b.textContent==='Ir al final')`)
  await step(4)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(box)}).scrollTop`), 0, 'reading up pauses the follow')
  await screenshot('paused')
  await clickText('Ir al final', card + ' button')
  await wait(atEnd)
  await step(5)
  await wait(atEnd)
  // El resumen final también queda a la vista.
  await until(async () => (await pending()) > 0, 'subagent summary reaches the model')
  await release()
  await wait(`document.body.innerText.includes('FIN DEL COORDINADOR')`)
  await wait(atEnd)
  await screenshot('finished')
  assert.equal(await pending(), 0)
  report({ passed: ['opens at the end while running', 'follows new steps', 'pauses when reading up', 'Ir al final resumes', 'final summary stays in view'], outerScrollTop: outer })
}, { width: 1400, height: 900 })
