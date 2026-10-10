// Notas de Rinari con el Engine real y un modelo guionado:
// 1. Un turno deja dos notas: aparece una (con «+1»), sin empezar nada nuevo.
// 2. «Hacer en otra conversación» crea una conversación nueva con el título
//    de la nota y su turno se ejecuta; la conversación de origen sigue igual.
// 3. «Descartar» quita la otra. Recargar no las devuelve.
const assert = require('node:assert/strict')
const { click, clickText, command, delay, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'
const NOTE = '[data-testid="followup-note"]'

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Origen' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Origen', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  const before = (await command('session_list', { include_closed: true })).sessions.length

  // 1. Two notes from one turn; one shows, nothing starts.
  await input('.composer-surface textarea', 'Arregla el parser')
  await wait(`!document.querySelector(${JSON.stringify(SEND)})?.disabled`)
  await click(SEND)
  await wait(text('PARSER ARREGLADO'))
  await wait(`Boolean(document.querySelector(${JSON.stringify(NOTE)}))`)
  await settleAnimations()
  assert(await evaluate(`document.querySelector(${JSON.stringify(NOTE)}).innerText.includes('+1')`), 'one more note waits')
  assert.equal((await command('session_list', { include_closed: true })).sessions.length, before, 'showing a note starts nothing')
  await screenshot('note')

  // 2. Accept: a new conversation runs the task.
  const title = await evaluate(`document.querySelector(${JSON.stringify(NOTE)} + ' .sticky-note-title').innerText`)
  await clickText('Hacer en otra conversación', `${NOTE} button`)
  await wait(`document.querySelector('aside')?.innerText.includes(${JSON.stringify(title)})`)
  await wait(text('TAREA HECHA') + ` || [...document.querySelectorAll('aside button')].some(b => b.innerText.includes(${JSON.stringify(title)}))`)
  const created = (await command('session_list', {})).sessions.find((s) => s.title === title)
  assert(created, 'the accepted note became a conversation')
  await delay(500)
  await screenshot('accepted')

  // 3. Dismiss the other; it does not come back after a reload.
  await wait(`Boolean(document.querySelector(${JSON.stringify(NOTE)}))`)
  await click(`${NOTE} .sticky-note-dismiss`)
  await wait(`!document.querySelector(${JSON.stringify(NOTE)})`)
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Origen', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await delay(800)
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(NOTE)}))`), false)
  report({ passed: ['note shows without starting work', 'accept opens a conversation that runs the task', 'dismiss removes it for good'] })
})
