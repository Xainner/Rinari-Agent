// Sesiones hijas con el Engine real (plan-sesiones-hijas 5):
// 1. Pedirle a Rinari que lo haga «en otra sesión» abre una hija: aparece en la
//    barra lateral y trabaja su encargo.
// 2. Al terminar, la madre recibe la tarjeta con el informe y, como la abrió
//    Rinari y estaba libre, hace un turno corto: «Informe de «Revisar docs»».
// 3. Un pedido que conviene aparte llega como oferta: «¿Lo hago en una sesión
//    nueva?»; «Hazlo aquí» no abre nada y Rinari sigue en la madre.
// 4. «Abrir» lleva a la hija, cuyo primer mensaje es el encargo de su madre.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, until, useLocalModel, wait } = require('../harness.cjs')

const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
async function send(message) {
  await input('.composer-surface textarea', message)
  await click('.composer-surface textarea')
  await key('Enter')
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Docs' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Docs', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')

  // 1-2. A child opened on request reports back; the free mother goes on.
  await send('Revisa los docs en otra sesión')
  await wait(text('La abrí aparte.'))
  await wait(`[...document.querySelectorAll('aside li')].some((li) => li.textContent.includes('Revisar docs'))`)
  await wait(`Boolean(document.querySelector('[data-testid="child-card"]'))`)
  assert.ok(await evaluate(`document.querySelector('[data-testid="child-card"]').hasAttribute('data-entering')`), 'the new child card enters')
  await wait(`document.querySelector('[data-testid="child-card"]')?.dataset.state === 'completed'`)
  await wait(text('REPORTE: arreglé 2 enlaces rotos.'))
  await wait(`document.querySelector('[data-testid="child-report-separator"]')?.textContent.includes('Revisar docs')`)
  await wait(text('INFORME LEÍDO'))
  await settleAnimations()
  await screenshot('mother-with-report')

  // 3. An offer: «Hazlo aquí» opens nothing.
  await send('Y migra los pagos')
  await wait(`Boolean(document.querySelector('[data-testid="offer-card"]'))`)
  assert.ok(await evaluate(text('¿Lo hago en una sesión nueva?')), 'the offer asks')
  await settleAnimations()
  await screenshot('offer')
  await clickText('Hazlo aquí', '[data-testid="offer-card"] button')
  await wait(text('Lo hago aquí.'))
  const mother = (await command('session_list', {})).sessions.find((s) => s.title === 'Docs')
  const children = await command('session_children_list', { sessionId: mother.id })
  assert.equal(children.children.length, 1, '«Hazlo aquí» opened no child')

  // 4. The child's first message is its mother's brief.
  await clickText('Abrir', '[data-testid="child-card"] button', { includes: true })
  await wait(`Boolean(document.querySelector('[data-testid="child-brief"]'))`)
  await until(async () => (await evaluate(`document.querySelector('[data-testid="child-brief"]').textContent`)).includes('Docs'), 'the brief names its mother')
  await settleAnimations()
  await screenshot('child-brief')
  report({ passed: ['child opened on request', 'report card and mother turn', 'offer with «Hazlo aquí»', 'brief in the child'] })
}, { width: 1280, height: 860 })
