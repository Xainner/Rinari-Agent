// Una conversación nueva toma un título que resume la intención del primer
// mensaje (no el mensaje recortado) y la barra lateral lo muestra en cuanto
// el Engine lo guarda, con el turno todavía en marcha.
const assert = require('node:assert/strict')
const { delay, evaluate, input, click, reload, report, scenario, screenshot, until, useLocalModel, wait, ui } = require('../harness.cjs')

const first = 'Recitame un poema en frances sobre porque los huskies son excelentes perros'

scenario(async () => {
  await useLocalModel()
  await reload()
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nueva conversación') && b.textContent.includes('Ctrl')).click()`)
  // Un borrador: la sesión se crea al enviar.
  await wait('Boolean(document.querySelector(".composer-surface textarea"))')
  await delay(300)
  await input('.composer-surface textarea', first)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  // El modelo falso retiene la respuesta principal: el título llega antes.
  await wait(`document.querySelector('aside')?.innerText.includes('Poema francés sobre los huskies')`)
  assert(await evaluate(`Boolean(document.querySelector('button[aria-label="Detener generación"]'))`), 'the turn is still running')
  assert.equal(await evaluate(`document.querySelector('aside').innerText.includes('Recitame un poema')`), false)
  await screenshot('title-mid-turn')
  const pending = () => fetch(new URL('/__pending?lane=main', ui.model).toString()).then((r) => r.json())
  await until(async () => (await pending()) > 0, 'the main request reaches the model')
  await fetch(new URL('/__release?lane=main', ui.model).toString())
  await wait(`document.body.innerText.includes('Les huskies')`)
  await wait(`!document.querySelector('button[aria-label="Detener generación"]')`)
  await screenshot('title-after-turn')
  report({ passed: ['semantic title from the first message', 'sidebar shows it while the turn runs'] })
}, { width: 1400, height: 900 })
