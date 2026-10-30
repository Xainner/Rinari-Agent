// Preguntas de varios pasos (plan 0.4.0 #37, #63):
// 1. Rinari hace tres preguntas: un solo botón principal, «Continuar», y unos
//    puntos que dicen en cuál se está.
// 2. Elegir una opción avanza: la pregunta nueva entra desde la derecha
//    (muestreo cuadro a cuadro con requestAnimationFrame).
//    La opción elegida se ve marcada un instante antes de pasar, y la tarjeta
//    crece suave hasta la altura de la pregunta nueva (que tiene más opciones).
// 3. Volver con ‹ la trae desde la izquierda.
// 4. En la última, el botón es «Enviar respuestas» y envía.
// Con RINARI_UI_REDUCED_MOTION=1 la pregunta cambia sin desplazarse.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait } = require('../harness.cjs')

const REDUCED = process.env.RINARI_UI_REDUCED_MOTION === '1'
const CARD = '.question-card'
const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const mainButton = () => evaluate(`document.querySelector('${CARD} .btn-primary')?.textContent.trim()`)
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}

/** Clicks and samples the horizontal offset of the incoming question for ~500 ms (the chosen option shows marked for an instant first). */
async function stepAndSample(selector) {
  return evaluate(`new Promise((resolve) => {
    const xs = []
    const hs = []
    let marked = false
    const stage = () => document.querySelector('${CARD} .question-stage')
    const from = Math.round(stage().getBoundingClientRect().height)
    document.querySelector(${JSON.stringify(selector)}).click()
    const start = performance.now()
    const frame = () => {
      const step = document.querySelector('${CARD} .question-step')
      if (step) xs.push(new DOMMatrixReadOnly(getComputedStyle(step).transform).m41)
      hs.push(Math.round(stage().getBoundingClientRect().height))
      if (document.querySelector('${CARD} .question-ghost .question-option.is-on')) marked = true
      if (performance.now() - start < 520) requestAnimationFrame(frame)
      else resolve({ xs, hs, from, marked })
    }
    requestAnimationFrame(frame)
  })`)
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Viaje' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Viaje', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  await input('.composer-surface textarea', 'Ayúdame a planear')
  await click('.composer-surface textarea')
  await key('Enter')
  await release() // user.ask with three questions

  // 1. One main button and the dots.
  await wait(`Boolean(document.querySelector('${CARD}'))`)
  await settleAnimations()
  assert.equal(await mainButton(), 'Continuar')
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${CARD} .question-dot')].map((d) => d.dataset.state)`), ['current', 'pending', 'pending'])
  await screenshot('first-question')

  // 2. Choosing an option moves forward: in from the right.
  const sample = await stepAndSample(`${CARD} [role="radio"]`)
  const forward = sample.xs
  await wait(text('¿Cuántos días?'))
  const to = sample.hs.at(-1)
  assert.ok(to > sample.from + 20, `the card grows to the longer question (${sample.from} → ${to})`)
  if (REDUCED) assert.ok(forward.every((x) => Math.abs(x) < 0.5), `no slide with reduced motion (${forward})`)
  else {
    assert.ok(forward.some((x) => x > 4), `it comes in from the right (${forward})`)
    assert.ok(Math.abs(forward.at(-1)) < 0.5, `it settles in place (${forward})`)
    assert.ok(sample.marked, 'the chosen option shows marked before moving on')
    assert.ok(sample.hs.some((h) => h > sample.from + 2 && h < to - 2), `the height grows smoothly (${sample.hs})`)
  }
  await settleAnimations()
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${CARD} .question-dot')].map((d) => d.dataset.state)`), ['answered', 'current', 'pending'])

  // 3. Back: in from the left.
  const back = (await stepAndSample(`${CARD} button[aria-label="Pregunta anterior"]`)).xs
  await wait(text('¿A dónde vamos?'))
  if (!REDUCED) assert.ok(back.some((x) => x < -4), `back comes in from the left (${back})`)
  await settleAnimations()

  // 4. Through to the last one, which sends.
  await clickText('Continuar', `${CARD} button`)
  await wait(text('¿Cuántos días?'))
  await clickText('Tres', `${CARD} [role="radio"]`, { includes: true })
  await wait(text('¿Con quién?'))
  await clickText('Sola', `${CARD} [role="radio"]`, { includes: true })
  await until(async () => await mainButton() === 'Enviar respuestas', 'the last question sends')
  await settleAnimations()
  await screenshot('last-question')
  await clickText('Enviar respuestas', `${CARD} button`)
  await release() // PLAN LISTO
  await wait(text('PLAN LISTO'))
  report({ passed: ['one main button', 'progress dots', REDUCED ? 'no slide with reduced motion' : 'forward and back slide from their side', REDUCED ? 'height follows the question' : 'chosen option marked, height grows smoothly', 'last question sends'] })
}, { width: 1280, height: 860 })
