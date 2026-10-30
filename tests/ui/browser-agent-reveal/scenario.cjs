// El navegador de una conversación no se cuela en la siguiente (vista Normal,
// donde cambiar de conversación reutiliza el mismo espacio de trabajo):
// 1. Rinari abre una página por su cuenta (primero un browser.navigate sin
//    pestaña que falla, luego browser.open): el panel lateral muestra el
//    Navegador sin que nadie lo abra.
// 2. Una conversación nueva no hereda el botón Navegador «en vivo».
// 3. Cuando Rinari abre una página en esa conversación nueva, el panel se
//    abre también: antes la app recordaba el «listo» de la anterior y no
//    veía el cambio.
// 4. Una conversación que ya existía y nunca usó el navegador tampoco lo
//    muestra «en vivo» al pasar a ella, aunque haya corrido turnos: cada
//    turno prepara el navegador de su sesión por si lo usa.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, report, scenario, screenshot, settleAnimations, useLocalModel, wait, reload } = require('../harness.cjs')

const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'

const STATE = `(() => {
  const slot = document.querySelector('[data-testid="browser-view-slot"]')
  const r = slot?.getBoundingClientRect()
  const button = document.querySelector('.dock-view-bar [data-view="browser"]')
  return {
    surface: Boolean(document.querySelector('[data-testid="browser-surface"]')),
    slot: r ? [Math.round(r.width), Math.round(r.height)] : null,
    ring: button?.dataset.ring ?? null,
  }
})()`

async function send(message, done) {
  await input('.composer-surface textarea', message)
  await wait(`!document.querySelector(${JSON.stringify(SEND)})?.disabled`)
  await click(SEND)
  await wait(text(done))
  await new Promise((resolve) => setTimeout(resolve, 1500))
  await settleAnimations()
}

async function newConversation() {
  await clickText('Nueva conversación', 'button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Charla' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')

  // 0. «Charla» corre un turno sin navegador.
  await clickText('Charla', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await send('hola', 'HOLA CHARLA')

  // 1. Primera conversación.
  await newConversation()
  await send('abre el navegador y entra a la página', 'PAGINA ABIERTA')
  const first = await evaluate(STATE)
  await screenshot('first')

  // 2. Conversación nueva, sin navegador.
  await newConversation()
  await new Promise((resolve) => setTimeout(resolve, 800))
  const fresh = await evaluate(STATE)
  await screenshot('fresh')

  // 3. Rinari abre una página en la conversación nueva.
  await send('abre otra página', 'SEGUNDA ABIERTA')
  const second = await evaluate(STATE)
  await screenshot('second')

  // 4. Una conversación existente sin navegador.
  await clickText('Charla', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await new Promise((resolve) => setTimeout(resolve, 800))
  const other = await evaluate(STATE)
  await screenshot('other')

  console.log('STATES', JSON.stringify({ first, fresh, second, other }))
  report({ first, fresh, second, other })
  assert(first.surface, 'first conversation: the browser panel shows after Rinari opened a page')
  assert(!fresh.ring, `a new conversation does not inherit the live browser button (${fresh.ring})`)
  assert(second.surface, 'new conversation: the browser panel shows after Rinari opened a page')
  assert(!other.ring, `a conversation that never used the browser does not show it live (${other.ring})`)
})
