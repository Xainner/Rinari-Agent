// Preguntas de selección múltiple (user.ask con multi_select):
// 1. Rinari pregunta «¿qué te parece peor?» con multi_select: la tarjeta dice
//    «Puedes elegir varias», las opciones son casillas y no hay radios.
// 2. Marcar no avanza: se marcan dos opciones y «Otra» con su texto, y una se
//    desmarca. «Continuar» solo se habilita con «Otra» escrita.
// 3. La segunda pregunta es de una sola opción y envía.
// 4. El Engine guarda la respuesta como lista, en el orden de las opciones, con
//    el texto de «Otra» al final; el detalle del turno la muestra una por línea.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait } = require('../harness.cjs')

const CARD = '.question-card'
const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}
const boxes = () => evaluate(`[...document.querySelectorAll('${CARD} [role="checkbox"]')].map((b) => [b.innerText.trim(), b.getAttribute('aria-checked')])`)

scenario(async () => {
  await useLocalModel()
  const session = (await command('session_create', { chat: true, title: 'Diseño' })).session
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Diseño', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'No me gusta cómo quedó')
  await click('.composer-surface textarea')
  await key('Enter')
  await release() // user.ask

  // 1. Checkboxes, not radios, and the hint.
  await wait(`Boolean(document.querySelector('${CARD} [role="checkbox"]'))`)
  await settleAnimations()
  assert.ok(await evaluate(text('Puedes elegir varias')), 'the card says several can be picked')
  assert.equal(await evaluate(`document.querySelectorAll('${CARD} [role="radio"]').length`), 0)
  assert.equal(await evaluate(`document.querySelector('${CARD} [role="group"]')?.getAttribute('aria-label')`), '¿Qué te parece peor?')

  // 2. Ticking never moves on.
  await clickText('Muy vacío', `${CARD} [role="checkbox"]`, { includes: true })
  await clickText('No se parece', `${CARD} [role="checkbox"]`, { includes: true })
  await clickText('Los colores', `${CARD} [role="checkbox"]`, { includes: true })
  await clickText('Los colores', `${CARD} [role="checkbox"]`, { includes: true })
  assert.ok(await evaluate(text('¿Qué te parece peor?')), 'still on the first question')
  await clickText('Otra', `${CARD} [role="checkbox"]`)
  const continueDisabled = () => evaluate(`document.querySelector('${CARD} .btn-primary').disabled`)
  assert.equal(await continueDisabled(), true, 'Other ticked with no text cannot go on')
  await input(`${CARD} textarea`, 'El pelo')
  assert.equal(await continueDisabled(), false)
  // The tick is drawn: the mark's clip opens on the ticked boxes only.
  const marks = await evaluate(`[...document.querySelectorAll('${CARD} .question-check')].map((c) => getComputedStyle(c, '::after').clipPath)`)
  assert.deepEqual(await boxes(), [
    ['No se parece a ella', 'true'],
    ['Los colores y el fondo', 'false'],
    ['Muy vacío', 'true'],
    ['Otra', 'true'],
  ])
  assert.equal(marks.filter((clip) => clip === 'inset(0px)').length, 3, `three drawn ticks (${marks})`)
  await screenshot('several-picked')

  // 3. The single-choice question, then send.
  await clickText('Continuar', `${CARD} button`)
  await wait(text('¿Lo rehacemos?'))
  await clickText('Sí, de nuevo', `${CARD} [role="radio"]`, { includes: true })
  await settleAnimations()
  await clickText('Enviar respuestas', `${CARD} button`)
  await release() // reply

  // 4. The Engine keeps a list.
  await wait(text('LO REHAGO'))
  const answered = (await command('question_list', { session_id: session.id })).questions.find((q) => q.status === 'answered')
  assert.deepEqual(answered.answers, { worst: ['No se parece a ella', 'Muy vacío', 'El pelo'], redo: 'Sí, de nuevo' })
  await screenshot('answered')
  report({ passed: ['checkboxes and hint', 'ticking does not advance', 'Other needs its text', 'drawn ticks', 'answer saved as a list in option order'] })
}, { width: 1280, height: 860 })
