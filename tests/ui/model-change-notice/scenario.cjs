// Cambiar de modelo desde el composer y enviar: debajo del primer texto del
// modelo nuevo aparece «Se cambió de modelo de A a B», una sola vez, y sigue
// en su sitio tras reiniciar la app y el Engine.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

const notice = '[data-testid="model-change"]'
const expected = 'Se cambió de modelo de prueba-local a prueba-dos.'

async function send(text, reply) {
  await input('.composer-surface textarea', text)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes(${JSON.stringify(reply)})`)
  await wait(`!document.querySelector('button[aria-label="Detener generación"]')`)
}
const notices = () => evaluate(`[...document.querySelectorAll(${JSON.stringify(notice)})].map(e=>e.textContent)`)
async function noticeFollowsReply() {
  assert.deepEqual(await notices(), [expected])
  // Debajo de la respuesta del modelo nuevo, no en otro sitio.
  assert(await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(notice)});const r=[...document.querySelectorAll('.markdown, [data-testid="turn-result"]')].find(e=>e.textContent.includes('RESPUESTA DOS'));return Boolean(r && (r.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING))})()`))
}

async function exercise() {
  await useLocalModel()
  await command('model_add', { provider: 'prueba-local', provider_model_id: 'fake-dos', alias: 'prueba-dos' })
  await command('session_create', { chat: true, title: 'Cambio de modelo' })
  await reload()
  await clickText('Cambio de modelo', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await send('Hola', 'RESPUESTA UNO')
  assert.deepEqual(await notices(), [], 'no notice for the first model of a conversation')
  await click('.composer-surface button[title="Elegir modelo"]')
  await input('input[placeholder="Buscar modelos…"]', 'prueba-dos')
  await clickText('prueba-dos', '[data-radix-popper-content-wrapper] button', { includes: true })
  await wait(`document.querySelector('.composer-surface button[title="Elegir modelo"]')?.textContent.includes('prueba-dos')`)
  await send('Sigue', 'RESPUESTA DOS')
  await noticeFollowsReply()
  await screenshot('notice')
  await send('Otra vez', 'RESPUESTA TRES')
  assert.deepEqual(await notices(), [expected], 'same model again: no new notice')
  report({ passed: ['no notice for the first model', 'one notice after the first text of the new model', 'no repeat while the model stays'] })
}

async function restart() {
  await clickText('Cambio de modelo', 'aside button', { includes: true })
  await wait(`document.body.innerText.includes('RESPUESTA TRES')`)
  await noticeFollowsReply()
  await screenshot('notice-after-restart')
  report({ passed: ['the notice is rebuilt in place after restarting the app and the Engine'] })
}

scenario(require('../harness.cjs').ui.phase === 'restart' ? restart : exercise, { width: 1400, height: 900 })
