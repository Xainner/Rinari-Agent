// Alcances de una aprobación según la conversación (plan 0.4.0 #56):
// 1. En un chat sin proyecto, Rinari quiere escribir fuera de su carpeta: la
//    tarjeta ofrece «Denegar», «Permitir una vez» y «En este chat», sin
//    «Siempre…», y el motivo sale en español y habla del chat, no de un proyecto.
// 2. «En este chat»: la segunda escritura del mismo chat ya no pregunta.
// 3. Otro chat nuevo vuelve a preguntar: el permiso no salió de su chat.
const assert = require('node:assert/strict')
const { clickText, command, evaluate, input, key, click, reload, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait } = require('../harness.cjs')

const CARD = '.approval-card[data-state="open"]'
const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const buttons = () => evaluate(`[...document.querySelectorAll('${CARD} button')].map((b) => b.textContent.trim())`)
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}
async function send(message) {
  await input('.composer-surface textarea', message)
  await click('.composer-surface textarea')
  await key('Enter')
}
async function open(title) {
  await clickText(title, 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Notas uno' })
  await command('session_create', { chat: true, title: 'Notas dos' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')

  // 1. A loose chat: «in this chat», never «always».
  await open('Notas uno')
  await send('Guarda la nota')
  await release() // fs.write outside the chat folder
  await wait(`Boolean(document.querySelector('${CARD}'))`)
  assert.deepEqual(await buttons(), ['Denegar', 'Permitir una vez', 'En este chat'])
  await wait(text('Escribir fuera de la carpeta de este chat'))
  await settleAnimations()
  await screenshot('loose-chat-card')
  await clickText('En este chat', `${CARD} button`)
  await release() // NOTA UNO
  await wait(text('NOTA UNO'))

  // 2. Same chat: no question this time.
  await send('Guarda otra')
  await release() // fs.write again
  await release() // NOTA DOS
  await wait(text('NOTA DOS'))
  assert.equal(await evaluate(`Boolean(document.querySelector('${CARD}'))`), false, 'the same chat does not ask again')

  // 3. Another chat asks again.
  await open('Notas dos')
  await send('Guarda la nota aquí')
  await release() // fs.write from the other chat
  await wait(`Boolean(document.querySelector('${CARD}'))`)
  await settleAnimations()
  await screenshot('other-chat-asks')
  await clickText('Denegar', `${CARD} button`)
  await release() // NO LA GUARDÉ
  await wait(text('NO LA GUARDÉ'))
  report({ passed: ['loose chat offers in-this-chat and no always', 'reason in the owner language', 'same chat does not ask again', 'another chat asks again'] })
}, { width: 1280, height: 860 })
