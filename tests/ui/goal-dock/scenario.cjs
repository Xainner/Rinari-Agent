// Objetivo de la conversación con el Engine real (plan 0.4.0 #23):
// 1. `/goal …` pone el objetivo: el dock entra sobre el composer en
//    «Persiguiendo», con el arco vivo en la bandera mientras trabaja.
// 2. Rinari informa progreso y el objetivo sigue solo: el turno siguiente
//    aparece como «Continuando el objetivo · 2», no como mensaje del dueño.
// 3. Rinari se bloquea: «Te necesita» con el motivo, «Seguir» y «Darle una
//    pista»; la pista y «Ponerle tope» se abren en línea y Escape las cierra.
// 4. «Seguir» y Rinari lo logra con evidencia: el check se dibuja (se le vio
//    persiguiendo) y el arco se apaga.
// 5. Con poco ancho los botones quedan en icono y conservan su nombre.
const assert = require('node:assert/strict')
const { click, clickText, command, evaluate, input, key, reload, report, scenario, screenshot, settleAnimations, ui, until, useLocalModel, wait } = require('../harness.cjs')

const DOCK = '[data-testid="goal-dock"]'
const SEND = '.composer-surface button[aria-label="Enviar mensaje"]'
const text = (value) => `document.body.innerText.includes(${JSON.stringify(value)})`
const dockState = (state) => `document.querySelector('${DOCK}')?.dataset.state === ${JSON.stringify(state)}`
const pending = () => fetch(new URL('/__pending?lane=main', ui.model)).then((r) => r.json())
async function release() {
  await until(async () => await pending() > 0, 'model waits for the next step')
  assert.equal(await fetch(new URL('/__release?lane=main', ui.model)).then((r) => r.json()), true)
}

scenario(async () => {
  await useLocalModel()
  await command('session_create', { chat: true, title: 'Parser' })
  await reload()
  await click('.view-switcher button[aria-label="Normal"]')
  await clickText('Parser', 'aside li button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  assert.equal(await evaluate(`Boolean(document.querySelector('${DOCK}'))`), false, 'no dock without a goal')

  // 1. Set the goal; the first model call is held so «Persiguiendo» can be seen.
  await input('.composer-surface textarea', '/goal Que pasen las pruebas del parser')
  await wait(`!document.querySelector(${JSON.stringify(SEND)})?.disabled`)
  await click(SEND)
  await wait(dockState('pursuing'))
  assert.equal(await evaluate(`document.querySelector('${DOCK}').hasAttribute('data-enter')`), true, 'the dock enters when the goal is set')
  await wait(`Boolean(document.querySelector('${DOCK} .goal-mark-orbit'))`)
  await wait(`document.querySelector('${DOCK} .goal-chip')?.textContent === 'Persiguiendo'`)
  await settleAnimations()
  const height = await evaluate(`document.querySelector('${DOCK}').offsetHeight`)
  await screenshot('pursuing')

  // 2. Progress, then the goal goes on by itself.
  await release() // goal.update progress
  await release() // AVANCE UNO
  await wait(text('AVANCE UNO'))
  await wait(`[...document.querySelectorAll('[data-testid="goal-separator"]')].some(s => s.textContent === 'Continuando el objetivo · 2')`)
  assert.ok(await evaluate(`[...document.querySelectorAll('[data-testid="goal-separator"]')].some(s => s.textContent === 'Empezando el objetivo')`), 'the first goal turn says it is starting')
  assert.equal(await evaluate(`document.querySelector('${DOCK}').offsetHeight`), height, 'the dock keeps its height while pursuing')

  // 3. Blocked: reason, «Seguir» and «Darle una pista».
  await release() // goal.update blocked
  await release() // NECESITO EL PUERTO
  await wait(dockState('blocked'))
  await wait(text('Necesito saber en qué puerto corre el servidor de pruebas.'))
  assert.equal(await evaluate(`Boolean(document.querySelector('${DOCK} .goal-mark-orbit'))`), false, 'the live arc stops when it is not pursuing')
  await settleAnimations()
  await screenshot('blocked')
  await clickText('Darle una pista', `${DOCK} button`, { includes: true })
  await wait(`document.activeElement?.name === 'hint'`)
  await settleAnimations()
  await screenshot('hint-form')
  await key('Escape')
  await wait(`!document.querySelector('${DOCK} input[name="hint"]')`)
  assert.ok(await evaluate(`Boolean(document.querySelector('.composer-surface'))`), 'Escape only closes the inline form')
  await clickText('Ponerle tope', `${DOCK} button`, { includes: true })
  await wait(`document.activeElement?.name === 'turns'`)
  await settleAnimations()
  await screenshot('cap-form')
  await key('Escape')
  await wait(`!document.querySelector('${DOCK} input[name="turns"]')`)

  // 4. «Seguir»: Rinari reports it achieved with evidence.
  await clickText('Seguir', `${DOCK} button`, { includes: true })
  await release() // goal.update achieved
  await release() // OBJETIVO LISTO
  await wait(dockState('achieved'))
  await wait(text('Evidencia: 42 pruebas pasan en tests/parser'))
  assert.equal(await evaluate(`document.querySelectorAll('${DOCK} .goal-mark svg.r-check').length`), 1, 'the check draws: it was seen pursuing')
  assert.equal(await evaluate(`document.querySelector('${DOCK}').classList.contains('just-achieved')`), true, 'the dock rings once when achieved')
  await settleAnimations()
  await screenshot('achieved')

  // 5. Narrow: icon-only actions keep their accessible name.
  await evaluate(`document.querySelector('${DOCK}').style.width = '440px'`)
  await settleAnimations()
  const narrow = await evaluate(`[...document.querySelectorAll('${DOCK} .goal-action')].map(b => ({ name: b.textContent.trim(), width: b.getBoundingClientRect().width }))`)
  assert.ok(narrow.length > 0 && narrow.every((b) => b.name && b.width <= 27), `icon-only actions with names (${JSON.stringify(narrow)})`)
  await screenshot('narrow')
  await evaluate(`document.querySelector('${DOCK}').style.width = ''`)

  const goal = (await command('session_goal_get', { sessionId: (await command('session_list', {})).sessions.find((s) => s.title === 'Parser').id })).goal
  assert.equal(goal.state, 'achieved')
  report({ passed: ['dock enters on /goal', 'live arc while pursuing', 'goal turn separator', 'blocked with reason, continue and hint', 'inline forms close with Escape', 'check draws when achieved', 'narrow actions keep names'] })
}, { width: 1280, height: 860 })
